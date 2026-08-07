// Detects and permanently logs "club recognition" milestones — a player's
// runs / wickets / fielding-dismissals total for the calendar year a match
// was played in crossing a fixed threshold. Called from
// src/lib/matchStatsSync.ts as the last step of every scorecard sync
// (manual upload/"Sync Stats" click, or the unattended twice-daily
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
