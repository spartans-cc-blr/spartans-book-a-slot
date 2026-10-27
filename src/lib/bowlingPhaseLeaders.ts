// Pure logic behind /leaderboard's Detailed → Bowl control charts (Dot Ball %
// and Least Boundaries Conceded %): ranking, the phase-of-play breakdown from
// ball-by-ball rows, and the gate that decides whether the phase tabs show.
// No I/O and no React, so it's safe to import anywhere and unit-tested in
// bowlingPhaseLeaders.test.ts. See features/leaderboard.md §6.2.3.

import { isDotForBowler, phaseOf, PHASE_KEYS, type BallRow, type PhaseKey } from '@/lib/ballByBall'
import { isBoundary } from '@/lib/matchInsights'
import type { LeaderboardRow } from '@/types'

// ── Ranking (shared by the scorecard view and every phase view) ────────────

export const CONTROL_COHORT_SIZE = 15
export const CONTROL_TOP_N = 10

export interface ControlItem {
  playerId: string
  playerName: string
  cricheroesUrl: string | null
  balls: number
  dots: number
  boundaries: number
  /** Present on the stacked "All" view: the same totals split by phase. */
  phases?: Record<PhaseKey, PhaseTally>
}

export interface ControlEntry { item: ControlItem; count: number; balls: number; pct: number }

/** Scorecard view: balls bowled, dots and fours+sixes straight off the leaderboard rows. */
export function itemsFromRows(rows: LeaderboardRow[]): ControlItem[] {
  return rows
    .filter(r => r.stats.bowlDots != null)
    .map(r => ({
      playerId: r.playerId, playerName: r.playerName, cricheroesUrl: r.cricheroesUrl,
      balls: r.stats.ballsBowled, dots: r.stats.bowlDots ?? 0,
      boundaries: (r.stats.bowlFours ?? 0) + (r.stats.bowlSixes ?? 0),
    }))
}

/** The CONTROL_COHORT_SIZE bowlers with the most balls (everyone tied at the cut-off stays in),
 *  after dropping anyone under `minBalls`. */
export function controlCohort(items: ControlItem[], minBalls: number): ControlItem[] {
  const eligible = items.filter(i => i.balls >= minBalls).sort((a, b) => b.balls - a.balls)
  if (eligible.length <= CONTROL_COHORT_SIZE) return eligible
  const cutoff = eligible[CONTROL_COHORT_SIZE - 1].balls
  return eligible.filter(i => i.balls >= cutoff)
}

function rank(pool: ControlItem[], count: (i: ControlItem) => number, asc: boolean): ControlEntry[] {
  return pool
    .map(item => ({ item, count: count(item), balls: item.balls, pct: (count(item) / item.balls) * 100 }))
    .sort((a, b) => (asc ? a.pct - b.pct : b.pct - a.pct) || b.balls - a.balls || a.item.playerName.localeCompare(b.item.playerName))
    .slice(0, CONTROL_TOP_N)
}

/** Dot ball % (highest first) and boundary % conceded (lowest first), ranked within the cohort. */
export function rankControl(items: ControlItem[], minBalls: number): { dots: ControlEntry[]; boundaries: ControlEntry[] } {
  const pool = controlCohort(items, minBalls)
  return { dots: rank(pool, i => i.dots, false), boundaries: rank(pool, i => i.boundaries, true) }
}

// ── Phase of play (ball-by-ball) ───────────────────────────────────────────

/** Phase tabs only appear when at least this share of the filter's matches have complete commentary… */
export const PHASE_MIN_COVERAGE = 0.5
/** …and a phase only gets a tab when this many bowlers each bowled at least PHASE_MIN_BALLS in it. */
export const PHASE_MIN_BOWLERS = 8
export const PHASE_MIN_BALLS = 24

/** A tournament/ground whose matches ALL have complete commentary is a complete dataset, so the
 *  coverage and bowler-count gates relax to these smaller-sample floors. */
export const PHASE_FULL_MIN_BOWLERS = 3
export const PHASE_FULL_MIN_BALLS = 12

export function isFullyCovered(c: PhaseCoverage): boolean {
  return c.total > 0 && c.covered > 0 && c.covered + (c.mismatched ?? 0) === c.total
}

