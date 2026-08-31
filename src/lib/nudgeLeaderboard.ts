// Ground/tournament leaderboard recognition for the availability-nudge
// system — see src/lib/availabilityNudge.ts (the 'leaderboard_leader'
// theme) and .claude/rules/features/availability-nudge.md §3a.
//
// For each nextLockWeekend booking, resolves its ground and tournament and
// finds the all-time leader(s) — MVP, run-scorer, wicket-taker, dismissals
// — at each scope, so a standout player can be nudged with a specific,
// flattering reason to confirm availability rather than a generic reminder.
//
// Deliberately reuses getLeaderboard() (src/lib/playerStats.ts) rather than
// building parallel SQL/views for this — that function already computes
// all four metrics in one pass per player, already handles the >1000-row
// PostgREST pagination cap, and already excludes practice-tournament
// matches from a ground-only scope. Re-deriving any of that here would risk
// reintroducing bugs already found and fixed there.
//
// No minimum-sample threshold, unlike every qualification bar elsewhere on
// the leaderboard (minGamesThreshold, minDismissalsThreshold) — a
// deliberate product decision for this feature: a player who's only played
// one game at a ground but leads it is still worth nudging. The only floor
// applied is "> 0" (excludes crowning a leader who's contributed nothing at
// that scope, e.g. a ground nobody's taken a wicket at yet), which is a
// correctness guard, not a sample-size threshold.

import { getLeaderboard } from '@/lib/playerStats'
import { bestByAll, totalDismissals } from '@/lib/leaderboardMilestones'
import { createServiceClient } from '@/lib/supabase'
import type { LeaderboardRow } from '@/types'
import type { NudgeBooking } from '@/lib/availabilityNudge'

export type LeaderMetric = 'mvp' | 'runs' | 'wickets' | 'dismissals'
export type LeaderScope  = 'ground' | 'tournament'

export interface BookingLeaderInfo {
  playerId: string
  scopes: { scope: LeaderScope; label: string; metrics: LeaderMetric[] }[]
}

const METRIC_VALUE: Record<LeaderMetric, (r: LeaderboardRow) => number> = {
  mvp:        r => r.stats.mvpPoints,
  runs:       r => r.stats.runs,
  wickets:    r => r.stats.wickets,
  dismissals: r => totalDismissals(r),
}

// playerId -> metrics led, for one ground/tournament's leaderboard rows.
function leadersByMetric(rows: LeaderboardRow[]): Map<string, LeaderMetric[]> {
  const result = new Map<string, LeaderMetric[]>()
  for (const metric of Object.keys(METRIC_VALUE) as LeaderMetric[]) {
    const value = METRIC_VALUE[metric]
    const leaders = bestByAll(rows, value, r => value(r) > 0)
    for (const leader of leaders) {
      const metrics = result.get(leader.playerId) ?? []
      metrics.push(metric)
      result.set(leader.playerId, metrics)
    }
  }
  return result
}

// One call per cron run (or per dashboard lookup) — never per player, never
// per booking. Resolves each unique ground_id/tournament_id across
// `bookings` exactly once and maps the result back onto every booking that
// shares that ground/tournament, so cost scales with distinct grounds/
// tournaments this weekend (typically 1-3, given the R1 weekend cap), not
// with roster size.
export async function getBookingLeaders(
  bookings: NudgeBooking[]
): Promise<Map<string, BookingLeaderInfo[]>> {
  const result = new Map<string, BookingLeaderInfo[]>()
  if (!bookings.length) return result

  const groundIds = Array.from(new Set(
    bookings.map(b => b.ground_id).filter((id): id is string => !!id)
  ))
  // Practice-tournament bookings are excluded from the tournament scope —
  // same "real stats only" posture every other ranking surface in this app
  // applies. Grounds aren't practice-specific, so the ground scope is
  // unaffected.
  const tournamentIds = Array.from(new Set(
    bookings
      .filter(b => !b.tournament_is_practice)
      .map(b => b.tournament_id)
      .filter((id): id is string => !!id)
  ))

  const [groundLeaderRows, tournamentLeaderRows] = await Promise.all([
    Promise.all(groundIds.map(groundId => getLeaderboard({ groundId }))),
    Promise.all(tournamentIds.map(tournamentId => getLeaderboard({ tournamentId }))),
  ])

  const groundLeadersById     = new Map(groundIds.map((id, i) => [id, leadersByMetric(groundLeaderRows[i])]))
  const tournamentLeadersById = new Map(tournamentIds.map((id, i) => [id, leadersByMetric(tournamentLeaderRows[i])]))

  for (const booking of bookings) {
    const byPlayer = new Map<string, BookingLeaderInfo>()

    if (booking.ground_id && booking.ground_name) {
      const leaders = groundLeadersById.get(booking.ground_id)
      leaders?.forEach((metrics, playerId) => {
        const entry = byPlayer.get(playerId) ?? { playerId, scopes: [] }
        entry.scopes.push({ scope: 'ground', label: booking.ground_name!, metrics })
        byPlayer.set(playerId, entry)
      })
    }

    if (booking.tournament_id && booking.tournament_name && !booking.tournament_is_practice) {
      const leaders = tournamentLeadersById.get(booking.tournament_id)
      leaders?.forEach((metrics, playerId) => {
        const entry = byPlayer.get(playerId) ?? { playerId, scopes: [] }
        entry.scopes.push({ scope: 'tournament', label: booking.tournament_name!, metrics })
        byPlayer.set(playerId, entry)
      })
    }

    if (byPlayer.size) result.set(booking.id, Array.from(byPlayer.values()))
  }

  return result
}

// Resolves ground_id/ground_name/tournament_is_practice onto a set of
// bookings already fetched by fetchNextLockWeekendBookings() — kept
// separate from that function (rather than folded into its own select) so
// availabilityNudge.ts doesn't have to pull leaderboard-only fields
// (ground name, is_practice) into every other theme's code path.
export async function attachGroundTournamentInfo(
  supabase: ReturnType<typeof createServiceClient>,
  bookings: NudgeBooking[]
): Promise<NudgeBooking[]> {
  if (!bookings.length) return bookings

  const { data } = await supabase
    .from('bookings')
    .select('id, ground_id, tournament:tournaments(ground_id, is_practice, ground:grounds(name))')
    .in('id', bookings.map(b => b.id))

  interface ResolvedInfo { groundId: string | null; groundName: string | null; isPractice: boolean }

  const infoById = new Map<string, ResolvedInfo>((data ?? []).map((row: any): [string, ResolvedInfo] => {
    const tournamentRow = row.tournament
    const groundId   = (row.ground_id as string | null) ?? (tournamentRow?.ground_id as string | null) ?? null
    const groundName = (tournamentRow?.ground?.name as string | null) ?? null
    const isPractice = !!tournamentRow?.is_practice
    return [row.id as string, { groundId, groundName, isPractice }]
  }))

  return bookings.map(b => {
    const info = infoById.get(b.id)
    return {
      ...b,
      ground_id: info?.groundId ?? null,
      ground_name: info?.groundName ?? null,
      tournament_is_practice: info?.isPractice ?? false,
    }
  })
}
