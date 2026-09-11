// Team-level stats — the data layer behind /team-stats ("Team Record").
// See features/team-stats.md.
//
// Server-only: reads the Hub DB via the service-role client and the
// analytics DB (toss) via ANALYTICS_SUPABASE_KEY. Never import into a
// 'use client' file. The page imports getTeamMatches(); the client-side
// TeamSplitTable only ever receives already-aggregated, serialisable rows.
//
// Scope: Hub-linked matches only — a confirmed booking with a match_id
// whose scorecard has synced into match_stats_cache. That's the same
// "bookings.match_id <-> analytics match_id bridge" every player-stats
// surface uses (src/lib/playerStats.ts), so the team record and the
// leaderboard can never disagree about which matches count. The ~170
// analytics-DB matches that predate the Hub have no booking, and therefore
// no format/ground/stage — deliberately out of scope (decision recorded in
// features/team-stats.md §2).
//
// Everything downstream of the fetch is a pure function over TeamMatch[]
// (teamStatsCore.ts) — at the club's scale (low hundreds of matches, ever)
// one fetch + in-memory slicing is both simpler and faster than a query
// per split.

import { createServiceClient } from '@/lib/supabase'
import { createAnalyticsClient } from '@/lib/playerIdentityResolution'
import { normaliseResult, type TeamMatch } from '@/lib/teamStatsCore'

// The pure half (types, filters, aggregators) lives in teamStatsCore.ts so
// client components can import it without dragging this file's
// server-only imports into the browser bundle. Re-exported here so the
// Server Component page can import everything from one place.
export * from '@/lib/teamStatsCore'

// ── Fetch ──────────────────────────────────────────────────────────────────

function num(v: any): number | null {
  if (v === null || v === undefined || v === '') return null
  const n = Number(v)
  return Number.isFinite(n) ? n : null
}

function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = []
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size))
  return out
}

export async function getTeamMatches(): Promise<TeamMatch[]> {
  const hub = createServiceClient()

  // Every confirmed booking that has a synced scorecard. Cancelled rows
  // are excluded for the same reason getScopedMatchIds() excludes them — a
  // rescheduled match keeps its match_id on the cancelled row too.
  const { data: bookings, error: bErr } = await hub
    .from('bookings')
    .select(`
      id, game_date, slot_time, format, match_id, opponent_name, opponent_id,
      tournament_id, ground_id, venue, match_stage, stage_type,
      tournament:tournaments!bookings_tournament_id_fkey(id, name, is_practice),
      ground:grounds!bookings_ground_id_fkey(id, name),
      opponent:opponents!bookings_opponent_id_fkey(id, name, is_marquee)
    `)
    .eq('status', 'confirmed')
    .not('match_id', 'is', null)
    .order('game_date', { ascending: false })
    .order('slot_time', { ascending: false })
    .range(0, 4999)
  if (bErr) throw new Error(bErr.message)

  const rows = (bookings ?? []) as any[]
  if (rows.length === 0) return []

  const bookingIds = rows.map(b => b.id as string)
  const matchIds   = Array.from(new Set(rows.map(b => b.match_id as string)))

  // match_stats_cache is keyed by match_id; a booking without a synced
  // scorecard simply has no row here and is dropped below.
  const cacheRows: any[] = []
  const squadRows: any[] = []
  const tossRows:  any[] = []
  const analytics = createAnalyticsClient()

  await Promise.all([
    ...chunk(bookingIds, 200).map(async ids => {
      const { data, error } = await hub
        .from('match_stats_cache')
        .select('booking_id, match_id, match_result, team_total, team_wickets, team_overs, opponent_total, opponent_wickets, opponent_overs, opponent_name')
        .in('booking_id', ids)
      if (error) throw new Error(error.message)
      cacheRows.push(...(data ?? []))
    }),
    ...chunk(bookingIds, 200).map(async ids => {
      const { data, error } = await hub
        .from('squad')
        .select('booking_id, player_id, players(name)')
        .eq('is_captain', true)
        .in('booking_id', ids)
      if (error) throw new Error(error.message)
      squadRows.push(...(data ?? []))
    }),
    ...(analytics
      ? chunk(matchIds, 200).map(async ids => {
          const { data, error } = await analytics
            .from('match_stats')
            .select('match_id, toss_won, toss_decision')
            .in('match_id', ids)
          if (error) throw new Error(error.message)
          tossRows.push(...(data ?? []))
        })
      : []),
  ])

  const cacheByBooking = new Map<string, any>(cacheRows.map(r => [r.booking_id, r]))
  const captainByBooking = new Map<string, any>(squadRows.map(r => [r.booking_id, r]))
  const tossByMatch = new Map<string, any>(tossRows.map(r => [r.match_id, r]))

  const out: TeamMatch[] = []
  for (const b of rows) {
    const c = cacheByBooking.get(b.id)
    if (!c) continue
    const t = tossByMatch.get(b.match_id)
    const tossWon: boolean | null = t?.toss_won === 'Y' ? true : t?.toss_won === 'N' ? false : null
    const tossDecision: 'bat' | 'field' | null = t?.toss_decision === 'bat' ? 'bat' : t?.toss_decision === 'field' ? 'field' : null
    const battedFirst = tossWon === null || tossDecision === null ? null : (tossWon === (tossDecision === 'bat'))
    const cap = captainByBooking.get(b.id)
    const rawOpponent: string = (b.opponent_name ?? c.opponent_name ?? '').trim() || 'Unknown opponent'
    const tournament = Array.isArray(b.tournament) ? b.tournament[0] : b.tournament
    const ground     = Array.isArray(b.ground) ? b.ground[0] : b.ground
    const opponent   = Array.isArray(b.opponent) ? b.opponent[0] : b.opponent

    out.push({
      bookingId:      b.id,
      matchId:        b.match_id,
      gameDate:       b.game_date,
      slotTime:       b.slot_time,
      format:         b.format ?? null,
      result:         normaliseResult(c.match_result),
      teamTotal:      num(c.team_total),
      teamWickets:    num(c.team_wickets),
      teamOvers:      num(c.team_overs),
      oppTotal:       num(c.opponent_total),
      oppWickets:     num(c.opponent_wickets),
      oppOvers:       num(c.opponent_overs),
      opponentName:   rawOpponent,
      opponentId:     opponent?.id ?? b.opponent_id ?? null,
      opponentLabel:  opponent?.name ?? rawOpponent,
      isMarquee:      !!opponent?.is_marquee,
      tournamentId:   tournament?.id ?? b.tournament_id ?? null,
      tournamentName: tournament?.name ?? null,
      isPractice:     !!tournament?.is_practice,
      groundId:       ground?.id ?? b.ground_id ?? null,
      // Legacy rows from before migration 066 only have free-text venue
      groundName:     ground?.name ?? (b.venue ? String(b.venue).split(',')[0].trim() : null),
      stageType:      b.stage_type === 'knockout' ? 'knockout' : b.stage_type === 'league' ? 'league' : null,
      matchStage:     b.match_stage ?? null,
      tossWon,
      tossDecision,
      battedFirst,
      captainId:      cap?.player_id ?? null,
      captainName:    (Array.isArray(cap?.players) ? cap?.players?.[0]?.name : cap?.players?.name) ?? null,
    })
  }
  return out
}
