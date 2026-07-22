// Shared, server-only query library for player performance stats — career,
// season, leaderboard, and Captains' Corner recent-form. Never import into
// a 'use client' file: every function here reads the analytics DB directly
// via ANALYTICS_SUPABASE_KEY (see src/lib/matchStatsSync.ts for the same
// access pattern) and the Hub DB via the service-role client.
//
// This is a read-time query library, not a cache — match_stats_cache is a
// separate per-match display cache for /matches/history and is untouched
// here. If aggregate-query latency ever becomes a real problem, that's a
// separate caching task; not attempted as part of this feature.
//
// Column names below match spartans-python/scripts/import_to_supabase.py's
// COLUMN_TYPES exactly (that repo populates the analytics DB, not this
// one) — unlike ScorecardTables.tsx's defensive pickField() guesswork,
// which predates knowing the real schema.
//
// player_id on every analytics row is only populated once a scorecard name
// has been reconciled — see src/lib/playerIdentityResolution.ts. Rows with
// player_id IS NULL are never surfaced by any function here; that gap is
// what /admin/player-reconciliation exists to close.

import { createServiceClient } from '@/lib/supabase'
import { createAnalyticsClient } from '@/lib/playerIdentityResolution'
import type { PlayerStatsTotals, LeaderboardRow, RecentForm, BookingContextStats, PlayerMatchHistoryRow } from '@/types'

function round2(n: number): number {
  return Math.round(n * 100) / 100
}

function num(v: any): number {
  const n = Number(v)
  return Number.isFinite(n) ? n : 0
}

function groupBy<T>(rows: T[], key: (row: T) => string | null | undefined): Map<string, T[]> {
  const map = new Map<string, T[]>()
  for (const row of rows) {
    const k = key(row)
    if (!k) continue
    if (!map.has(k)) map.set(k, [])
    map.get(k)!.push(row)
  }
  return map
}

// Cricket overs notation ("3.4" = 3 overs + 4 balls) is NOT decimal — the
// digit after the point is balls bowled in the current over, not tenths of
// an over. Converting to a common balls unit before summing avoids a
// silently-wrong aggregate economy (naively adding 3.4 + 2.5 as floats
// would give 6.9, not the correct 38 balls / 6.2 overs).
function oversToBalls(overs: number): number {
  if (!overs) return 0
  const whole = Math.trunc(overs)
  const rem   = Math.round((overs - whole) * 10)
  return whole * 6 + rem
}

function ballsToOversString(balls: number): string {
  return `${Math.floor(balls / 6)}.${balls % 6}`
}

function emptyTotals(): PlayerStatsTotals {
  return {
    matches: 0, battingInnings: 0, bowlingInnings: 0, runs: 0, balls: 0, notOuts: 0,
    battingAverage: null, strikeRate: null, fours: 0, sixes: 0,
    wickets: 0, ballsBowled: 0, oversBowled: '0.0', runsConceded: 0, economy: null,
    catches: 0, runOuts: 0, stumpings: 0, mvpPoints: 0,
    battingMvp: 0, bowlingMvp: 0, fieldingMvp: 0,
  }
}

