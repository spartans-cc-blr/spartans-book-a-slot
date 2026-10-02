// Server-only fetch behind /captains-corner/opponent-scouting. Resolves an
// upcoming booking to its opponent, finds every past non-practice meeting
// (same matching as the "Opponent → Team Record" link: master id or
// normalised spelling), loads their ball-by-ball rows from the analytics DB
// view `ball_by_ball_linked`, and lists who has said Y/O/E for the booking.
// The aggregation itself is pure: see opponentScouting.ts. See
// features/opponent-scouting.md. Never import into a 'use client' file.

import { createServiceClient } from '@/lib/supabase'
import { createAnalyticsClient } from '@/lib/playerIdentityResolution'
import { fetchAllRows } from '@/lib/playerStats'
import { getTeamMatches, type TeamMatch } from '@/lib/teamStats'
import { normaliseOpponentName } from '@/lib/opponents'
import type { BallRow } from '@/lib/ballByBall'
import type { ScoutMatchInput } from '@/lib/opponentScouting'

const BALL_COLUMNS = [
  'match_id', 'batting_side', 'seq', 'over_no', 'ball_in_over', 'is_legal', 'bowler', 'batter', 'outcome',
  'runs_bat', 'extras', 'extra_type', 'runs_total', 'is_wicket', 'dismissal_kind', 'dismissal_text',
  'dismissed_batter', 'fielder', 'shot', 'direction', 'score_after', 'wickets_after',
  'bowler_player_id', 'batter_player_id', 'dismissed_player_id', 'fielder_player_id',
].join(', ')

export interface UpcomingOption {
  id: string
  gameDate: string
  slotTime: string
  format: string | null
  opponentName: string
  tournamentName: string | null
}

export interface AvailablePlayer {
  id: string
  name: string
  response: 'Y' | 'O' | 'E'
  cricHeroesUrl: string | null
}

export interface ScoutingContext {
  upcoming: UpcomingOption[]
  selected: (UpcomingOption & { opponentId: string | null }) | null
  /** every past, non-practice meeting with a synced scorecard (with or without commentary) */
  history: TeamMatch[]
  /** the subset of `history` that has ball-by-ball data */
  scored: ScoutMatchInput[]
  available: AvailablePlayer[]
}

const one = <T,>(v: T | T[] | null | undefined): T | null => (Array.isArray(v) ? (v[0] ?? null) : (v ?? null))

export async function getScoutingContext(bookingId?: string | null): Promise<ScoutingContext> {
  const hub = createServiceClient()
  const today = new Date().toISOString().split('T')[0]

  const { data: ups } = await hub
    .from('bookings')
    .select('id, game_date, slot_time, format, opponent_name, opponent_id, is_practice, tournament:tournaments!bookings_tournament_id_fkey(name)')
    .eq('status', 'confirmed')
    .gte('game_date', today)
    .not('opponent_name', 'is', null)
    .order('game_date', { ascending: true })
    .order('slot_time', { ascending: true })
    .limit(15)

  const upRows = ((ups ?? []) as any[]).filter(b => b.opponent_name && String(b.opponent_name).trim())
  const upcoming: UpcomingOption[] = upRows.map(b => ({
    id: b.id, gameDate: b.game_date, slotTime: b.slot_time, format: b.format ?? null,
    opponentName: String(b.opponent_name).trim(), tournamentName: one<any>(b.tournament)?.name ?? null,
  }))
  const pick = upRows.find(b => b.id === bookingId) ?? upRows[0]
  if (!pick) return { upcoming, selected: null, history: [], scored: [], available: [] }

  const selected = { ...upcoming.find(u => u.id === pick.id)!, opponentId: (pick.opponent_id as string | null) ?? null }
  const norm = normaliseOpponentName(selected.opponentName)

  const all = await getTeamMatches()
  const history = all
    .filter(m => !m.isPractice)
    .filter(m => (selected.opponentId && m.opponentId === selected.opponentId) || normaliseOpponentName(m.opponentName) === norm)
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
      const balls = byMatch.get(m.matchId)
      if (!balls || balls.length === 0) continue
      scored.push({
        bookingId: m.bookingId, matchId: m.matchId, gameDate: m.gameDate, format: m.format, result: m.result,
        teamTotal: m.teamTotal, teamWickets: m.teamWickets, oppTotal: m.oppTotal, oppWickets: m.oppWickets, balls,
      })
    }
  }

  const { data: av } = await hub
    .from('availability')
    .select('response, players(id, name, status, cricheroes_url)')
    .eq('booking_id', pick.id)
    .in('response', ['Y', 'O', 'E'])
  const available: AvailablePlayer[] = ((av ?? []) as any[])
    .map(r => ({ r, p: one<any>(r.players) }))
    .filter(x => x.p && x.p.status !== 'expelled')
    .map(x => ({ id: x.p.id, name: x.p.name, response: x.r.response, cricHeroesUrl: x.p.cricheroes_url ?? null }))
    .sort((a, b) => a.name.localeCompare(b.name))

  return { upcoming, selected, history, scored, available }
}
