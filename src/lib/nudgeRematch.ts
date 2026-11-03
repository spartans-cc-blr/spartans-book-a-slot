// Rematch recall for the availability-nudge system — see
// src/lib/availabilityNudge.ts (the 'rematch_recall' theme) and
// .claude/rules/features/availability-nudge.md §3b.
//
// For each nextLockWeekend booking with a resolved opponent, finds every
// player's own best past batting/bowling performance against that same
// opponent (any prior confirmed, synced meeting), so a standout performer
// can be nudged with a specific, flattering callback — "you scored 51
// against them last time" — rather than a generic reminder.
//
// Deliberately reuses match_stats_cache (already synced into the Hub DB by
// syncMatchStatsForBooking()) rather than querying the separate analytics
// project directly — this cron only ever needs the service-role Hub
// client, same as every other theme in this feature, and match_stats_cache
// already mirrors the exact batting/bowling column shapes this needs.
//
// Qualification thresholds reuse the club's existing "worth bragging
// about" bands — half-century (50+ runs) and three-wicket haul (3+
// wickets) — the same bar milestone-recognition.md's
// match_performance_achievements already uses for a single-match
// highlight. Reusing these rather than inventing a third threshold keeps
// one consistent definition of "a standout performance" across the app.

import { createServiceClient } from '@/lib/supabase'
import type { NudgeBooking } from '@/lib/availabilityNudge'

type ServiceClient = ReturnType<typeof createServiceClient>

const REMATCH_MIN_RUNS = 50
const REMATCH_MIN_WICKETS = 3

export interface RematchBattingHighlight {
  runs: number
  balls: number
  notOut: boolean
  bookingId: string
  gameDate: string | null
  ground: string | null
}

export interface RematchBowlingHighlight {
  wickets: number
  runsConceded: number
  bookingId: string
  gameDate: string | null
  ground: string | null
}

export interface RematchRecallInfo {
  playerId: string
  opponentName: string
  batting?: RematchBattingHighlight
  bowling?: RematchBowlingHighlight
}

interface MutableHighlight {
  batting?: RematchBattingHighlight
  bowling?: RematchBowlingHighlight
}

function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = []
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size))
  return out
}

// One call per cron run (or per dashboard lookup) — never per player, never
// per booking. Resolves each unique opponent_id across `bookings` exactly
// once and maps the result back onto every booking against that opponent,
// so cost scales with distinct opponents this weekend (typically 1-3,
// given the R1 weekend cap), not with roster size.
export async function getRematchRecalls(
  supabase: ServiceClient,
  bookings: NudgeBooking[]
): Promise<Map<string, RematchRecallInfo[]>> {
  const result = new Map<string, RematchRecallInfo[]>()
  if (!bookings.length) return result

  // Practice-tournament bookings are excluded from "who's the standout
  // against this opponent" — same "real stats only" posture every other
  // ranking surface in this app applies. tournament_is_practice already
  // carries the combined booking-OR-tournament signal (see NudgeBooking's
  // own comment) once attachGroundTournamentInfo() has run.
  const eligibleBookings = bookings.filter(b => b.opponent_id && !b.tournament_is_practice)
  if (!eligibleBookings.length) return result

  const opponentIds = Array.from(new Set(eligibleBookings.map(b => b.opponent_id as string)))
  const today = new Date().toISOString().split('T')[0]

  // Past confirmed, synced meetings against any of this weekend's
  // opponents. Two-step fetch (bookings, then match_stats_cache by
  // booking_id) rather than a nested embed filter — mirrors the pattern
  // every other match_stats_cache reader in this codebase already uses
  // (see teamStats.ts's getTeamMatchesUncached()).
  const pastBookings: { id: string; opponent_id: string; is_practice: boolean | null; tournament: { is_practice: boolean | null } | null }[] = []
  for (const ids of chunk(opponentIds, 200)) {
    const { data } = await supabase
      .from('bookings')
      .select('id, opponent_id, is_practice, tournament:tournaments(is_practice)')
      .in('opponent_id', ids)
      .eq('status', 'confirmed')
      .not('match_id', 'is', null)
      .lt('game_date', today)
    for (const row of ((data ?? []) as any[])) {
      pastBookings.push({
        id: row.id,
        opponent_id: row.opponent_id,
        is_practice: row.is_practice ?? false,
        tournament: row.tournament ?? null,
      })
    }
  }

  const realPastBookings = pastBookings.filter(b => !b.is_practice && !b.tournament?.is_practice)
  if (!realPastBookings.length) return result

  const opponentByBookingId = new Map(realPastBookings.map(b => [b.id, b.opponent_id]))
  const pastBookingIds = realPastBookings.map(b => b.id)

  const cacheRows: { booking_id: string; ground: string | null; match_date: string | null; batting: any[] | null; bowling: any[] | null }[] = []
  for (const ids of chunk(pastBookingIds, 200)) {
    const { data } = await supabase
      .from('match_stats_cache')
      .select('booking_id, ground, match_date, batting, bowling')
      .in('booking_id', ids)
    cacheRows.push(...((data ?? []) as any[]))
  }

  // opponent_id -> player_id -> best highlight so far.
  const byOpponent = new Map<string, Map<string, MutableHighlight>>()

  for (const row of cacheRows) {
    const opponentId = opponentByBookingId.get(row.booking_id)
    if (!opponentId) continue

    const perPlayer = byOpponent.get(opponentId) ?? new Map<string, MutableHighlight>()
    byOpponent.set(opponentId, perPlayer)

    for (const bat of (row.batting ?? [])) {
      if (!bat?.batted || !bat.player_id) continue
      const runs = Number(bat.runs) || 0
      if (runs < REMATCH_MIN_RUNS) continue
      const existing = perPlayer.get(bat.player_id) ?? {}
      if (!existing.batting || runs > existing.batting.runs) {
        existing.batting = {
          runs,
          balls: Number(bat.balls) || 0,
          notOut: bat.not_out === 'Y',
          bookingId: row.booking_id,
          gameDate: row.match_date ?? null,
          ground: row.ground ?? null,
        }
      }
      perPlayer.set(bat.player_id, existing)
    }

    for (const bowl of (row.bowling ?? [])) {
      if (!bowl?.did_bowl || !bowl.player_id) continue
      const wickets = Number(bowl.wickets) || 0
      if (wickets < REMATCH_MIN_WICKETS) continue
      const runsConceded = Number(bowl.runs) || 0
      const existing = perPlayer.get(bowl.player_id) ?? {}
      if (!existing.bowling
        || wickets > existing.bowling.wickets
        || (wickets === existing.bowling.wickets && runsConceded < existing.bowling.runsConceded)) {
        existing.bowling = {
          wickets,
          runsConceded,
          bookingId: row.booking_id,
          gameDate: row.match_date ?? null,
          ground: row.ground ?? null,
        }
      }
      perPlayer.set(bowl.player_id, existing)
    }
  }

  for (const booking of eligibleBookings) {
    const perPlayer = byOpponent.get(booking.opponent_id as string)
    if (!perPlayer?.size) continue
    const infos: RematchRecallInfo[] = []
    perPlayer.forEach((highlight, playerId) => {
      if (!highlight.batting && !highlight.bowling) return
      infos.push({
        playerId,
        opponentName: booking.opponent_name ?? 'this opponent',
        batting: highlight.batting,
        bowling: highlight.bowling,
      })
    })
    if (infos.length) result.set(booking.id, infos)
  }

  return result
}
