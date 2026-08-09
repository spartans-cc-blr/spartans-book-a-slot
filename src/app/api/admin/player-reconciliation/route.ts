// GET  /api/admin/player-reconciliation — list analytics-DB player_name
//      strings that still have player_id IS NULL, bucketed into
//      auto_resolved (already covered by a known alias/override, just
//      needs a backfill write), suggested (fuzzy-matched Hub candidates),
//      and no_match (probably an opponent player, never a Hub member).
//      Read-only — does not write anything, including a squad-
//      disambiguation attempt (that's POST mode 'reconcile', see below).
// POST /api/admin/player-reconciliation — three modes:
//      'confirm'   — admin picks a player_id for a scorecard_name, global
//                     (player_name_aliases) or match-scoped
//                     (match_name_overrides) for true collisions.
//      'ignore'    — mark a scorecard_name as a known non-Hub-member
//                     (almost always an opponent player).
//      'reconcile' — process one scorecard_name: apply any already-known
//                     alias/override to its remaining NULL rows, and
//                     attempt squad-disambiguation for anything still
//                     unresolved. This is what the "Run reconciliation
//                     pass" client loop calls once per name, mirroring
//                     /api/admin/scorecard-backfill's one-booking-per-POST
//                     pattern.
//
// Admin-only throughout (requireAdmin(), same as every other /api/admin/*
// route). All analytics-DB access is server-side only via
// ANALYTICS_SUPABASE_KEY — never exposed to the client. player_id values
// submitted by the admin's browser are validated against the live Hub
// players table before being written anywhere (an admin's browser is still
// "the client").

import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { createServiceClient } from '@/lib/supabase'
import { RATE_LIMITS, rateLimit } from '@/lib/rateLimit'
import { playerReconciliationRequestSchema } from '@/lib/schemas'
import { suggestPlayers } from '@/lib/nameMatch'
import {
  createAnalyticsClient,
  resolvePlayerName,
  backfillPlayerIdForName,
  resyncBookingsForMatchIds,
} from '@/lib/playerIdentityResolution'

async function requireAdmin() {
  const session = await getServerSession(authOptions)
  const user = session?.user as any
  if (!user?.isAdmin) return { deny: NextResponse.json({ error: 'Unauthorised' }, { status: 403 }), user: null }
  return { deny: null, user }
}

const STAT_TABLES = ['batting_stats', 'bowling_stats', 'fielding_stats', 'team_list'] as const