function aggregate(matchIds: Set<string>, batting: any[], bowling: any[], fielding: any[]): PlayerStatsTotals {
  const t = emptyTotals()
  t.matches = matchIds.size

  // batting_stats/bowling_stats carry a zero-filled placeholder row for
  // every squad member regardless of whether they actually got an innings
  // (see analytics-db/migrations/003_batting_bowling_innings_flags.sql) —
  // batted/did_bowl are the explicit ground-truth flags for that, written
  // by spartans-python at parse time. Filtering on them here mirrors what
  // ScorecardTables.tsx does with the same placeholder rows for display.
  const battingRows = batting.filter(r => r.batted)
  for (const r of battingRows) {
    t.runs  += num(r.runs)
    t.balls += num(r.balls)
    t.fours += num(r.fours)
    t.sixes += num(r.sixes)
    if (r.not_out === 'Y') t.notOuts += 1
  }
  t.battingInnings = battingRows.length
  const dismissals = battingRows.length - t.notOuts
  t.battingAverage = dismissals > 0 ? round2(t.runs / dismissals) : null
  t.strikeRate     = t.balls > 0 ? round2((t.runs / t.balls) * 100) : null

  const bowlingRows = bowling.filter(r => r.did_bowl)
  for (const r of bowlingRows) {
    t.wickets      += num(r.wickets)
    t.runsConceded += num(r.runs)
    t.ballsBowled  += oversToBalls(num(r.overs))
  }
  t.bowlingInnings = bowlingRows.length
  t.oversBowled = ballsToOversString(t.ballsBowled)
  t.economy = t.ballsBowled > 0 ? round2(t.runsConceded / (t.ballsBowled / 6)) : null

  // catches + caught_behind are both genuine catch dismissals (the latter
  // specifically behind the stumps) — combined into one "catches" figure
  // for display; stumpings and run-outs are kept separate.
  for (const r of fielding) {
    t.catches   += num(r.catches) + num(r.caught_behind)
    t.runOuts   += num(r.run_outs)
    t.stumpings += num(r.stumpings)
  }

  // mvp_score is present (and zero) on every row including did_not_bat /
  // never-bowled placeholders, so summing the unfiltered arrays is safe.
  let battingMvp = 0, bowlingMvp = 0, fieldingMvp = 0
  for (const r of batting)  battingMvp  += num(r.mvp_score)
  for (const r of bowling)  bowlingMvp  += num(r.mvp_score)
  for (const r of fielding) fieldingMvp += num(r.mvp_score)
  t.battingMvp  = round2(battingMvp)
  t.bowlingMvp  = round2(bowlingMvp)
  t.fieldingMvp = round2(fieldingMvp)
  t.mvpPoints   = round2(battingMvp + bowlingMvp + fieldingMvp)

  return t
}

// Resolves a {year, tournamentId, groundId, formats} filter to a concrete
// list of Hub bookings.match_id values. Returns null when nothing is set —
// the caller should treat null as "no restriction" (all-time, all
// tournaments, all grounds, all formats). Returns [] when filters are set
// but match nothing; the caller MUST short-circuit on an empty array rather
// than passing it to `.in()`, since an empty `.in()` array does not behave
// as "match nothing" in every Supabase/PostgREST version and this is safer
// made explicit.
//
// `formats` only restricts when it names a strict subset (length 1 today,
// since there are only two known formats) — callers pass undefined/empty
// for "no restriction" rather than the full ['T20','T30'] list, so this
// never has to special-case "all formats explicitly named".
async function getScopedMatchIds(filters: { year?: number; tournamentId?: string; groundId?: string; formats?: string[] }): Promise<string[] | null> {
  const hasFormatRestriction = !!filters.formats && filters.formats.length > 0
  if (!filters.year && !filters.tournamentId && !filters.groundId && !hasFormatRestriction) return null

  const hub = createServiceClient()
  let query = hub.from('bookings').select('match_id, tournament_id').not('match_id', 'is', null)
  if (filters.tournamentId) query = query.eq('tournament_id', filters.tournamentId)
  if (filters.year) query = query.gte('game_date', `${filters.year}-01-01`).lte('game_date', `${filters.year}-12-31`)
  if (hasFormatRestriction) query = query.in('format', filters.formats!)

  // Ground isn't a direct column on a booking — it hangs off the
  // tournament (tournaments.ground_id). Same resolution chain already used
  // by getPlayerBookingContextStats() below: resolve which tournaments
  // share this ground, then constrain to bookings under those tournaments.
  if (filters.groundId) {
    const { data: groundTournaments, error: gErr } = await hub.from('tournaments').select('id').eq('ground_id', filters.groundId)
    if (gErr) throw new Error(gErr.message)
    const ids = (groundTournaments ?? []).map((t: any) => t.id)
    if (ids.length === 0) return []
    query = query.in('tournament_id', ids)
  }

  const { data, error } = await query
  if (error) throw new Error(error.message)
  return Array.from(new Set<string>((data ?? []).map((b: any) => b.match_id).filter(Boolean)))
}