export interface PhaseTally { balls: number; dots: number; boundaries: number }
export interface PhaseBowler { playerId: string; phases: Record<PhaseKey, PhaseTally> }
/** covered = matches with complete, reconciled commentary (the only ones whose balls are used);
 *  mismatched = commentary uploaded but not reconciling with the scorecard (excluded from the numbers). */
export interface PhaseCoverage { covered: number; total: number; mismatched?: number }

/** What getBowlingPhaseLeaders() returns; plain JSON so it survives the stats cache. */
export interface BowlingPhaseData {
  format: 'T20' | 'T30'
  totalOvers: number
  coverage: PhaseCoverage
  bowlers: (PhaseBowler & { playerName: string; cricheroesUrl: string | null })[]
}

export type PhaseBall = Pick<BallRow, 'over_no' | 'is_legal' | 'runs_bat' | 'extras' | 'extra_type' | 'outcome' | 'bowler_player_id'>

const emptyTally = (): PhaseTally => ({ balls: 0, dots: 0, boundaries: 0 })

/** Per-bowler legal balls, dots and boundaries conceded in each phase, over Spartans-bowling deliveries
 *  of matches that all share `totalOvers`. Bowlers without a Hub player id (unreconciled) are skipped,
 *  as everywhere else on the leaderboard. A boundary counts on any delivery (a no-ball hit for four is
 *  still conceded); the % divides by legal balls, like the scorecard view. */
export function aggregatePhaseBowlers(balls: PhaseBall[], totalOvers: number): PhaseBowler[] {
  const byId = new Map<string, PhaseBowler>()
  for (const b of balls) {
    if (!b.bowler_player_id) continue
    let acc = byId.get(b.bowler_player_id)
    if (!acc) {
      acc = { playerId: b.bowler_player_id, phases: { pp: emptyTally(), mid: emptyTally(), death: emptyTally() } }
      byId.set(b.bowler_player_id, acc)
    }
    const t = acc.phases[phaseOf(b.over_no, totalOvers)]
    if (b.is_legal) t.balls += 1
    if (isDotForBowler(b as BallRow)) t.dots += 1
    if (isBoundary(b as BallRow)) t.boundaries += 1
  }
  return Array.from(byId.values())
}

export function coveragePasses(c: PhaseCoverage): boolean {
  return c.total > 0 && c.covered / c.total >= PHASE_MIN_COVERAGE
}

/** Phases that earn a tab: coverage gate first, then enough bowlers with a real sample in that phase. */
export function availablePhases(bowlers: PhaseBowler[], coverage: PhaseCoverage, scoped = false): PhaseKey[] {
  const full = scoped && isFullyCovered(coverage)
  if (!full && !coveragePasses(coverage)) return []
  const minBowlers = full ? PHASE_FULL_MIN_BOWLERS : PHASE_MIN_BOWLERS
  const minBalls = full ? PHASE_FULL_MIN_BALLS : PHASE_MIN_BALLS
  return PHASE_KEYS.filter(p => bowlers.filter(b => b.phases[p].balls >= minBalls).length >= minBowlers)
}

export function isPhaseKey(v: string | undefined): v is PhaseKey {
  return v === 'pp' || v === 'mid' || v === 'death'
}

/** Items for one phase's charts. */
export function itemsForPhase(data: BowlingPhaseData, phase: PhaseKey): ControlItem[] {
  return data.bowlers.map(b => ({
    playerId: b.playerId, playerName: b.playerName, cricheroesUrl: b.cricheroesUrl,
    balls: b.phases[phase].balls, dots: b.phases[phase].dots, boundaries: b.phases[phase].boundaries,
  }))
}

/** "All" view when the phase data passes its gates: each bowler's totals across the three phases,
 *  keeping the per-phase split so the chart can stack it. */
export function itemsFromPhaseTotals(data: BowlingPhaseData): ControlItem[] {
  return data.bowlers.map(b => {
    const sum = (k: keyof PhaseTally) => PHASE_KEYS.reduce((n, p) => n + b.phases[p][k], 0)
    return {
      playerId: b.playerId, playerName: b.playerName, cricheroesUrl: b.cricheroesUrl,
      balls: sum('balls'), dots: sum('dots'), boundaries: sum('boundaries'), phases: b.phases,
    }
  })
}