export async function GET() {
  const { deny } = await requireAdmin()
  if (deny) return deny

  const analytics = createAnalyticsClient()
  if (!analytics) return NextResponse.json({ error: 'Analytics database is not configured' }, { status: 500 })

  const hub = createServiceClient()

  // Distinct (player_name -> set of match_ids) across all four tables,
  // restricted to rows still missing player_id.
  const nameToMatches = new Map<string, Set<string>>()
  for (const table of STAT_TABLES) {
    const { data, error } = await analytics.from(table).select('match_id, player_name').is('player_id', null)
    if (error) return NextResponse.json({ error: `${table}: ${error.message}` }, { status: 500 })
    for (const row of data ?? []) {
      const name = (row as any).player_name
      const mid = (row as any).match_id
      if (!name || !mid) continue
      if (!nameToMatches.has(name)) nameToMatches.set(name, new Set())
      nameToMatches.get(name)!.add(mid)
    }
  }

  if (nameToMatches.size === 0) {
    return NextResponse.json({ auto_resolved: [], suggested: [], no_match: [] })
  }

  const [{ data: ignored }, { data: aliases }, { data: overrides }, { data: roster }] = await Promise.all([
    analytics.from('ignored_names').select('scorecard_name'),
    analytics.from('player_name_aliases').select('scorecard_name, player_id'),
    analytics.from('match_name_overrides').select('match_id, scorecard_name, player_id'),
    hub.from('players').select('id, name, jersey_number, cricheroes_url, cricheroes_player_id'),
  ])

  const rosterById = new Map((roster ?? []).map((p: any) => [p.id, p]))

  const ignoredSet = new Set((ignored ?? []).map((r: any) => r.scorecard_name))
  const aliasMap = new Map((aliases ?? []).map((r: any) => [r.scorecard_name, r.player_id]))
  const overrideKeys = new Set((overrides ?? []).map((r: any) => `${r.match_id}::${r.scorecard_name}`))

  const allMatchIds = Array.from(new Set(Array.from(nameToMatches.values()).flatMap(s => Array.from(s))))
  const { data: bookingRows } = await hub
    .from('bookings')
    .select('match_id, game_date, opponent_name')
    .in('match_id', allMatchIds)
  const bookingByMatchId = new Map((bookingRows ?? []).map((b: any) => [b.match_id, b]))

  const autoResolved: any[] = []
  const suggested: any[] = []
  const noMatch: any[] = []

  for (const [name, matchIds] of Array.from(nameToMatches.entries())) {
    if (ignoredSet.has(name)) continue

    const matches = Array.from(matchIds).map(mid => ({
      match_id:      mid,
      game_date:     bookingByMatchId.get(mid)?.game_date ?? null,
      opponent_name: bookingByMatchId.get(mid)?.opponent_name ?? null,
    }))

    const hasAlias = aliasMap.has(name)
    const fullyCoveredByOverrides = Array.from(matchIds).every(mid => overrideKeys.has(`${mid}::${name}`))

    if (hasAlias || fullyCoveredByOverrides) {
      // Already resolved — just needs backfillPlayerIdForName re-applied to
      // catch rows added since the alias/override was confirmed. No admin
      // decision required; the "Run reconciliation pass" loop handles this.
      autoResolved.push({ scorecard_name: name, matches })
      continue
    }

    const suggestions = suggestPlayers(name, roster ?? []).map(s => ({
      ...s,
      jersey_number:  rosterById.get(s.id)?.jersey_number ?? null,
      // Manual cross-check aid only — never used for auto-matching. The
      // scorecard PDF pipeline has no CricHeroes player ID to join
      // against, so this just lets the admin open both profiles and
      // eyeball that it's the same person before confirming.
      cricheroes_url: rosterById.get(s.id)?.cricheroes_url ?? null,
      // Surfaced so the UI can prompt the admin when confirming a match
      // for a player who hasn't linked a CricHeroes profile yet — see
      // features/player-identity-resolution.md §3.1.
      cricheroes_player_id: rosterById.get(s.id)?.cricheroes_player_id ?? null,
    }))
    const entry = { scorecard_name: name, matches, suggestions }
    if (suggestions.length > 0) suggested.push(entry)
    else noMatch.push(entry)
  }

  return NextResponse.json({
    auto_resolved: autoResolved,
    suggested,
    no_match: noMatch,
    // Full roster for the manual search-and-pick fallback in the UI —
    // small club roster (~150), cheap to send whole.
    roster: (roster ?? []).map((p: any) => ({
      id: p.id, name: p.name, jersey_number: p.jersey_number, cricheroes_url: p.cricheroes_url,
      cricheroes_player_id: p.cricheroes_player_id,
    })),
  })
}