// Tournament and ground option lists for the /leaderboard filter bar,
// scoped by the currently-selected Format(s). Unrestricted (both formats,
// or the param omitted) returns the same "every tournament/ground" list as
// before this feature existed — no bookings scan needed. Restricted to a
// single format, only tournaments/grounds that actually have a synced
// match (match_id set) in that format are returned, so the Tournament/
// Ground dropdowns never offer a combination the leaderboard would then
// show as empty.
export async function getFilterOptions(formats?: string[]): Promise<{
  tournaments: { id: string; name: string }[]
  grounds:     { id: string; name: string }[]
}> {
  const hub = createServiceClient()

  if (!formats || formats.length === 0) {
    const [{ data: tournaments, error: tErr }, { data: grounds, error: gErr }] = await Promise.all([
      hub.from('tournaments').select('id, name').order('name', { ascending: true }),
      hub.from('grounds').select('id, name').order('name', { ascending: true }),
    ])
    if (tErr) throw new Error(tErr.message)
    if (gErr) throw new Error(gErr.message)
    return { tournaments: tournaments ?? [], grounds: grounds ?? [] }
  }

  const { data: bookings, error } = await hub
    .from('bookings')
    .select('tournament:tournaments(id, name, ground:grounds(id, name))')
    .in('format', formats)
    .not('match_id', 'is', null)
    .not('tournament_id', 'is', null)
  if (error) throw new Error(error.message)

  const tournamentMap = new Map<string, { id: string; name: string }>()
  const groundMap = new Map<string, { id: string; name: string }>()
  for (const row of bookings ?? []) {
    const t = (row as any).tournament
    if (!t) continue
    tournamentMap.set(t.id, { id: t.id, name: t.name })
    if (t.ground) groundMap.set(t.ground.id, { id: t.ground.id, name: t.ground.name })
  }

  return {
    tournaments: Array.from(tournamentMap.values()).sort((a, b) => a.name.localeCompare(b.name)),
    grounds:     Array.from(groundMap.values()).sort((a, b) => a.name.localeCompare(b.name)),
  }
}

async function fetchAnalyticsRows(opts: {
  playerId?:  string
  playerIds?: string[]
  matchIds?:  string[] | null // null = unrestricted
}) {
  const analytics = createAnalyticsClient()
  if (!analytics) throw new Error('Analytics database is not configured')

  function scope(q: any) {
    if (opts.playerId)  q = q.eq('player_id', opts.playerId)
    if (opts.playerIds) q = q.in('player_id', opts.playerIds)
    if (!opts.playerId && !opts.playerIds) q = q.not('player_id', 'is', null)
    if (opts.matchIds)  q = q.in('match_id', opts.matchIds)
    return q
  }

  const [batting, bowling, fielding, team] = await Promise.all([
    scope(analytics.from('batting_stats').select('*')),
    scope(analytics.from('bowling_stats').select('*')),
    scope(analytics.from('fielding_stats').select('*')),
    scope(analytics.from('team_list').select('*')),
  ])
  for (const r of [batting, bowling, fielding, team]) if (r.error) throw new Error(r.error.message)

  return {
    batting:  batting.data ?? [],
    bowling:  bowling.data ?? [],
    fielding: fielding.data ?? [],
    team:     team.data ?? [],
  }
}

// General-purpose scoped aggregate — getPlayerCareerStats and
// getPlayerSeasonStats are thin wrappers over this for their existing
// call shapes; the full stats page (/players/[id]/stats) uses this
// directly since it needs year AND tournament filters combined.
export async function getPlayerStats(
  playerId: string,
  filters: { year?: number; tournamentId?: string } = {}
): Promise<PlayerStatsTotals> {
  const scoped = await getScopedMatchIds(filters)
  if (scoped && scoped.length === 0) return emptyTotals()
  const { batting, bowling, fielding, team } = await fetchAnalyticsRows({ playerId, matchIds: scoped })
  const matchIds = new Set<string>(team.map((r: any) => r.match_id).filter(Boolean))
  return aggregate(matchIds, batting, bowling, fielding)
}

export async function getPlayerCareerStats(playerId: string): Promise<PlayerStatsTotals> {
  return getPlayerStats(playerId)
}

export async function getPlayerSeasonStats(playerId: string, year: number): Promise<PlayerStatsTotals> {
  return getPlayerStats(playerId, { year })
}

