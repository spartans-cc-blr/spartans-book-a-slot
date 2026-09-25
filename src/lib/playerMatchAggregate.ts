// Pure, client-safe aggregation over PlayerMatchHistoryRow[] — the shape
// /players/[id]/stats already holds in client state (src/lib/playerStats.ts's
// getPlayerMatchHistory()). No server import here, ever: this file is used
// directly by PlayerStatsClient.tsx ('use client'), so a DB/analytics import
// reached from here would cross the RSC client boundary the same way the
// incident in features/leaderboard.md §8 describes.
//
// Mirrors the math in playerStats.ts's aggregate() (server-only, operates on
// raw analytics-DB rows keyed by snake_case columns) but works directly off
// the already-fetched, already-filtered PlayerMatchHistoryRow[] the client
// holds — so a filter that only ever makes sense client-side (Pitch Type, a
// clicked batting-position bar, a clicked dismissal-type pie slice) can
// recompute the Career/Filtered Summary card without a round trip. See
// features/player-stats-batting-position.md §12.

import type { PlayerMatchHistoryRow, PlayerStatsTotals } from '@/types'

function round2(n: number): number {
  return Math.round(n * 100) / 100
}

// Cricket overs notation ("3.4" = 3 overs + 4 balls) is NOT decimal — same
// helper, same rationale, as playerStats.ts's oversToBalls().
function oversToBalls(overs: number): number {
  if (!overs) return 0
  const whole = Math.trunc(overs)
  const rem = Math.round((overs - whole) * 10)
  return whole * 6 + rem
}

export function aggregateMatchHistoryRows(rows: PlayerMatchHistoryRow[]): PlayerStatsTotals {
  const t: PlayerStatsTotals = {
    matches: rows.length, battingInnings: 0, bowlingInnings: 0, runs: 0, balls: 0, notOuts: 0,
    battingAverage: null, strikeRate: null, fours: 0, sixes: 0,
    wickets: 0, ballsBowled: 0, oversBowled: '0.0', runsConceded: 0, economy: null,
    bowlingStrikeRate: null,
    catches: 0, runOuts: 0, stumpings: 0, mvpPoints: 0,
    battingMvp: 0, bowlingMvp: 0, fieldingMvp: 0,
    highestScore: null, bestBowling: null,
  }

  let battingMvp = 0, bowlingMvp = 0, fieldingMvp = 0

  for (const r of rows) {
    if (r.batting) {
      t.battingInnings++
      t.runs += r.batting.runs
      t.balls += r.batting.balls
      t.fours += r.batting.fours
      t.sixes += r.batting.sixes
      if (r.batting.notOut) t.notOuts++
      // Highest score: most runs; a not-out beats an out on equal runs, then
      // fewer balls faced — same tie-break as aggregate()'s.
      const cand = { runs: r.batting.runs, balls: r.batting.balls, notOut: r.batting.notOut }
      if (!t.highestScore
        || cand.runs > t.highestScore.runs
        || (cand.runs === t.highestScore.runs && cand.notOut && !t.highestScore.notOut)
        || (cand.runs === t.highestScore.runs && cand.notOut === t.highestScore.notOut && cand.balls < t.highestScore.balls)) {
        t.highestScore = cand
      }
      battingMvp += r.batting.mvpScore
    }
    if (r.bowling) {
      t.bowlingInnings++
      t.wickets += r.bowling.wickets
      t.runsConceded += r.bowling.runsConceded
      t.ballsBowled += oversToBalls(Number(r.bowling.overs))
      // Best bowling: most wickets, then fewest runs conceded.
      const cand = { wickets: r.bowling.wickets, runs: r.bowling.runsConceded }
      if (!t.bestBowling
        || cand.wickets > t.bestBowling.wickets
        || (cand.wickets === t.bestBowling.wickets && cand.runs < t.bestBowling.runs)) {
        t.bestBowling = cand
      }
      bowlingMvp += r.bowling.mvpScore
    }
    if (r.fielding) {
      t.catches += r.fielding.catches
      t.runOuts += r.fielding.runOuts
      t.stumpings += r.fielding.stumpings
      fieldingMvp += r.fielding.mvpScore
    }
  }

  const dismissals = t.battingInnings - t.notOuts
  t.battingAverage = dismissals > 0 ? round2(t.runs / dismissals) : null
  t.strikeRate = t.balls > 0 ? round2((t.runs / t.balls) * 100) : null
  t.oversBowled = `${Math.floor(t.ballsBowled / 6)}.${t.ballsBowled % 6}`
  t.economy = t.ballsBowled > 0 ? round2(t.runsConceded / (t.ballsBowled / 6)) : null
  t.bowlingStrikeRate = t.wickets > 0 ? round2(t.ballsBowled / t.wickets) : null

  t.battingMvp = round2(battingMvp)
  t.bowlingMvp = round2(bowlingMvp)
  t.fieldingMvp = round2(fieldingMvp)
  t.mvpPoints = round2(battingMvp + bowlingMvp + fieldingMvp)

  return t
}

// The six raw bowling_stats dismissal-type columns, in a fixed display/
// colour order — never reordered per-render (categorical hues are assigned
// in fixed order, never cycled — see the dataviz skill's color-formula.md).
// Bowled/Caught first (the two most common dismissal types), Other last.
export type DismissalKey = 'bowled' | 'caught' | 'caughtBehind' | 'lbw' | 'stumping' | 'other'

// Validated categorical palette (dataviz skill's default 8-hue theme,
// slots 1-6) — passes the adjacent-pair CVD/contrast gates against this
// app's actual --stats-card-bg surface in both themes: worst adjacent CVD
// ΔE 9.1 light / 8.4 dark (≥8 target), worst adjacent normal-vision ΔE 19.6
// light / 19.3 dark (≥15 floor). Light mode carries a contrast WARN on 3 of
// 6 (aqua/yellow/magenta sub-3:1 on white) — the relief rule applies: every
// value is always shown as a visible legend-row label, never left to
// color-matching alone, so the WARN is satisfied rather than dismissed.
export const DISMISSAL_TYPE_META: { key: DismissalKey; label: string; light: string; dark: string }[] = [
  { key: 'bowled', label: 'Bowled', light: '#2a78d6', dark: '#3987e5' },
  { key: 'caught', label: 'Caught', light: '#eb6834', dark: '#d95926' },
  { key: 'caughtBehind', label: 'Caught Behind', light: '#1baf7a', dark: '#199e70' },
  { key: 'lbw', label: 'LBW', light: '#eda100', dark: '#c98500' },
  { key: 'stumping', label: 'Stumped', light: '#e87ba4', dark: '#d55181' },
  { key: 'other', label: 'Other', light: '#008300', dark: '#008300' },
]
