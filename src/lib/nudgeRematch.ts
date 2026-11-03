// Rematch recall for the availability-nudge system — see
// src/lib/availabilityNudge.ts (the 'rematch_recall' / 'rematch_ready'
// themes) and .claude/rules/features/availability-nudge.md §3b.
//
// For each nextLockWeekend booking with a resolved opponent, finds every
// player's own best past performance against that same opponent — but
// "best performance" is deliberately NOT a flat runs/wickets threshold
// (an earlier version of this file used 50+ runs / 3+ wickets, mirroring
// milestone-recognition.md's single-match highlight bands). It now reuses
// computeTopPerformers() (matchTopPerformers.ts) instead — the exact same
// tie-inclusive "who was the actual standout of this one match" logic
// already used for the gold top-scorer/top-wicket-taker highlight on
// ScorecardTables.tsx and for granting verify/flag access
// (post-match-scorecard.md §15). A rematch-recall nudge therefore only
// ever names a performance that genuinely stood out *in that match* — a
// low-scoring game can still produce a credited "top scorer" well under
// 50 runs, and a high-scoring one won't credit a 40 that wasn't actually
// the best innings on the day.
//
// Known trade-off inherited from computeTopPerformers(): it only resolves
// a performer to a Hub player_id by cross-checking that match's own squad
// rows (see matchTopPerformers.ts's "Known gap" note) — a past meeting
// with no squad rows at all (never staffed through Captains' Corner, or
// never backfilled) simply resolves no performers for that match, even if
// the scorecard name itself is already reconciled. This is the same
// trade-off the rest of the app already accepts for this exact logic
// (the verify/flag grant, the ScorecardTables gold highlight) — accepted
// here too, for consistency, rather than inventing a second, looser
// definition of "performer" just for this nudge.
//
// Deliberately reuses match_stats_cache (already synced into the Hub DB
// by syncMatchStatsForBooking()) rather than querying the separate
// analytics project directly — this cron only ever needs the service-role
// Hub client, same as every other theme in this feature.

import { createServiceClient } from '@/lib/supabase'
import type { NudgeBooking } from '@/lib/availabilityNudge'
import { computeTopPerformers, type SquadRef } from '@/lib/matchTopPerformers'

type ServiceClient = ReturnType<typeof createServiceClient>

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

// Same defensive field-lookup convention matchTopPerformers.ts documents on
// its own (unexported) pickField/num — analytics-DB field names aren't part
// of this repo's schema, so every lookup tries a couple of likely keys
// rather than assuming one exact shape. Needed here only to pull the raw
// runs/balls/not_out/wickets/runs-conceded off the row a performer was
// computed from — computeTopPerformers() itself already did the harder
// work of deciding WHO qualifies as this match's top performer.
function pickField(row: any, keys: string[]): any {
  for (const k of keys) if (row?.[k] != null) return row[k]
  return null
}

function num(row: any, keys: string[]): number {
  const v = pickField(row, keys)
  return v != null ? Number(v) : 0
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
  if (!cacheRows.length) return result

  // Each past meeting's own squad — computeTopPerformers() resolves a
  // performer's player_id against the squad that actually played THAT
  // match (see matchTopPerformers.ts's "Known gap" note, and this file's
  // own header comment above). Batched the same way the bookings/
  // match_stats_cache fetches above are.
  const squadRows: { booking_id: string; player_id: string; players: { name: string } | null }[] = []
  for (const ids of chunk(pastBookingIds, 200)) {
    const { data } = await supabase
      .from('squad')
      .select('booking_id, player_id, players(name)')
      .in('booking_id', ids)
    squadRows.push(...((data ?? []) as any[]))
  }
  const squadByBooking = new Map<string, SquadRef[]>()
  for (const row of squadRows) {
    const list = squadByBooking.get(row.booking_id) ?? []
    list.push({ player_id: row.player_id, player_name: row.players?.name ?? '' })
    squadByBooking.set(row.booking_id, list)
  }

  // opponent_id -> player_id -> best highlight so far, across every past
  // meeting where this player was THAT match's own top performer.
  const byOpponent = new Map<string, Map<string, MutableHighlight>>()

  for (const row of cacheRows) {
    const opponentId = opponentByBookingId.get(row.booking_id)
    if (!opponentId) continue

    const batting = row.batting ?? []
    const bowling = row.bowling ?? []
    const squad = squadByBooking.get(row.booking_id) ?? []
    const performers = computeTopPerformers(batting, bowling, squad)
    if (!performers.length) continue

    const perPlayer = byOpponent.get(opponentId) ?? new Map<string, MutableHighlight>()
    byOpponent.set(opponentId, perPlayer)

    for (const performer of performers) {
      if (!performer.player_id) continue
      const existing = perPlayer.get(performer.player_id) ?? {}

      if (performer.reason === 'top_scorer') {
        const matchRow = batting.find((r: any) => (pickField(r, ['player_name', 'name']) ?? '') === performer.name)
        if (!matchRow) continue
        const runs = num(matchRow, ['runs', 'total_runs'])
        if (!existing.batting || runs > existing.batting.runs) {
          existing.batting = {
            runs,
            balls: num(matchRow, ['balls', 'balls_faced']),
            notOut: pickField(matchRow, ['not_out']) === 'Y',
            bookingId: row.booking_id,
            gameDate: row.match_date ?? null,
            ground: row.ground ?? null,
          }
        }
      } else {
        const matchRow = bowling.find((r: any) => (pickField(r, ['player_name', 'name']) ?? '') === performer.name)
        if (!matchRow) continue
        const wickets = num(matchRow, ['wickets', 'wickets_taken'])
        const runsConceded = num(matchRow, ['runs', 'runs_conceded'])
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
      }
      perPlayer.set(performer.player_id, existing)
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
