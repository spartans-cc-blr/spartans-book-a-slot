// Server-only fetch behind /captains-corner/match-planning. Resolves an
// upcoming booking to one of three lenses — its opponent (master id or
// normalised spelling, as the "Opponent → Team Record" link), its ground, or
// its tournament — and finds every past non-practice match in that scope, loads their ball-by-ball rows from the analytics DB
// view `ball_by_ball_linked`, and lists who has said Y/O/E for the booking.
// The aggregation itself is pure: see matchPlanning.ts. See
// features/match-planning.md. Never import into a 'use client' file.

import { createServiceClient } from '@/lib/supabase'
import { createAnalyticsClient } from '@/lib/playerIdentityResolution'
import { fetchAllRows } from '@/lib/playerStats'
import { getTeamMatches, type TeamMatch } from '@/lib/teamStats'
import { normaliseOpponentName } from '@/lib/opponents'
import { repairDismissedBatters, type BallRow } from '@/lib/ballByBall'
import type { ScoutMatchInput } from '@/lib/matchPlanning'

const BALL_COLUMNS = [
  'match_id', 'batting_side', 'seq', 'over_no', 'ball_in_over', 'is_legal', 'bowler', 'batter', 'outcome',
  'runs_bat', 'extras', 'extra_type', 'runs_total', 'is_wicket', 'dismissal_kind', 'dismissal_text',
  'dismissed_batter', 'fielder', 'shot', 'direction', 'score_after', 'wickets_after',
  'bowler_player_id', 'batter_player_id', 'dismissed_player_id', 'fielder_player_id',
].join(', ')

export type Lens = 'opponent' | 'ground' | 'tournament'
export const LENSES: Lens[] = ['opponent', 'tournament', 'ground']

export interface UpcomingOption {
  id: string
  gameDate: string
  slotTime: string
  format: string | null
  opponentName: string
  tournamentName: string | null
  groundName: string | null
}

export interface AvailablePlayer {
  id: string
  name: string
  response: 'Y' | 'O' | 'E'
  cricHeroesUrl: string | null
}

export interface MissingCommentary {
  bookingId: string
  matchId: string
  gameDate: string
  opponentName: string
  cricheroesUrl: string | null
}

export interface PlanningContext {
  upcoming: UpcomingOption[]
  lens: Lens
  /** what the history is scoped to, e.g. "Howzzat", "Blendin Cricket Ground" */
  scopeLabel: string | null
  selected: (UpcomingOption & { opponentId: string | null; groundId: string | null; tournamentId: string | null }) | null
  /** every past, non-practice meeting with a synced scorecard (with or without commentary) */
  history: TeamMatch[]
  /** the subset of `history` that has ball-by-ball data */
  scored: ScoutMatchInput[]
  /** matches in the lens with no ball-by-ball commentary uploaded, newest first */
  missing: MissingCommentary[]
  available: AvailablePlayer[]
}

const one = <T,>(v: T | T[] | null | undefined): T | null => (Array.isArray(v) ? (v[0] ?? null) : (v ?? null))

