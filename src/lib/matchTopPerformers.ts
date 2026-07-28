// Resolves a match's "top performer(s)" — the same highlight already shown
// to every viewer as gold text in ScorecardTables.tsx (top run-scorer, top
// wicket-taker), just also resolved to a Hub player_id so it can be used as
// an authorization input, not only a display cue. Deliberately reuses that
// exact isTop logic (strict max, all ties included) rather than introducing
// a separate combined-score model, so "why can this player verify" always
// matches "why is this name gold on the scorecard".
//
// See features/post-match-scorecard.md §14/§15 for how this feeds the
// verify-scorecard / flag-reconciliation per-booking auth check.

import { createServiceClient } from '@/lib/supabase'

export interface SquadRef {
  player_id:   string
  player_name: string
  // Optional — callers that only need the auth check (scorecardAuth.ts)
  // never fetch it; callers that build the wrangler-only share message
  // (PerformerShareButton.tsx) do. Never sent to a non-wrangler/admin
  // viewer — see the per-viewer redaction in /api/matches/history.
  whatsapp?:   string | null
}

export type TopPerformerReason = 'top_scorer' | 'top_wicket_taker'

export interface TopPerformer {
  player_id: string | null
  name:      string
  reason:    TopPerformerReason
  statLine:  string
  whatsapp:  string | null
}

// Analytics DB field names aren't part of this repo's schema, so every
// lookup tries a couple of likely keys rather than assuming one exact shape
// — same defensive pattern as ScorecardTables.tsx's pickField/num.
function pickField(row: any, keys: string[]): any {
  for (const k of keys) if (row?.[k] != null) return row[k]
  return null
}

function num(row: any, keys: string[]): number {
  const v = pickField(row, keys)
  return v != null ? Number(v) : 0
}

// Same resolution order as ScorecardTables.tsx's findPlayerId — prefers the
// analytics row's own player_id (set once reconciled, see
// playerIdentityResolution.ts) over a case-insensitive name match against
// this booking's squad. Opponent players and unreconciled rows resolve to
// null and are simply not grantable access. Returns the whole matched
// squad row (not just the id) so callers can also pull whatsapp off it
// without a second lookup.
function resolveSquadMatch(row: any, name: string, squad: SquadRef[]): SquadRef | null {
  const rowPlayerId = pickField(row, ['player_id'])
  if (rowPlayerId) {
    const byId = squad.find(p => p.player_id === rowPlayerId)
    if (byId) return byId
  }
  const byName = squad.find(p => p.player_name?.trim().toLowerCase() === name?.trim().toLowerCase())
  return byName ?? null
}

export function computeTopPerformers(batting: any[], bowling: any[], squad: SquadRef[]): TopPerformer[] {
  const battingRows = (batting ?? []).filter(row =>
    pickField(row, ['dismissal_method']) !== 'did_not_bat' && num(row, ['balls', 'balls_faced']) > 0
  )
  const bowlingRows = (bowling ?? []).filter(row => num(row, ['overs', 'overs_bowled']) > 0)

  const topBatRuns  = battingRows.reduce((max, r) => Math.max(max, num(r, ['runs', 'total_runs'])), 0)
  const topBowlWkts = bowlingRows.reduce((max, r) => Math.max(max, num(r, ['wickets', 'wickets_taken'])), 0)

  const performers: TopPerformer[] = []

  if (topBatRuns > 0) {
    for (const row of battingRows) {
      if (num(row, ['runs', 'total_runs']) !== topBatRuns) continue
      const name  = pickField(row, ['player_name', 'name']) ?? 'Unknown'
      const match = resolveSquadMatch(row, name, squad)
      performers.push({
        player_id: match?.player_id ?? null,
        name,
        reason:    'top_scorer',
        statLine:  `${topBatRuns} runs (${num(row, ['balls', 'balls_faced'])}b)`,
        whatsapp:  match?.whatsapp ?? null,
      })
    }
  }

  if (topBowlWkts > 0) {
    for (const row of bowlingRows) {
      if (num(row, ['wickets', 'wickets_taken']) !== topBowlWkts) continue
      const name  = pickField(row, ['player_name', 'name']) ?? 'Unknown'
      const match = resolveSquadMatch(row, name, squad)
      performers.push({
        player_id: match?.player_id ?? null,
        name,
        reason:    'top_wicket_taker',
        statLine:  `${topBowlWkts}/${num(row, ['runs', 'runs_conceded'])} (${pickField(row, ['overs', 'overs_bowled']) ?? '—'} ov)`,
        whatsapp:  match?.whatsapp ?? null,
      })
    }
  }

  return performers
}

export function topPerformerPlayerIds(performers: TopPerformer[]): Set<string> {
  return new Set(performers.filter(p => p.player_id).map(p => p.player_id as string))
}

// Server-side resolver for routes that only have a booking_id in hand (the
// verify-scorecard / flag-reconciliation auth check) — pages that already
// fetched match_stats_cache + squad for their own rendering (the standalone
// match page, the history list) should call computeTopPerformers directly
// on that data instead of paying for a second round trip here.
export async function resolveMatchTopPerformers(
  supabase: ReturnType<typeof createServiceClient>,
  bookingId: string
): Promise<TopPerformer[]> {
  const [{ data: statsRow }, { data: squadRows }] = await Promise.all([
    supabase.from('match_stats_cache').select('batting, bowling').eq('booking_id', bookingId).maybeSingle(),
    supabase.from('squad').select('player_id, players(name)').eq('booking_id', bookingId),
  ])
  if (!statsRow) return []

  const squad: SquadRef[] = (squadRows ?? []).map((r: any) => ({
    player_id:   r.player_id,
    player_name: r.players?.name ?? '',
  }))

  return computeTopPerformers(statsRow.batting ?? [], statsRow.bowling ?? [], squad)
}
