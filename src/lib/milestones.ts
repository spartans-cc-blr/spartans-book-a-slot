// Detects and permanently logs "club recognition" achievements, in two
// flavours: season milestones (detectAndLogMilestones — a player's runs /
// wickets / fielding-dismissals total for the calendar year crossing a
// fixed threshold) and single-match performance highlights
// (detectAndLogMatchPerformances — a century/half-century, a five- or
// three-wicket haul, five-plus dismissals, all in one match). Both are
// called from src/lib/matchStatsSync.ts as the last step of every scorecard
// sync (manual upload/"Sync Stats" click, or the unattended twice-daily
// backfill/cron path — see features/post-match-scorecard.md), so detection
// covers both sync paths without either one needing its own copy.
//
// Deliberately re-derives the player's full-season total from the same
// getPlayerSeasonStats() the leaderboard and personal stats pages already
// use (analytics DB, practice games excluded by default) rather than
// diffing this one match's stats against a "before" snapshot — simpler,
// and correct even the very first time this runs against a player already
// well past a threshold from earlier matches this year: every
// not-yet-logged threshold at or below their current total is recorded at
// once, not just the one this particular sync happened to cross.
//
// Idempotency is enforced by the DB (UNIQUE(player_id, milestone_type,
// milestone_value, year), see supabase/migrations/059_milestone_achievements.sql),
// not by this function — a re-sync (reconciliation, a stale cache fix)
// upserts the same rows and ignores the conflicts.
//
// Best-effort: every error is caught and logged, never thrown. A bug here
// must never fail the scorecard sync it's attached to.

import { createServiceClient } from '@/lib/supabase'
import { getPlayerSeasonStats } from '@/lib/playerStats'
import { resolveSquadMatch, type SquadRef } from '@/lib/matchTopPerformers'

export type MilestoneType = 'runs' | 'wickets' | 'dismissals'

export const MILESTONE_THRESHOLDS: Record<MilestoneType, number[]> = {
  runs:       [500, 750, 1000],
  wickets:    [50, 75, 100],
  dismissals: [50, 75, 100],
}

export async function detectAndLogMilestones(bookingId: string, year: number, playerIds: string[]): Promise<void> {
  try {
    if (playerIds.length === 0) return
    const supabase = createServiceClient()

    const totals = await Promise.all(
      playerIds.map(async playerId => ({ playerId, stats: await getPlayerSeasonStats(playerId, year) }))
    )

    const rows: { player_id: string; milestone_type: MilestoneType; milestone_value: number; booking_id: string; year: number }[] = []
    for (const { playerId, stats } of totals) {
      const values: Record<MilestoneType, number> = {
        runs:       stats.runs,
        wickets:    stats.wickets,
        dismissals: stats.catches + stats.runOuts + stats.stumpings,
      }
      for (const type of Object.keys(MILESTONE_THRESHOLDS) as MilestoneType[]) {
        for (const threshold of MILESTONE_THRESHOLDS[type]) {
          if (values[type] >= threshold) {
            rows.push({ player_id: playerId, milestone_type: type, milestone_value: threshold, booking_id: bookingId, year })
          }
        }
      }
    }
    if (rows.length === 0) return

    const { error } = await supabase
      .from('milestone_achievements')
      .upsert(rows, { onConflict: 'player_id,milestone_type,milestone_value,year', ignoreDuplicates: true })
    if (error) console.error('[milestones] insert failed:', error.message)
  } catch (err) {
    console.error('[milestones] detection failed:', err)
  }
}

// Single-match performance highlights — a century/half-century in one
// innings, a five- or three-wicket haul in one spell, five-or-more fielding
// dismissals in one match. Unlike the season milestones above, these are
// read directly off the batting/bowling/fielding rows already fetched for
// THIS match inside syncMatchStatsForBooking() — no extra round trip, no
// season aggregation needed, since "did this one match qualify" is fully
// answered by that match's own rows.
//
// Runs/wickets bands are mutually exclusive per innings (the higher band
// wins) — a player who scores 120 is credited a century, not also a
// half-century, mirroring getPerformances()'s centuries/halfCenturies split
// in src/lib/playerStats.ts. `value` carries the exact runs/wickets/
// dismissals achieved, for display ("127 runs", not just "a century").
//
// Idempotency: UNIQUE(player_id, booking_id, performance_type) — a re-sync
// of the same match can't double-log the same performance, and a player
// can rack up the same performance_type across many different matches in a
// season (unlike the once-per-year season milestones above).
export type MatchPerformanceType = 'century' | 'half_century' | 'five_wicket_haul' | 'three_wicket_haul' | 'five_dismissals'

// `squad` lets a row resolve via resolveSquadMatch()'s case-insensitive
// name fallback when the analytics row's own player_id is still null
// (i.e. this match's scorecard names haven't been through
// /admin/player-reconciliation yet — see playerIdentityResolution.ts).
// Before this, a freshly-synced match with zero reconciled names silently
// logged nothing at all, even for a player whose name matched the squad
// byte-for-byte — the same class of bug post-match-scorecard.md §15
// already fixed for computeTopPerformers()/computeMatchMVP(), just never
// applied here.
export async function detectAndLogMatchPerformances(
  bookingId: string,
  batting: any[],
  bowling: any[],
  fielding: any[],
  squad: SquadRef[]
): Promise<void> {
  try {
    const rows: { player_id: string; booking_id: string; performance_type: MatchPerformanceType; value: number }[] = []

    for (const r of batting) {
      if (!r.batted) continue
      const playerId = resolveSquadMatch(r, r.player_name, squad)?.player_id
      if (!playerId) continue
      const runs = Number(r.runs) || 0
      if (runs >= 100) rows.push({ player_id: playerId, booking_id: bookingId, performance_type: 'century', value: runs })
      else if (runs >= 50) rows.push({ player_id: playerId, booking_id: bookingId, performance_type: 'half_century', value: runs })
    }

    for (const r of bowling) {
      if (!r.did_bowl) continue
      const playerId = resolveSquadMatch(r, r.player_name, squad)?.player_id
      if (!playerId) continue
      const wickets = Number(r.wickets) || 0
      if (wickets >= 5) rows.push({ player_id: playerId, booking_id: bookingId, performance_type: 'five_wicket_haul', value: wickets })
      else if (wickets >= 3) rows.push({ player_id: playerId, booking_id: bookingId, performance_type: 'three_wicket_haul', value: wickets })
    }

    for (const r of fielding) {
      const playerId = resolveSquadMatch(r, r.player_name, squad)?.player_id
      if (!playerId) continue
      const dismissals = (Number(r.catches) || 0) + (Number(r.caught_behind) || 0) + (Number(r.run_outs) || 0) + (Number(r.stumpings) || 0)
      if (dismissals >= 5) rows.push({ player_id: playerId, booking_id: bookingId, performance_type: 'five_dismissals', value: dismissals })
    }

    if (rows.length === 0) return

    const supabase = createServiceClient()
    const { error } = await supabase
      .from('match_performance_achievements')
      .upsert(rows, { onConflict: 'player_id,booking_id,performance_type', ignoreDuplicates: true })
    if (error) console.error('[milestones] match performance insert failed:', error.message)
  } catch (err) {
    console.error('[milestones] match performance detection failed:', err)
  }
}
