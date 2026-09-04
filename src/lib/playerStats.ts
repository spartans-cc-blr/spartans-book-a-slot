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
import type { PlayerStatsTotals, LeaderboardRow, RecentForm, BookingContextStats, PlayerMatchHistoryRow, MonthlyInnings, MonthlyBowlingInnings } from '@/types'

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

// PostgREST caps an unpaginated `.select()` response at a fixed row limit
// (this project's default is 1000) — silently, with no error surfaced to
// the caller. Any analytics-DB read here that isn't scoped to a single
// player can realistically exceed that as the season's synced-match count
// grows: confirmed live on 2026-08-22 at 1,045 rows per table for the
// current season's scope alone, which was silently truncating
// getLeaderboard()'s season totals for every player, not just the one that
// happened to surface it (a milestone crossed per getPlayerSeasonStats(),
// which is single-player-scoped and never hits the cap, while the Honor
// Board built off this same match scope quietly undercounted). Every
// multi-row analytics fetch in this file pages through with `.range()`
// instead of trusting one request to return everything.
const ANALYTICS_PAGE_SIZE = 1000

async function fetchAllRows<T = any>(buildQuery: () => any): Promise<T[]> {
  const rows: T[] = []
  let from = 0
  for (;;) {
    const { data, error } = await buildQuery().range(from, from + ANALYTICS_PAGE_SIZE - 1)
    if (error) throw new Error(error.message)
    if (!data || data.length === 0) break
    rows.push(...data)
    if (data.length < ANALYTICS_PAGE_SIZE) break
    from += ANALYTICS_PAGE_SIZE
  }
  return rows
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

// analytics DB match_stats.toss_won is always relative to *our* team (the
// Spartans variant that played — spartans-python's extractor resolves
// "team" that way regardless of which specific house/branch it was), and
// toss_decision ('bat'|'field') is what the toss winner chose. Combining
// them tells us whether our team batted first, independent of who won the
// toss. Returns null when either field is missing/blank — older parses
// predate this extraction, and a blank toss_decision is valid (CSV writer
// leaves it '' when the toss text didn't contain "bat"/"field"/"bowl").
function deriveBattedFirst(m: any): boolean | null {
  const tossWon = m?.toss_won
  const tossDecision = m?.toss_decision
  if (tossWon !== 'Y' && tossWon !== 'N') return null
  if (tossDecision !== 'bat' && tossDecision !== 'field') return null
  return (tossWon === 'Y') === (tossDecision === 'bat')
}

function emptyTotals(): PlayerStatsTotals {
  return {
    matches: 0, battingInnings: 0, bowlingInnings: 0, runs: 0, balls: 0, notOuts: 0,
    battingAverage: null, strikeRate: null, fours: 0, sixes: 0,
    wickets: 0, ballsBowled: 0, oversBowled: '0.0', runsConceded: 0, economy: null,
    bowlingStrikeRate: null,
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
  t.bowlingStrikeRate = t.wickets > 0 ? round2(t.ballsBowled / t.wickets) : null

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

// Tournaments flagged tournaments.is_practice (currently just the single
// "Practice games" umbrella tournament — see migration
// 054_tournament_is_practice.sql). Practice games are not real tournament
// fixtures, so they're excluded from every stats aggregate by default; only
// callers that explicitly scope to one tournament (that tournament's own
// stats, whichever it is) or that pass `includePractice` (the personal
// stats page's opt-in toggle) see through the exclusion.
async function getPracticeTournamentIds(): Promise<Set<string>> {
  const hub = createServiceClient()
  const { data, error } = await hub.from('tournaments').select('id').eq('is_practice', true)
  if (error) throw new Error(error.message)
  return new Set<string>((data ?? []).map((t: any) => t.id))
}

// Resolves a {year|month, tournamentId, groundId, formats} filter to a
// concrete list of Hub bookings.match_id values. Returns null when nothing
// is set — the caller should treat null as "no restriction" (all-time, all
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
//
// `month` ('YYYY-MM', for the leaderboard's Monthly view) and `year` are
// never combined by any caller today — Monthly scopes by month alone, every
// other view scopes by year alone — so `month` simply takes precedence
// when both happen to be set, rather than trying to intersect the two.
async function getScopedMatchIds(filters: { year?: number; month?: string; tournamentId?: string; groundId?: string; formats?: string[]; includePractice?: boolean }): Promise<string[] | null> {
  const hasFormatRestriction = !!filters.formats && filters.formats.length > 0

  // Excluding practice games is itself a restriction, so the "nothing is
  // set, return null (fully unrestricted)" shortcut below can't apply
  // whenever the exclusion is in effect — an explicit tournamentId always
  // wins (that's a deliberate, narrow request, not a default aggregate).
  const excludePractice = !filters.tournamentId && !filters.includePractice
  const hasAnyFilter = !!filters.year || !!filters.month || !!filters.tournamentId || !!filters.groundId || hasFormatRestriction
  if (!hasAnyFilter && !excludePractice) return null

  const hub = createServiceClient()
  const practiceIds = excludePractice ? await getPracticeTournamentIds() : new Set<string>()

  function withoutPractice(rows: any[]): any[] {
    return excludePractice ? rows.filter(b => !practiceIds.has(b.tournament_id)) : rows
  }

  function baseQuery() {
    // Cancelled bookings are excluded — a rescheduled match's old slot is
    // cancelled rather than deleted, but keeps the same match_id, so
    // without this a match can leak into every month/year/tournament its
    // now-stale cancelled attempts happened to be booked for, on top of
    // the one it actually got played in. Confirmed, real incident: see
    // getPerformances()'s comment below.
    let q = hub.from('bookings').select('match_id, tournament_id').not('match_id', 'is', null).eq('status', 'confirmed')
    if (filters.tournamentId) q = q.eq('tournament_id', filters.tournamentId)
    if (filters.month) {
      const [y, m] = filters.month.split('-').map(Number)
      const lastDay = new Date(Date.UTC(y, m, 0)).getUTCDate() // day 0 of next month = last day of this month
      q = q.gte('game_date', `${filters.month}-01`).lte('game_date', `${filters.month}-${String(lastDay).padStart(2, '0')}`)
    } else if (filters.year) {
      q = q.gte('game_date', `${filters.year}-01-01`).lte('game_date', `${filters.year}-12-31`)
    }
    if (hasFormatRestriction) q = q.in('format', filters.formats!)
    return q
  }

  if (!filters.groundId) {
    const { data, error } = await baseQuery()
    if (error) throw new Error(error.message)
    return Array.from(new Set<string>(withoutPractice(data ?? []).map((b: any) => b.match_id).filter(Boolean)))
  }

  // Each booking now carries its own ground_id directly (migration 066) —
  // snapshotted from its tournament at creation time but independently
  // overridable, which is exactly what a ground-less umbrella tournament
  // like "Practice games" needs (its matches span many physical grounds,
  // so there's no single tournament-level ground_id to fall back on). A
  // direct filter on bookings.ground_id now captures that in one query —
  // no more resolving "which tournaments use this ground" as a proxy.
  // Legacy fallback: rows from before the migration that never got
  // backfilled a ground_id still match via the old free-text venue column.
  const { data: ground, error: groundErr } = await hub.from('grounds').select('name').eq('id', filters.groundId).maybeSingle()
  if (groundErr) throw new Error(groundErr.message)
  const groundName = ground?.name ?? null

  const [byGroundId, byLegacyVenue] = await Promise.all([
    baseQuery().eq('ground_id', filters.groundId),
    groundName ? baseQuery().is('ground_id', null).ilike('venue', groundName) : Promise.resolve({ data: [] as any[], error: null }),
  ])
  if (byGroundId.error) throw new Error(byGroundId.error.message)
  if (byLegacyVenue.error) throw new Error(byLegacyVenue.error.message)

  const matchIds = new Set<string>()
  for (const b of withoutPractice(byGroundId.data ?? [])) if (b.match_id) matchIds.add(b.match_id)
  for (const b of withoutPractice(byLegacyVenue.data ?? [])) if (b.match_id) matchIds.add(b.match_id)
  return Array.from(matchIds)
}

// Tournament and ground option lists for the /leaderboard filter bar,
// scoped by the currently-selected Format(s). Unrestricted (both formats,
// or the param omitted) returns the same "every tournament/ground" list as
// before this feature existed — no bookings scan needed. Restricted to a
// single format, only tournaments/grounds that actually have a synced
// match (match_id set) in that format are returned, so the Tournament/
// Ground dropdowns never offer a combination the leaderboard would then
// show as empty.
//
// The "Practice games" umbrella tournament (tournaments.is_practice) is
// excluded from this list entirely — practice games aren't counted towards
// leaderboard stats at all (see getScopedMatchIds()), so offering it as a
// selectable Tournament filter here would be misleading.
export async function getFilterOptions(formats?: string[]): Promise<{
  tournaments: { id: string; name: string }[]
  grounds:     { id: string; name: string }[]
}> {
  const hub = createServiceClient()

  if (!formats || formats.length === 0) {
    const [{ data: tournaments, error: tErr }, { data: grounds, error: gErr }] = await Promise.all([
      hub.from('tournaments').select('id, name').eq('is_practice', false).order('name', { ascending: true }),
      hub.from('grounds').select('id, name').order('name', { ascending: true }),
    ])
    if (tErr) throw new Error(tErr.message)
    if (gErr) throw new Error(gErr.message)
    return { tournaments: tournaments ?? [], grounds: grounds ?? [] }
  }

  const { data: bookings, error } = await hub
    .from('bookings')
    .select('tournament:tournaments(id, name, is_practice, ground:grounds(id, name))')
    .in('format', formats)
    .not('match_id', 'is', null)
    .not('tournament_id', 'is', null)
    .eq('status', 'confirmed')
  if (error) throw new Error(error.message)

  const tournamentMap = new Map<string, { id: string; name: string }>()
  const groundMap = new Map<string, { id: string; name: string }>()
  for (const row of bookings ?? []) {
    const t = (row as any).tournament
    if (!t || t.is_practice) continue
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

  function scope(table: string) {
    return () => {
      // .order() on the table's own composite primary key (match_id,
      // player_name) — required for fetchAllRows()'s .range() pagination
      // to be stable; without a deterministic order, Postgres offers no
      // guarantee that two successive pages don't skip or repeat rows.
      let q = analytics!.from(table).select('*').order('match_id').order('player_name')
      if (opts.playerId)  q = q.eq('player_id', opts.playerId)
      if (opts.playerIds) q = q.in('player_id', opts.playerIds)
      if (!opts.playerId && !opts.playerIds) q = q.not('player_id', 'is', null)
      if (opts.matchIds)  q = q.in('match_id', opts.matchIds)
      return q
    }
  }

  const [batting, bowling, fielding, team] = await Promise.all([
    fetchAllRows(scope('batting_stats')),
    fetchAllRows(scope('bowling_stats')),
    fetchAllRows(scope('fielding_stats')),
    fetchAllRows(scope('team_list')),
  ])

  return {
    batting,
    bowling,
    fielding,
    team,
  }
}

// General-purpose scoped aggregate — getPlayerCareerStats and
// getPlayerSeasonStats are thin wrappers over this for their existing
// call shapes; the full stats page (/players/[id]/stats) uses this
// directly since it needs year, ground, AND format filters combined.
export async function getPlayerStats(
  playerId: string,
  filters: { year?: number; tournamentId?: string; groundId?: string; formats?: string[]; asCaptain?: boolean; innings?: 'defending' | 'chasing'; includePractice?: boolean } = {}
): Promise<PlayerStatsTotals> {
  let scoped = await getScopedMatchIds(filters)
  if (scoped && scoped.length === 0) return emptyTotals()
  scoped = await applyCaptainFilter(playerId, scoped, filters.asCaptain)
  if (scoped && scoped.length === 0) return emptyTotals()
  scoped = await applyInningsFilter(scoped, filters.innings)
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
  filters: { year?: number; tournamentId?: string; groundId?: string; formats?: string[]; asCaptain?: boolean; innings?: 'defending' | 'chasing'; includePractice?: boolean } = {}
): Promise<PlayerMatchHistoryRow[]> {
  let scoped = await getScopedMatchIds(filters)
  if (scoped && scoped.length === 0) return []
  scoped = await applyCaptainFilter(playerId, scoped, filters.asCaptain)
  if (scoped && scoped.length === 0) return []
  scoped = await applyInningsFilter(scoped, filters.innings)
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
  // .eq('status', 'confirmed') — a match_id can be shared with an old,
  // cancelled (rescheduled-away) booking; without this, whichever row
  // Postgres happens to return last for that match_id wins the Map below,
  // which can silently swap in the wrong date/tournament.
  // match_time is fetched purely to break ties on the date+time sort below
  // (a single day can have more than one game) — it isn't part of the
  // returned row shape. DB-guaranteed non-null — see matchStatus.ts.
  const { data: bookingRows, error: bookingErr } = await hub
    .from('bookings')
    .select('id, match_id, game_date, format, match_time, tournament:tournaments(name)')
    .in('match_id', matchIds)
    .eq('status', 'confirmed')
  if (bookingErr) throw new Error(bookingErr.message)
  const bookingByMatchId = new Map((bookingRows ?? []).map((b: any) => [b.match_id, b]))

  const battingByMatch  = new Map(batting.map((r: any) => [r.match_id, r]))
  const bowlingByMatch  = new Map(bowling.map((r: any) => [r.match_id, r]))
  const fieldingByMatch = new Map(fielding.map((r: any) => [r.match_id, r]))

  // Sort match_ids by date+time (most recent first) before building the
  // final rows — game_date alone can't break a tie between two matches
  // played the same day.
  const sortedMatchIds = [...matchIds].sort((a, b) => {
    const ba = bookingByMatchId.get(a) as any
    const bb = bookingByMatchId.get(b) as any
    const dateA = ba?.game_date ?? matchById.get(a)?.match_date ?? ''
    const dateB = bb?.game_date ?? matchById.get(b)?.match_date ?? ''
    const timeA = ba?.match_time ?? ''
    const timeB = bb?.match_time ?? ''
    return `${dateB} ${timeB}`.localeCompare(`${dateA} ${timeA}`)
  })

  const rows: PlayerMatchHistoryRow[] = sortedMatchIds.map(matchId => {
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
      battedFirst:     deriveBattedFirst(m),
      batting: battedThisMatch ? {
        runs: num(bat.runs), balls: num(bat.balls), fours: num(bat.fours), sixes: num(bat.sixes),
        notOut: bat.not_out === 'Y',
        strikeRate: num(bat.balls) > 0 ? round2((num(bat.runs) / num(bat.balls)) * 100) : null,
        howOut: bat.dismissal_method ?? null,
        battingOrder: bat.batting_order != null ? num(bat.batting_order) : null,
      } : null,
      bowling: bowledThisMatch ? {
        overs: bowl.overs, dots: num(bowl.dots), wickets: num(bowl.wickets), runsConceded: num(bowl.runs),
        economy: oversToBalls(num(bowl.overs)) > 0 ? round2(num(bowl.runs) / (oversToBalls(num(bowl.overs)) / 6)) : null,
      } : null,
      fielding: field ? {
        catches: num(field.catches) + num(field.caught_behind),
        runOuts: num(field.run_outs), stumpings: num(field.stumpings),
      } : null,
    }
  })

  return rows
}

export async function getLeaderboard(filters: { year?: number; month?: string; tournamentId?: string; groundId?: string; formats?: string[]; innings?: 'defending' | 'chasing' } = {}): Promise<LeaderboardRow[]> {
  let scoped = await getScopedMatchIds(filters)
  if (scoped && scoped.length === 0) return []
  scoped = await applyInningsFilter(scoped, filters.innings)
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

// Distinct 'YYYY-MM' months that have at least one confirmed, synced
// booking — feeds the month stepper on /leaderboard's Monthly view, most
// recent first. Mirrors the same distinct-month derivation
// /api/matches/history/filters already does over bookings, scoped here to
// bookings with a match_id (the leaderboard only ever has data for those).
//
// Capped at today — a future booking can already have a match_id set
// (admins sometimes attach the CricHeroes match link ahead of time), which
// would otherwise surface a not-yet-played month in the stepper's picker
// with nothing in it. Also excludes cancelled bookings — see
// getPerformances()'s comment for why a stale, rescheduled-away
// booking can't just be left in.
export async function getAvailableMonths(): Promise<string[]> {
  const today = new Date().toISOString().split('T')[0]
  const hub = createServiceClient()
  const { data, error } = await hub.from('bookings').select('game_date').not('match_id', 'is', null).eq('status', 'confirmed').lte('game_date', today)
  if (error) throw new Error(error.message)
  const months = new Set<string>((data ?? []).map((b: any) => (b.game_date as string).slice(0, 7)))
  return Array.from(months).sort((a, b) => b.localeCompare(a))
}

type Performances = {
  centuries:        MonthlyInnings[]
  halfCenturies:    MonthlyInnings[]
  fiveWicketHauls:  MonthlyBowlingInnings[]
  threeWicketHauls: MonthlyBowlingInnings[]
}
const EMPTY_PERFORMANCES: Performances = { centuries: [], halfCenturies: [], fiveWicketHauls: [], threeWicketHauls: [] }

function resolveTournamentName(booking: any): string | null {
  return Array.isArray(booking?.tournament) ? (booking.tournament[0]?.name ?? null) : (booking?.tournament?.name ?? null)
}

// Every individual 50+ batting innings and 3+ wicket bowling innings within
// the given scope, split into centuries/half-centuries and 5-for/3-for
// bands (each pair mutually exclusive by score) — lists each one rather
// than crowning a single "most" winner. Sorted best performance first,
// most recent date as the tiebreak. Takes the same filter shape as
// getLeaderboard()/getScopedMatchIds() — used both for the Monthly view
// (scoped by `month`) and for the year-scoped Milestones "Centuries" /
// "5-Wicket Hauls" collapsible lists (scoped by `year` + whatever
// tournament/ground/format filter is active), since 100s and 5-fors are
// rare enough that a whole year's worth is still a reasonably short list.
//
// `includePractice` is passed by every caller (see `src/app/leaderboard/page.tsx`)
// — deliberately unlike `getLeaderboard()`, which has no such flag and always
// excludes practice games. A century or 5-wicket haul is still a genuine,
// nameable performance worth recognising even from a practice game; it just
// shouldn't move an aggregate "best" ranking (Leading Run Scorer, MVP, the
// tied Most 100s/50s cards — all sourced from `getLeaderboard()`, untouched
// by this). This function still computes and returns all four bands (it's
// one shared batting/bowling fetch, splitting them out is free) — only
// `centuries`/`fiveWicketHauls` are actually rendered any more (neither
// `LeaderboardMilestones.tsx` nor `LeaderboardMonthly.tsx` shows
// halfCenturies/threeWicketHauls). See `features/leaderboard.md` §5/§5.1/§10.
export async function getPerformances(filters: { year?: number; month?: string; tournamentId?: string; groundId?: string; formats?: string[]; includePractice?: boolean }): Promise<Performances> {
  const scoped = await getScopedMatchIds(filters)
  if (!scoped || scoped.length === 0) return EMPTY_PERFORMANCES

  const analytics = createAnalyticsClient()
  if (!analytics) throw new Error('Analytics database is not configured')
  const [battingRows, bowlingRows] = await Promise.all([
    fetchAllRows(() => analytics.from('batting_stats').select('*').order('match_id').order('player_name').in('match_id', scoped).not('player_id', 'is', null)),
    fetchAllRows(() => analytics.from('bowling_stats').select('*').order('match_id').order('player_name').in('match_id', scoped).not('player_id', 'is', null)),
  ])

  const qualifyingBatting = battingRows.filter((r: any) => r.batted && num(r.runs) >= 50)
  const qualifyingBowling = bowlingRows.filter((r: any) => r.did_bowl && num(r.wickets) >= 3)
  if (qualifyingBatting.length === 0 && qualifyingBowling.length === 0) return EMPTY_PERFORMANCES

  // One shared bookings + players fetch for both bands — cheaper than
  // fetching separately, and `id` (booking id) rides along for free
  // alongside the fields already needed for date/format/tournament, so
  // the match-page link costs nothing extra on top of this query.
  const matchIds  = Array.from(new Set<string>([...qualifyingBatting, ...qualifyingBowling].map((r: any) => r.match_id)))
  const playerIds = Array.from(new Set<string>([...qualifyingBatting, ...qualifyingBowling].map((r: any) => r.player_id)))

  const hub = createServiceClient()
  // .eq('status', 'confirmed') — real incident: a match rescheduled twice
  // (Apr -> Jun -> Jul) left two cancelled bookings behind, each still
  // carrying the same match_id as the eventual confirmed Jul booking.
  // getScopedMatchIds() already excludes those from a given month's scope
  // (so the match itself no longer wrongly appears under April/June), but
  // this join needs the same filter too — otherwise a cancelled booking
  // sharing the match_id can still win the Map below and show the wrong
  // date/tournament for a performance that *did* correctly qualify.
  const [{ data: bookings, error: bookErr }, { data: players, error: pErr }] = await Promise.all([
    hub.from('bookings').select('id, match_id, game_date, format, tournament:tournaments(name)').in('match_id', matchIds).eq('status', 'confirmed'),
    hub.from('players').select('id, name, cricheroes_url, photo_url').in('id', playerIds),
  ])
  if (bookErr) throw new Error(bookErr.message)
  if (pErr) throw new Error(pErr.message)
  const bookingByMatch = new Map((bookings ?? []).map((b: any) => [b.match_id, b]))
  const playerById     = new Map((players ?? []).map((p: any) => [p.id, p]))

  const battingInnings: MonthlyInnings[] = qualifyingBatting
    .filter((r: any) => playerById.has(r.player_id)) // reconciled to a player_id no longer in Hub — skip, same guard as getLeaderboard
    .map((r: any) => {
      const booking = bookingByMatch.get(r.match_id) as any
      const player  = playerById.get(r.player_id) as any
      return {
        playerId:       r.player_id,
        playerName:     player.name,
        cricheroesUrl:  player.cricheroes_url ?? null,
        photoUrl:       player.photo_url ?? null,
        runs:           num(r.runs),
        balls:          num(r.balls),
        notOut:         r.not_out === 'Y',
        gameDate:       booking?.game_date ?? null,
        format:         booking?.format ?? null,
        tournamentName: resolveTournamentName(booking),
        bookingId:      booking?.id ?? null,
      }
    })
  battingInnings.sort((a, b) => b.runs - a.runs || (b.gameDate ?? '').localeCompare(a.gameDate ?? ''))

  const bowlingInnings: MonthlyBowlingInnings[] = qualifyingBowling
    .filter((r: any) => playerById.has(r.player_id))
    .map((r: any) => {
      const booking = bookingByMatch.get(r.match_id) as any
      const player  = playerById.get(r.player_id) as any
      return {
        playerId:       r.player_id,
        playerName:     player.name,
        cricheroesUrl:  player.cricheroes_url ?? null,
        photoUrl:       player.photo_url ?? null,
        wickets:        num(r.wickets),
        runsConceded:   num(r.runs),
        overs:          r.overs,
        gameDate:       booking?.game_date ?? null,
        format:         booking?.format ?? null,
        tournamentName: resolveTournamentName(booking),
        bookingId:      booking?.id ?? null,
      }
    })
  // Most wickets first; fewer runs conceded (better economy) breaks a tie
  // on wickets, most recent date breaks a tie on both.
  bowlingInnings.sort((a, b) => b.wickets - a.wickets || a.runsConceded - b.runsConceded || (b.gameDate ?? '').localeCompare(a.gameDate ?? ''))

  return {
    centuries:        battingInnings.filter(i => i.runs >= 100),
    halfCenturies:    battingInnings.filter(i => i.runs >= 50 && i.runs < 100),
    fiveWicketHauls:  bowlingInnings.filter(i => i.wickets >= 5),
    threeWicketHauls: bowlingInnings.filter(i => i.wickets >= 3 && i.wickets < 5),
  }
}

export async function getRecentForm(playerIds: string[], matchCount: number = 5): Promise<Record<string, RecentForm | null>> {
  const result: Record<string, RecentForm | null> = {}
  if (playerIds.length === 0) return result

  const analytics = createAnalyticsClient()
  if (!analytics) throw new Error('Analytics database is not configured')

  const [team, batting, bowling] = await Promise.all([
    fetchAllRows(() => analytics.from('team_list').select('match_id, player_id').order('match_id').order('player_name').in('player_id', playerIds)),
    fetchAllRows(() => analytics.from('batting_stats').select('match_id, player_id, runs, batted').order('match_id').order('player_name').in('player_id', playerIds)),
    fetchAllRows(() => analytics.from('bowling_stats').select('match_id, player_id, wickets, did_bowl').order('match_id').order('player_name').in('player_id', playerIds)),
  ])

  const matchIds = Array.from(new Set<string>(team.map((r: any) => r.match_id).filter(Boolean)))
  let dateByMatch = new Map<string, string>()
  if (matchIds.length > 0) {
    const hub = createServiceClient()
    const { data: bookings, error } = await hub.from('bookings').select('match_id, game_date').in('match_id', matchIds).eq('status', 'confirmed')
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
//   ground     — every match at this booking's own ground_id (migration
//                066 — a direct column on every booking, snapshotted from
//                its tournament at creation time but independently
//                overridable). This is what makes a ground-less umbrella
//                tournament like "Practice games" work correctly: its
//                matches have no single tournament-level ground, but each
//                one still has its own real ground_id set at booking time.
//                Rows from before that migration which never got backfilled
//                a ground_id fall back to a case-insensitive match on the
//                legacy free-text bookings.venue column.
//   format     — every match of this booking's format (T20/T30), across
//                every tournament and ground
// A scope with zero qualifying matches (or zero of them featuring this
// player) returns null, not a zero-filled row — the UI shows "No matches
// yet" rather than a misleading 0/0/0 line.

async function matchIdsForFilter(filter: {
  tournamentId?:    string
  tournamentIdIn?:  string[]
  groundId?:        string
  venue?:           string
  format?:          string
  gameDateFrom?:    string   // inclusive — 'YYYY-MM-DD'
}): Promise<string[]> {
  const hub = createServiceClient()
  let query = hub.from('bookings').select('match_id').not('match_id', 'is', null).eq('status', 'confirmed')
  if (filter.tournamentId)   query = query.eq('tournament_id', filter.tournamentId)
  if (filter.tournamentIdIn) query = query.in('tournament_id', filter.tournamentIdIn)
  if (filter.groundId)       query = query.eq('ground_id', filter.groundId)
  // Case-insensitive — CricHeroes/admin-entered venue text and the ground's
  // own name aren't guaranteed to agree on casing. Legacy-row fallback only
  // (see getPlayerBookingContextStats) — never combined with groundId.
  if (filter.venue)          query = query.ilike('venue', filter.venue)
  if (filter.format)         query = query.eq('format', filter.format)
  if (filter.gameDateFrom)   query = query.gte('game_date', filter.gameDateFrom)

  const { data, error } = await query
  if (error) throw new Error(error.message)
  return Array.from(new Set<string>((data ?? []).map((b: any) => b.match_id).filter(Boolean)))
}

// Minimum matches required for the Form panel's "Format" row (last 3
// calendar months) to be considered a meaningful sample — below this it
// renders as "Not enough data" rather than a stats line, same spirit as
// the leaderboard's own minimum-sample gates (see features/leaderboard.md
// §4/§6). Tournament/Ground rows are unaffected — still all-time, still
// "No matches yet" when empty.
const MIN_GAMES_FOR_FORMAT_ROW = 6

// match_id values for every confirmed booking where this player was the
// match-specific captain (squad.is_captain — see features/squad-selection.md;
// this is NOT players.is_captain, the permanent club-captain flag). Used by
// the "As Captain" filter on /players/[id]/stats, intersected with whatever
// year/ground/format scope is already active rather than replacing it.
async function getCaptainMatchIds(playerId: string): Promise<string[]> {
  const hub = createServiceClient()
  const { data: squadRows, error: squadErr } = await hub
    .from('squad').select('booking_id').eq('player_id', playerId).eq('is_captain', true)
  if (squadErr) throw new Error(squadErr.message)
  const bookingIds = Array.from(new Set<string>((squadRows ?? []).map((r: any) => r.booking_id).filter(Boolean)))
  if (bookingIds.length === 0) return []

  const { data: bookings, error: bookErr } = await hub
    .from('bookings').select('match_id').in('id', bookingIds).eq('status', 'confirmed').not('match_id', 'is', null)
  if (bookErr) throw new Error(bookErr.message)
  return Array.from(new Set<string>((bookings ?? []).map((b: any) => b.match_id).filter(Boolean)))
}

// Intersects the already-scoped match_id list (or, if unscoped, the full
// captain list) with this player's captain match_ids. Returns null only when
// asCaptain isn't set at all — same "no restriction" contract as
// getScopedMatchIds — otherwise always a concrete (possibly empty) array.
async function applyCaptainFilter(playerId: string, scoped: string[] | null, asCaptain?: boolean): Promise<string[] | null> {
  if (!asCaptain) return scoped
  const captainMatchIds = await getCaptainMatchIds(playerId)
  if (captainMatchIds.length === 0) return []
  if (!scoped) return captainMatchIds
  const captainSet = new Set(captainMatchIds)
  return scoped.filter(id => captainSet.has(id))
}

// match_id values from the analytics DB's match_stats table where our team
// batted first ('defending' — won the toss and chose to bat, or lost the
// toss and the opponent chose to field) or batted second ('chasing' — the
// inverse). Same toss_won/toss_decision combination as deriveBattedFirst()
// above, expressed as a query instead of a per-row boolean so it can be
// intersected with the rest of the match_id scope server-side, the same way
// getCaptainMatchIds()/applyCaptainFilter() work for the "As Captain" filter.
async function getInningsMatchIds(innings: 'defending' | 'chasing'): Promise<string[]> {
  const analytics = createAnalyticsClient()
  if (!analytics) throw new Error('Analytics database is not configured')
  const orExpr = innings === 'defending'
    ? 'and(toss_won.eq.Y,toss_decision.eq.bat),and(toss_won.eq.N,toss_decision.eq.field)'
    : 'and(toss_won.eq.Y,toss_decision.eq.field),and(toss_won.eq.N,toss_decision.eq.bat)'
  const { data, error } = await analytics.from('match_stats').select('match_id').or(orExpr)
  if (error) throw new Error(error.message)
  return Array.from(new Set<string>((data ?? []).map((r: any) => r.match_id).filter(Boolean)))
}

// Intersects the already-scoped match_id list with matches where our team
// was defending (batted first) or chasing (batted second) — same "no
// restriction" contract as applyCaptainFilter: returns `scoped` unchanged
// when `innings` isn't set, otherwise always a concrete (possibly empty)
// array.
async function applyInningsFilter(scoped: string[] | null, innings?: 'defending' | 'chasing'): Promise<string[] | null> {
  if (!innings) return scoped
  const inningsMatchIds = await getInningsMatchIds(innings)
  if (inningsMatchIds.length === 0) return []
  if (!scoped) return inningsMatchIds
  const inningsSet = new Set(inningsMatchIds)
  return scoped.filter(id => inningsSet.has(id))
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
    .select('tournament_id, format, venue, ground_id, tournament:tournaments(ground_id, ground:grounds(name))')
    .eq('id', bookingId)
    .single()
  if (error) throw new Error(error.message)
  if (!booking) throw new Error('Booking not found')

  const tournamentId = booking.tournament_id as string | null
  const tournamentRow = (booking as any).tournament
  // This booking's own ground_id first; the tournament's is only a fallback
  // for a pre-migration-066 row that was never backfilled one of its own.
  const groundId      = ((booking as any).ground_id as string | null) ?? (tournamentRow?.ground_id as string | null)
  const groundName    = tournamentRow?.ground?.name as string | null
  const venue         = booking.venue as string | null
  const format        = booking.format as string | null

  // Legacy free-text fallback only applies when this booking has no real
  // ground_id at all — prefer the ground's own name (covers every booking
  // recorded under that ground) over this booking's raw venue text.
  const legacyVenueToMatch = !groundId ? (groundName ?? venue ?? null) : null

  // Format row is windowed to the last 3 calendar months (not all-time,
  // unlike Tournament/Ground) and gated on MIN_GAMES_FOR_FORMAT_ROW below —
  // it's meant to answer "how is this player playing lately", not "what's
  // their career record in this format".
  const threeMonthsAgo = new Date()
  threeMonthsAgo.setMonth(threeMonthsAgo.getMonth() - 3)
  const threeMonthsAgoStr = threeMonthsAgo.toISOString().split('T')[0]

  const [tournamentMatchIds, groundDirectIds, groundByLegacyVenue, formatMatchIds] = await Promise.all([
    tournamentId ? matchIdsForFilter({ tournamentId }) : Promise.resolve([]),
    groundId ? matchIdsForFilter({ groundId }) : Promise.resolve([]),
    legacyVenueToMatch ? matchIdsForFilter({ venue: legacyVenueToMatch }) : Promise.resolve([]),
    format ? matchIdsForFilter({ format, gameDateFrom: threeMonthsAgoStr }) : Promise.resolve([]),
  ])
  const groundMatchIds = Array.from(new Set([...groundDirectIds, ...groundByLegacyVenue]))

  const [tournament, ground, formatStats] = await Promise.all([
    scopedPlayerStats(playerId, tournamentMatchIds),
    scopedPlayerStats(playerId, groundMatchIds),
    scopedPlayerStats(playerId, formatMatchIds),
  ])

  // Below the minimum sample, the Format row renders "Not enough data"
  // rather than either a thin stats line or a bare "No matches yet" — this
  // collapses the zero-games and few-games cases into the same message,
  // since neither is a meaningful "recent form" read.
  const gatedFormatStats = formatStats && formatStats.matches >= MIN_GAMES_FOR_FORMAT_ROW ? formatStats : null

  return { tournament, ground, format: gatedFormatStats }
}
