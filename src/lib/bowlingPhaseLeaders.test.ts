import { describe, it, expect } from 'vitest'
import {
  aggregatePhaseBowlers, availablePhases, itemsFromPhaseTotals, controlCohort, coveragePasses, rankControl,
  PHASE_MIN_BALLS, PHASE_MIN_BOWLERS, type ControlItem, type PhaseBall, type PhaseBowler,
} from './bowlingPhaseLeaders'

const ball = (over: number, o: Partial<PhaseBall> = {}): PhaseBall => ({
  over_no: over, is_legal: true, runs_bat: 0, extras: 0, extra_type: null, outcome: null, bowler_player_id: 'p1', ...o,
})

const item = (id: string, balls: number, dots: number, boundaries: number): ControlItem => ({
  playerId: id, playerName: id, cricheroesUrl: null, balls, dots, boundaries,
})

describe('aggregatePhaseBowlers', () => {
  it('splits balls into T20 phases and counts dots and boundaries', () => {
    const [p1] = aggregatePhaseBowlers([
      ball(1), ball(6, { runs_bat: 4, outcome: 'FOUR' }), ball(7), ball(15, { runs_bat: 1 }),
      ball(16), ball(20, { runs_bat: 6, outcome: 'SIX' }),
    ], 20)
    expect(p1.phases.pp).toEqual({ balls: 2, dots: 1, boundaries: 1 })
    expect(p1.phases.mid).toEqual({ balls: 2, dots: 1, boundaries: 0 })
    expect(p1.phases.death).toEqual({ balls: 2, dots: 1, boundaries: 1 })
  })

  it('uses the T30 phase plan', () => {
    const [p1] = aggregatePhaseBowlers([ball(8), ball(9), ball(24)], 30)
    expect([p1.phases.pp.balls, p1.phases.mid.balls, p1.phases.death.balls]).toEqual([1, 1, 1])
  })

  it('does not count wides as balls, and a wide is not a dot', () => {
    const [p1] = aggregatePhaseBowlers([ball(1, { is_legal: false, extra_type: 'wide', extras: 1 })], 20)
    expect(p1.phases.pp).toEqual({ balls: 0, dots: 0, boundaries: 0 })
  })

  it('skips bowlers with no Hub id', () => {
    expect(aggregatePhaseBowlers([ball(1, { bowler_player_id: null })], 20)).toEqual([])
  })
})

describe('rankControl', () => {
  it('keeps only the most-bowled cohort, then ranks within it', () => {
    // 20 bowlers: ids b0..b19, balls 100 down to 81. b19 (81 balls) has a perfect 100% dot rate but is outside the top 15.
    const items = Array.from({ length: 20 }, (_, i) => item(`b${i}`, 100 - i, i === 19 ? 81 : 30 + i, 5 + i))
    const { dots, boundaries } = rankControl(items, 30)
    expect(dots.map(e => e.item.playerId)).not.toContain('b19')
    expect(dots).toHaveLength(10)
    expect(dots[0].pct).toBeGreaterThanOrEqual(dots[1].pct)
    expect(boundaries[0].pct).toBeLessThanOrEqual(boundaries[1].pct)
  })

  it('keeps everyone tied on balls at the cut-off', () => {
    const items = Array.from({ length: 18 }, (_, i) => item(`b${i}`, i < 14 ? 100 - i : 60, 20, 5))
    expect(controlCohort(items, 30).length).toBe(18) // the 15th bowler has 60 balls, so all 4 tied at 60 stay
  })

  it('applies the minimum-balls floor', () => {
    expect(controlCohort([item('a', 29, 10, 1), item('b', 30, 10, 1)], 30).map(i => i.playerId)).toEqual(['b'])
  })
})

describe('phase gate', () => {
  const bowlers = (n: number, balls: number): PhaseBowler[] =>
    Array.from({ length: n }, (_, i) => ({
      playerId: `p${i}`,
      phases: { pp: { balls, dots: 0, boundaries: 0 }, mid: { balls: 0, dots: 0, boundaries: 0 }, death: { balls: 0, dots: 0, boundaries: 0 } },
    }))

  it('needs half the matches covered', () => {
    expect(coveragePasses({ covered: 19, total: 38 })).toBe(true)
    expect(coveragePasses({ covered: 18, total: 38 })).toBe(false)
    expect(coveragePasses({ covered: 0, total: 0 })).toBe(false)
  })

  it('shows no tabs below the coverage gate', () => {
    expect(availablePhases(bowlers(20, 60), { covered: 1, total: 10 })).toEqual([])
  })

  it('only offers phases with enough bowlers on a real sample', () => {
    const cov = { covered: 5, total: 8 }
    expect(availablePhases(bowlers(PHASE_MIN_BOWLERS, PHASE_MIN_BALLS), cov)).toEqual(['pp'])
    expect(availablePhases(bowlers(PHASE_MIN_BOWLERS - 1, PHASE_MIN_BALLS), cov)).toEqual([])
    expect(availablePhases(bowlers(PHASE_MIN_BOWLERS, PHASE_MIN_BALLS - 1), cov)).toEqual([])
  })

  it('relaxes the gates for a fully covered tournament/ground', () => {
    const full = { covered: 4, total: 4 }
    expect(availablePhases(bowlers(3, 12), full, true)).toEqual(['pp'])
    expect(availablePhases(bowlers(3, 12), full, false)).toEqual([])
    expect(availablePhases(bowlers(3, 12), { covered: 3, total: 4 }, true)).toEqual([])
    // uploaded-but-mismatched still counts as uploaded
    expect(availablePhases(bowlers(3, 12), { covered: 3, total: 4, mismatched: 1 }, true)).toEqual(['pp'])
  })
})

describe('itemsFromPhaseTotals', () => {
  it('sums the phases and keeps the split', () => {
    const [it] = itemsFromPhaseTotals({
      format: 'T20', totalOvers: 20, coverage: { covered: 1, total: 1 },
      bowlers: [{ playerId: 'p', playerName: 'P', cricheroesUrl: null, phases: {
        pp: { balls: 12, dots: 5, boundaries: 1 }, mid: { balls: 24, dots: 8, boundaries: 3 }, death: { balls: 6, dots: 1, boundaries: 2 } } }],
    })
    expect([it.balls, it.dots, it.boundaries]).toEqual([42, 14, 6])
    expect(it.phases?.mid.dots).toBe(8)
  })
})

import { stackedAllPasses } from './bowlingPhaseLeaders'
describe('stackedAllPasses', () => {
  const mk = (n: number) => Array.from({ length: n }, (_, i) => ({ playerId: `p${i}`, phases: { pp: { balls: 12, dots: 0, boundaries: 0 }, mid: { balls: 12, dots: 0, boundaries: 0 }, death: { balls: 0, dots: 0, boundaries: 0 } } }))
  it('needs 6 bowlers with the minimum sample', () => {
    expect(stackedAllPasses(mk(6), { covered: 3, total: 3 }, true, 12)).toBe(true)
    expect(stackedAllPasses(mk(5), { covered: 3, total: 3 }, true, 12)).toBe(false)
  })
  it('needs coverage', () => {
    expect(stackedAllPasses(mk(8), { covered: 1, total: 4 }, false, 12)).toBe(false)
  })
})