export async function getPlanningContext(bookingId?: string | null, lens: Lens = 'opponent'): Promise<PlanningContext> {
  const hub = createServiceClient()
  const today = new Date().toISOString().split('T')[0]

  const { data: ups } = await hub
    .from('bookings')
    .select('id, game_date, slot_time, format, opponent_name, opponent_id, is_practice, tournament_id, ground_id, ground:grounds!bookings_ground_id_fkey(id, name), tournament:tournaments!bookings_tournament_id_fkey(name, ground_id, ground:grounds(id, name))')
    .eq('status', 'confirmed')
    .gte('game_date', today)
    .not('opponent_name', 'is', null)
    .order('game_date', { ascending: true })
    .order('slot_time', { ascending: true })
    .limit(15)

  const upRows = ((ups ?? []) as any[]).filter(b => b.opponent_name && String(b.opponent_name).trim())
  // A booking's own ground wins over its tournament's default (bookings.ground_id, migration 066).
  const groundOf = (b: any): { id: string | null; name: string | null } => {
    const own = one<any>(b.ground)
    if (own) return { id: own.id ?? null, name: own.name ?? null }
    const t = one<any>(b.tournament)
    const tg = one<any>(t?.ground)
    return { id: tg?.id ?? t?.ground_id ?? null, name: tg?.name ?? null }
  }
  const upcoming: UpcomingOption[] = upRows.map(b => ({
    id: b.id, gameDate: b.game_date, slotTime: b.slot_time, format: b.format ?? null,
    opponentName: String(b.opponent_name).trim(), tournamentName: one<any>(b.tournament)?.name ?? null,
    groundName: groundOf(b).name,
  }))
  const pick = upRows.find(b => b.id === bookingId) ?? upRows[0]
  if (!pick) return { upcoming, lens, scopeLabel: null, selected: null, history: [], scored: [], missing: [], available: [] }

  const selected = {
    ...upcoming.find(u => u.id === pick.id)!,
    opponentId: (pick.opponent_id as string | null) ?? null,
    groundId: groundOf(pick).id,
    tournamentId: (pick.tournament_id as string | null) ?? null,
  }
  const norm = normaliseOpponentName(selected.opponentName)

  const all = await getTeamMatches()
  const history = all
    .filter(m => !m.isPractice)
    .filter(m => {
      if (lens === 'ground') return !!selected.groundId && m.groundId === selected.groundId
      if (lens === 'tournament') return !!selected.tournamentId && m.tournamentId === selected.tournamentId
      return (!!selected.opponentId && m.opponentId === selected.opponentId) || normaliseOpponentName(m.opponentName) === norm
    })
    .sort((a, b) => b.gameDate.localeCompare(a.gameDate))

  const analytics = createAnalyticsClient()
  const scored: ScoutMatchInput[] = []
  if (analytics && history.length > 0) {
    const ids = Array.from(new Set(history.map(m => m.matchId)))
    const rows = await fetchAllRows<any>(() =>
      analytics.from('ball_by_ball_linked').select(BALL_COLUMNS).in('match_id', ids)
        .order('match_id', { ascending: true }).order('batting_side', { ascending: true }).order('seq', { ascending: true }))
    const byMatch = new Map<string, BallRow[]>()
    for (const r of rows) {
      const arr = byMatch.get(String(r.match_id)) ?? []
      arr.push(r as BallRow)
      byMatch.set(String(r.match_id), arr)
    }
    for (const m of history) {
      const raw = byMatch.get(m.matchId)
      if (!raw || raw.length === 0) continue
      const balls = repairDismissedBatters(raw)
      scored.push({
        bookingId: m.bookingId, matchId: m.matchId, opponentName: m.opponentLabel, gameDate: m.gameDate, format: m.format, result: m.result,
        teamTotal: m.teamTotal, teamWickets: m.teamWickets, oppTotal: m.oppTotal, oppWickets: m.oppWickets, balls,
      })
    }
  }

  const scoredIds = new Set(scored.map(m => m.bookingId))
  const missingRows = history.filter(m => !scoredIds.has(m.bookingId))
  const urlByBooking = new Map<string, string | null>()
  if (missingRows.length > 0) {
    const { data: urls } = await hub.from('bookings').select('id, cricheroes_url').in('id', missingRows.map(m => m.bookingId))
    for (const u of (urls ?? []) as any[]) urlByBooking.set(u.id, u.cricheroes_url ?? null)
  }
  const missing: MissingCommentary[] = missingRows.map(m => ({
    bookingId: m.bookingId, matchId: m.matchId, gameDate: m.gameDate,
    opponentName: m.opponentLabel, cricheroesUrl: urlByBooking.get(m.bookingId) ?? null,
  }))

  // availability has two FKs to players (player_id and updated_by), so embedding
  // players(...) is ambiguous in PostgREST and errors. Fetch the two separately.
  const { data: av, error: avErr } = await hub
    .from('availability')
    .select('player_id, response')
    .eq('booking_id', pick.id)
    .in('response', ['Y', 'O', 'E'])
  if (avErr) console.error('[match-planning] availability read failed:', avErr.message)
  const respByPlayer = new Map<string, 'Y' | 'O' | 'E'>(
    ((av ?? []) as any[]).map(r => [r.player_id as string, r.response as 'Y' | 'O' | 'E']))
  let available: AvailablePlayer[] = []
  if (respByPlayer.size > 0) {
    const { data: ps, error: pErr } = await hub
      .from('players')
      .select('id, name, status, cricheroes_url')
      .in('id', Array.from(respByPlayer.keys()))
    if (pErr) console.error('[match-planning] players read failed:', pErr.message)
    available = ((ps ?? []) as any[])
      .filter(p => p.status !== 'expelled')
      .map(p => ({ id: p.id, name: p.name, response: respByPlayer.get(p.id)!, cricHeroesUrl: p.cricheroes_url ?? null }))
      .sort((a, b) => a.name.localeCompare(b.name))
  }

  const scopeLabel = lens === 'ground' ? selected.groundName : lens === 'tournament' ? selected.tournamentName : selected.opponentName
  return { upcoming, lens, scopeLabel, selected, history, scored, missing, available }
}