export async function POST(req: NextRequest) {
  const { deny, user } = await requireAdmin()
  if (deny) return deny

  const limited = await rateLimit(req, RATE_LIMITS.adminWrite, user.playerId)
  if (limited) return limited

  const body = await req.json().catch(() => null)
  const parsed = playerReconciliationRequestSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'Invalid request' }, { status: 400 })
  }

  const analytics = createAnalyticsClient()
  if (!analytics) return NextResponse.json({ error: 'Analytics database is not configured' }, { status: 500 })
  const hub = createServiceClient()

  if (parsed.data.mode === 'ignore') {
    const { error } = await analytics
      .from('ignored_names')
      .upsert({ scorecard_name: parsed.data.scorecard_name }, { onConflict: 'scorecard_name' })
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ ok: true })
  }

  if (parsed.data.mode === 'confirm') {
    const { scorecard_name, player_id, scope } = parsed.data

    // Never trust a client-supplied player_id — confirm it's a real Hub
    // player before writing it anywhere in the analytics DB. Also fetch
    // cricheroes_player_id here (server-side, not client-supplied) so it
    // can be snapshotted alongside player_id — see
    // analytics-db/migrations/002_alias_cricheroes_player_id.sql.
    const { data: player, error: playerErr } = await hub
      .from('players')
      .select('id, cricheroes_player_id')
      .eq('id', player_id)
      .maybeSingle()
    if (playerErr) return NextResponse.json({ error: playerErr.message }, { status: 500 })
    if (!player) return NextResponse.json({ error: 'player_id does not match a known Hub player' }, { status: 400 })

    const cricheroes_player_id = player.cricheroes_player_id ?? null

    if (scope === 'global') {
      const { error } = await analytics
        .from('player_name_aliases')
        .upsert({ scorecard_name, player_id, cricheroes_player_id }, { onConflict: 'scorecard_name' })
      if (error) return NextResponse.json({ error: error.message }, { status: 500 })

      const result = await backfillPlayerIdForName({ analytics, scorecardName: scorecard_name, playerId: player_id })
      if (result.error) return NextResponse.json({ error: result.error }, { status: 500 })
      const { resynced, failed } = await resyncBookingsForMatchIds(result.matchIds, user.playerId ?? null)
      return NextResponse.json({
        ok: true, updated: result.updated, cricheroes_player_id, resynced, resync_failed: failed,
      })
    }

    // Match-scoped override
    const { error } = await analytics
      .from('match_name_overrides')
      .upsert(
        { match_id: scope.match_id, scorecard_name, player_id, resolved_via: 'admin', cricheroes_player_id },
        { onConflict: 'match_id,scorecard_name' }
      )
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    const result = await backfillPlayerIdForName({
      analytics, scorecardName: scorecard_name, playerId: player_id, matchId: scope.match_id,
    })
    if (result.error) return NextResponse.json({ error: result.error }, { status: 500 })
    // Always attempt a resync for this one known match, even if `updated`
    // came back 0 — the analytics rows may already have carried this
    // player_id from an earlier pass while the Hub-side cache never
    // caught up.
    const { resynced, failed } = await resyncBookingsForMatchIds([scope.match_id], user.playerId ?? null)
    return NextResponse.json({ ok: true, updated: result.updated, resynced, resync_failed: failed })
  }

  // mode === 'reconcile' — process every match this name still has an
  // unresolved row for: apply a known alias/override (self-healing), or
  // attempt squad disambiguation for anything still ambiguous.
  const { scorecard_name } = parsed.data

  const remainingMatchIds = new Set<string>()
  for (const table of STAT_TABLES) {
    const { data, error } = await analytics
      .from(table)
      .select('match_id')
      .eq('player_name', scorecard_name)
      .is('player_id', null)
    if (error) return NextResponse.json({ error: `${table}: ${error.message}` }, { status: 500 })
    for (const row of data ?? []) if ((row as any).match_id) remainingMatchIds.add((row as any).match_id)
  }

  let updated = 0
  const stillUnresolved: string[] = []
  const touchedMatchIds = new Set<string>()
  for (const matchId of Array.from(remainingMatchIds)) {
    const resolved = await resolvePlayerName({ analytics, hub, matchId, scorecardName: scorecard_name })
    if (resolved.player_id) {
      const result = await backfillPlayerIdForName({
        analytics, scorecardName: scorecard_name, playerId: resolved.player_id, matchId,
      })
      if (result.error) return NextResponse.json({ error: result.error }, { status: 500 })
      updated += result.updated
      if (result.updated > 0) touchedMatchIds.add(matchId)
    } else {
      stillUnresolved.push(matchId)
    }
  }

  // One batched pass over every match this run actually wrote a new
  // player_id for, rather than a resync per matchId inside the loop above
  // — see resyncBookingsForMatchIds() for why this is needed at all.
  const { resynced, failed } = await resyncBookingsForMatchIds(Array.from(touchedMatchIds), user.playerId ?? null)

  return NextResponse.json({
    ok: true, updated, still_unresolved_matches: stillUnresolved, resynced, resync_failed: failed,
  })
}