// One row per match this player appeared in (via team_list), for the full
// stats page's match-by-match breakdown. Batting/bowling/fielding lines are
// per-match, not aggregated — a player with no batting/bowling/fielding row
// for a given match (e.g. did not bat, never bowled) simply has that field
// null, mirroring the did_not_bat/zero-overs filtering used elsewhere in
// this file rather than showing a misleading 0.
export async function getPlayerMatchHistory(
  playerId: string,
  filters: { year?: number; tournamentId?: string } = {}
): Promise<PlayerMatchHistoryRow[]> {
  const scoped = await getScopedMatchIds(filters)
  if (scoped && scoped.length === 0) return []

  const { batting, bowling, fielding, team } = await fetchAnalyticsRows({ playerId, matchIds: scoped })
  const matchIds = Array.from(new Set<string>(team.map((r: any) => r.match_id).filter(Boolean)))
  if (matchIds.length === 0) return []

  const analytics = createAnalyticsClient()
  if (!analytics) throw new Error('Analytics database is not configured')
  const { data: matchRows, error: matchErr } = await analytics
    .from('match_stats').select('*').in('match_id', matchIds)
  if (matchErr) throw new Error(matchErr.message)
  const matchById = new Map((matchRows ?? []).map((m: any) => [m.match_id, m]))

  const hub = createServiceClient()
  const { data: bookingRows, error: bookingErr } = await hub
    .from('bookings')
    .select('id, match_id, game_date, format, tournament:tournaments(name)')
    .in('match_id', matchIds)
  if (bookingErr) throw new Error(bookingErr.message)
  const bookingByMatchId = new Map((bookingRows ?? []).map((b: any) => [b.match_id, b]))

  const battingByMatch  = new Map(batting.map((r: any) => [r.match_id, r]))
  const bowlingByMatch  = new Map(bowling.map((r: any) => [r.match_id, r]))
  const fieldingByMatch = new Map(fielding.map((r: any) => [r.match_id, r]))

  const rows: PlayerMatchHistoryRow[] = matchIds.map(matchId => {
    const m = matchById.get(matchId) as any
    const booking = bookingByMatchId.get(matchId) as any
    const bat = battingByMatch.get(matchId) as any
    const bowl = bowlingByMatch.get(matchId) as any
    const field = fieldingByMatch.get(matchId) as any

    const battedThisMatch = bat && bat.batted
    const bowledThisMatch = bowl && bowl.did_bowl

    return {
      matchId,
      bookingId:       booking?.id ?? null,
      gameDate:        booking?.game_date ?? m?.match_date ?? null,
      format:          booking?.format ?? null,
      tournamentName:  Array.isArray(booking?.tournament) ? booking?.tournament[0]?.name : booking?.tournament?.name ?? m?.tournament_name ?? null,
      opponentName:    m?.opponent_name ?? null,
      matchResult:     m?.match_result ?? null,
      batting: battedThisMatch ? {
        runs: num(bat.runs), balls: num(bat.balls), fours: num(bat.fours), sixes: num(bat.sixes),
        notOut: bat.not_out === 'Y',
        strikeRate: num(bat.balls) > 0 ? round2((num(bat.runs) / num(bat.balls)) * 100) : null,
      } : null,
      bowling: bowledThisMatch ? {
        overs: bowl.overs, wickets: num(bowl.wickets), runsConceded: num(bowl.runs),
        economy: oversToBalls(num(bowl.overs)) > 0 ? round2(num(bowl.runs) / (oversToBalls(num(bowl.overs)) / 6)) : null,
      } : null,
      fielding: field ? {
        catches: num(field.catches) + num(field.caught_behind),
        runOuts: num(field.run_outs), stumpings: num(field.stumpings),
      } : null,
    }
  })

  rows.sort((a, b) => (b.gameDate ?? '').localeCompare(a.gameDate ?? ''))
  return rows
}

