// Player identity resolution — maps analytics-DB player_name strings to Hub
// players.id. See .claude/rules/features/player-identity-resolution.md.
//
// Precedence order, tried per (match_id, scorecard_name):
//   1. match_name_overrides  — exact (match_id, scorecard_name) match
//   2. player_name_aliases   — exact scorecard_name match (global default)
//   3. squad disambiguation  — auto-resolve only when scorecard_name maps to
//      more than one Hub player AND exactly one of those candidates is in
//      that match's squad. Writes the result into match_name_overrides so
//      it is never recomputed. The only fully-automatic path — everything
//      else requires an admin to confirm via
//      POST /api/admin/player-reconciliation.
//   4. unresolved             — surfaced in the admin reconciliation queue.
//
// Does not touch the match-linkage pipeline (bookings.match_id ->
// match_stats_cache) — that is unrelated and already correct.

import { SupabaseClient, createClient as createSupabaseClient } from '@supabase/supabase-js'
import { createServiceClient } from '@/lib/supabase'

export function createAnalyticsClient(): SupabaseClient | null {
  const url = process.env.ANALYTICS_SUPABASE_URL
  const key = process.env.ANALYTICS_SUPABASE_KEY
  if (!url || !key) return null
  return createSupabaseClient(url, key, { auth: { persistSession: false } })
}

export type ResolvedVia = 'match_override' | 'alias' | 'squad_disambiguation' | 'unresolved'

export interface ResolvedName {
  player_id:    string | null
  resolved_via: ResolvedVia
}

// Step 1 + 2 only — cheap lookups, no writes. Used when the caller already
// has the override/alias maps loaded in bulk (the reconciliation GET route)
// to avoid a round trip per name.
export function resolveFromKnownMaps(
  matchId: string,
  scorecardName: string,
  overrides: Map<string, string>, // key: `${matchId}::${scorecardName}` -> player_id
  aliases: Map<string, string>    // key: scorecardName -> player_id
): ResolvedName {
  const overrideHit = overrides.get(`${matchId}::${scorecardName}`)
  if (overrideHit) return { player_id: overrideHit, resolved_via: 'match_override' }

  const aliasHit = aliases.get(scorecardName)
  if (aliasHit) return { player_id: aliasHit, resolved_via: 'alias' }

  return { player_id: null, resolved_via: 'unresolved' }
}

// Full precedence chain for one (match_id, scorecard_name), including the
// squad-disambiguation auto-resolve (step 3), which writes to
// match_name_overrides on success. Safe to call repeatedly — idempotent.
export async function resolvePlayerName(opts: {
  analytics: SupabaseClient
  hub?: ReturnType<typeof createServiceClient>
  matchId: string
  scorecardName: string
}): Promise<ResolvedName> {
  const { analytics, matchId, scorecardName } = opts
  const hub = opts.hub ?? createServiceClient()

  // Step 1 — match-scoped override
  const { data: override } = await analytics
    .from('match_name_overrides')
    .select('player_id')
    .eq('match_id', matchId)
    .eq('scorecard_name', scorecardName)
    .maybeSingle()
  if (override?.player_id) return { player_id: override.player_id, resolved_via: 'match_override' }

  // Step 2 — global alias
  const { data: alias } = await analytics
    .from('player_name_aliases')
    .select('player_id')
    .eq('scorecard_name', scorecardName)
    .maybeSingle()
  if (alias?.player_id) return { player_id: alias.player_id, resolved_via: 'alias' }

  // Step 3 — squad disambiguation. Only fires on a genuine same-name
  // collision (2+ Hub players share this exact name) where exactly one of
  // them is in this match's squad.
  const { data: candidates } = await hub
    .from('players')
    .select('id, name')
  const normalisedTarget = scorecardName.trim().toLowerCase()
  const nameMatches = (candidates ?? []).filter(
    p => (p.name ?? '').trim().toLowerCase() === normalisedTarget
  )

  if (nameMatches.length > 1) {
    const { data: bookingRows } = await hub
      .from('bookings')
      .select('id')
      .eq('match_id', matchId)
    // Ambiguous match_id -> bookings mapping (should not happen, but a
    // second confirmed booking sharing a match_id is not something this
    // function should guess through) — treat as unresolved.
    if (bookingRows?.length === 1) {
      const { data: squadRows } = await hub
        .from('squad')
        .select('player_id')
        .eq('booking_id', bookingRows[0].id)
      const squadIds = new Set((squadRows ?? []).map(r => r.player_id))
      const inSquad = nameMatches.filter(p => squadIds.has(p.id))

      if (inSquad.length === 1) {
        const resolvedId = inSquad[0].id
        await analytics.from('match_name_overrides').upsert(
          { match_id: matchId, scorecard_name: scorecardName, player_id: resolvedId, resolved_via: 'squad_disambiguation' },
          { onConflict: 'match_id,scorecard_name' }
        )
        return { player_id: resolvedId, resolved_via: 'squad_disambiguation' }
      }
    }
  }

  return { player_id: null, resolved_via: 'unresolved' }
}

// Applies an already-known resolution (override, alias, or a freshly-run
// squad disambiguation) to every row across the four analytics tables that
// still has player_id IS NULL for this (match_id, scorecard_name). Used
// both right after an admin confirms a new alias/override, and by the
// "Run reconciliation pass" backfill loop for rows added since the last
// pass (see Part F).
export async function backfillPlayerIdForName(opts: {
  analytics: SupabaseClient
  matchId?: string // when set, scopes the backfill to one match (override); otherwise all matches (alias)
  scorecardName: string
  playerId: string
}): Promise<{ updated: number; error?: string }> {
  const { analytics, matchId, scorecardName, playerId } = opts
  const tables = ['batting_stats', 'bowling_stats', 'fielding_stats', 'team_list'] as const

  let updated = 0
  for (const table of tables) {
    let query = analytics
      .from(table)
      .update({ player_id: playerId })
      .eq('player_name', scorecardName)
      .is('player_id', null)
    if (matchId) query = query.eq('match_id', matchId)

    const { data, error } = await query.select('match_id')
    if (error) return { updated, error: `${table}: ${error.message}` }
    updated += data?.length ?? 0
  }
  return { updated }
}