export async function getLeaderboard(filters: { year?: number; tournamentId?: string; groundId?: string; formats?: string[] } = {}): Promise<LeaderboardRow[]> {
  const scoped = await getScopedMatchIds(filters)
  if (scoped && scoped.length === 0) return []

  const { batting, bowling, fielding, team } = await fetchAnalyticsRows({ matchIds: scoped })

  const battingByPlayer  = groupBy(batting,  (r: any) => r.player_id)
  const bowlingByPlayer  = groupBy(bowling,  (r: any) => r.player_id)
  const fieldingByPlayer = groupBy(fielding, (r: any) => r.player_id)
  const teamByPlayer     = groupBy(team,     (r: any) => r.player_id)

  const playerIds = new Set<string>()
  for (const id of Array.from(battingByPlayer.keys()))  playerIds.add(id)
  for (const id of Array.from(bowlingByPlayer.keys()))  playerIds.add(id)
  for (const id of Array.from(fieldingByPlayer.keys())) playerIds.add(id)
  for (const id of Array.from(teamByPlayer.keys()))     playerIds.add(id)
  if (playerIds.size === 0) return []

  const hub = createServiceClient()
  const ids = Array.from(playerIds)
  const { data: players, error } = await hub.from('players').select('id, name, cricheroes_url, photo_url').in('id', ids)
  if (error) throw new Error(error.message)
  const playerById = new Map((players ?? []).map((p: any) => [p.id, p]))

  const rows: LeaderboardRow[] = []
  for (const playerId of ids) {
    const player = playerById.get(playerId)
    // Reconciled to a player_id that no longer exists in Hub (e.g. the
    // player row was deleted) — skip rather than attribute stats to a
    // name that can't be verified.
    if (!player) continue

    const matchIds = new Set<string>((teamByPlayer.get(playerId) ?? []).map((r: any) => r.match_id).filter(Boolean))
    const playerBatting = battingByPlayer.get(playerId) ?? []
    const stats = aggregate(
      matchIds,
      playerBatting,
      bowlingByPlayer.get(playerId)  ?? [],
      fieldingByPlayer.get(playerId) ?? [],
    )
    if (stats.matches === 0) continue

    // Innings-level milestones — placeholder (batted = false) rows
    // excluded the same way aggregate() excludes them from runs/balls
    // totals.
    let centuries = 0
    let halfCenturies = 0
    for (const r of playerBatting) {
      if (!(r as any).batted) continue
      const runs = num((r as any).runs)
      if (runs >= 100) centuries++
      else if (runs >= 50) halfCenturies++
    }

    rows.push({ playerId, playerName: player.name, cricheroesUrl: player.cricheroes_url ?? null, photoUrl: player.photo_url ?? null, stats, centuries, halfCenturies })
  }
  return rows
}

export async function getRecentForm(playerIds: string[], matchCount: number = 5): Promise<Record<string, RecentForm | null>> {
  const result: Record<string, RecentForm | null> = {}
  if (playerIds.length === 0) return result

  const analytics = createAnalyticsClient()
  if (!analytics) throw new Error('Analytics database is not configured')

  const [teamRes, battingRes, bowlingRes] = await Promise.all([
    analytics.from('team_list').select('match_id, player_id').in('player_id', playerIds),
    analytics.from('batting_stats').select('match_id, player_id, runs, batted').in('player_id', playerIds),
    analytics.from('bowling_stats').select('match_id, player_id, wickets, did_bowl').in('player_id', playerIds),
  ])
  if (teamRes.error)    throw new Error(teamRes.error.message)
  if (battingRes.error) throw new Error(battingRes.error.message)
  if (bowlingRes.error) throw new Error(bowlingRes.error.message)

  const team    = teamRes.data ?? []
  const batting = battingRes.data ?? []
  const bowling = bowlingRes.data ?? []

  const matchIds = Array.from(new Set<string>(team.map((r: any) => r.match_id).filter(Boolean)))
  let dateByMatch = new Map<string, string>()
  if (matchIds.length > 0) {
    const hub = createServiceClient()
    const { data: bookings, error } = await hub.from('bookings').select('match_id, game_date').in('match_id', matchIds)
    if (error) throw new Error(error.message)
    dateByMatch = new Map((bookings ?? []).map((b: any) => [b.match_id, b.game_date]))
  }

  const matchesByPlayer  = groupBy(team, (r: any) => r.player_id)
  const battingByPlayer  = groupBy(batting, (r: any) => r.player_id)
  const bowlingByPlayer  = groupBy(bowling, (r: any) => r.player_id)

  for (const playerId of playerIds) {
    const played = Array.from(new Set<string>((matchesByPlayer.get(playerId) ?? []).map((r: any) => r.match_id).filter(Boolean)))
    if (played.length === 0) { result[playerId] = null; continue }

    played.sort((a, b) => (dateByMatch.get(b) ?? '').localeCompare(dateByMatch.get(a) ?? ''))
    const recent = new Set<string>(played.slice(0, matchCount))

    let runs = 0
    for (const r of battingByPlayer.get(playerId) ?? []) {
      if (recent.has((r as any).match_id) && (r as any).batted) runs += num((r as any).runs)
    }
    let wickets = 0
    for (const r of bowlingByPlayer.get(playerId) ?? []) {
      if (recent.has((r as any).match_id) && (r as any).did_bowl) wickets += num((r as any).wickets)
    }

    result[playerId] = { matches: recent.size, runs, wickets }
  }

  return result
}

// ── Booking context stats (Captains' Corner "Form" panel) ──────────────────
//
// Three independently-scoped views of one player's record, all resolved
// through the same bookings.match_id <-> analytics-DB match_id bridge used
// everywhere else in this file:
//   tournament — every match in this exact tournament
//   ground     — every match played at tournaments sharing this booking's
//                ground (tournaments.ground_id), falling back to an exact
//                bookings.venue match when the tournament has no ground set
//   format     — every match of this booking's format (T20/T30), across
//                every tournament and ground
// A scope with zero qualifying matches (or zero of them featuring this
// player) returns null, not a zero-filled row — the UI shows "No matches
// yet" rather than a misleading 0/0/0 line.

async function matchIdsForFilter(filter: {
  tournamentId?:    string
  tournamentIdIn?:  string[]
  venue?:           string
  format?:          string
}): Promise<string[]> {
  const hub = createServiceClient()
  let query = hub.from('bookings').select('match_id').not('match_id', 'is', null)
  if (filter.tournamentId)   query = query.eq('tournament_id', filter.tournamentId)
  if (filter.tournamentIdIn) query = query.in('tournament_id', filter.tournamentIdIn)
  if (filter.venue)          query = query.eq('venue', filter.venue)
  if (filter.format)         query = query.eq('format', filter.format)

  const { data, error } = await query
  if (error) throw new Error(error.message)
  return Array.from(new Set<string>((data ?? []).map((b: any) => b.match_id).filter(Boolean)))
}

async function scopedPlayerStats(playerId: string, matchIds: string[]): Promise<PlayerStatsTotals | null> {
  if (matchIds.length === 0) return null
  const { batting, bowling, fielding, team } = await fetchAnalyticsRows({ playerId, matchIds })
  const matchIdSet = new Set<string>(team.map((r: any) => r.match_id).filter(Boolean))
  if (matchIdSet.size === 0) return null
  return aggregate(matchIdSet, batting, bowling, fielding)
}

export async function getPlayerBookingContextStats(playerId: string, bookingId: string): Promise<BookingContextStats> {
  const hub = createServiceClient()
  const { data: booking, error } = await hub
    .from('bookings')
    .select('tournament_id, format, venue, tournament:tournaments(ground_id)')
    .eq('id', bookingId)
    .single()
  if (error) throw new Error(error.message)
  if (!booking) throw new Error('Booking not found')

  const tournamentId = booking.tournament_id as string | null
  const groundId      = (booking as any).tournament?.ground_id as string | null
  const venue         = booking.venue as string | null
  const format        = booking.format as string | null

  let groundTournamentIds: string[] | null = null
  if (groundId) {
    const { data: tournaments, error: tErr } = await hub.from('tournaments').select('id').eq('ground_id', groundId)
    if (tErr) throw new Error(tErr.message)
    groundTournamentIds = (tournaments ?? []).map((t: any) => t.id)
  }

  const [tournamentMatchIds, groundMatchIds, formatMatchIds] = await Promise.all([
    tournamentId ? matchIdsForFilter({ tournamentId }) : Promise.resolve([]),
    groundTournamentIds
      ? (groundTournamentIds.length ? matchIdsForFilter({ tournamentIdIn: groundTournamentIds }) : Promise.resolve([]))
      : (venue ? matchIdsForFilter({ venue }) : Promise.resolve([])),
    format ? matchIdsForFilter({ format }) : Promise.resolve([]),
  ])

  const [tournament, ground, formatStats] = await Promise.all([
    scopedPlayerStats(playerId, tournamentMatchIds),
    scopedPlayerStats(playerId, groundMatchIds),
    scopedPlayerStats(playerId, formatMatchIds),
  ])

  return { tournament, ground, format: formatStats }
}
