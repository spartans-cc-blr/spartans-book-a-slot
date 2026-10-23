import { describe, it, expect } from 'vitest'
import type { BallRow } from '@/lib/ballByBall'
import { overInsights, battingOverSeries, parRuns, vsBattingRate, overEndRates, vsRequiredRate, bowlingOverSeries, buildWorm, chaseSeries, overContexts, rateCrossings, requiredLineAt, wormPoints } from '@/lib/matchInsights'

function ball(side: 'spartans' | 'opponent', over: number, runs: number, wicket = false): BallRow {
  return {
    batting_side: side, seq: over * 10, over_no: over, ball_in_over: 1, is_legal: true,
    bowler: 'B', batter: 'A', outcome: null, runs_bat: runs, extras: 0, extra_type: null,
    runs_total: runs, is_wicket: wicket, dismissal_kind: null, dismissal_text: null,
    dismissed_batter: null, fielder: null, shot: null, direction: null,
    score_after: null, wickets_after: null,
    bowler_player_id: null, batter_player_id: null, dismissed_player_id: null, fielder_player_id: null,
  }
}

describe('wormPoints', () => {
  it('starts at zero and accumulates per over, counting wickets', () => {
    const pts = wormPoints([ball('spartans', 1, 4), ball('spartans', 1, 2), ball('spartans', 2, 0, true), ball('spartans', 3, 6)])
    expect(pts.map(({ over, runs, wickets }) => ({ over, runs, wickets }))).toEqual([
      { over: 0, runs: 0, wickets: 0 },
      { over: 1, runs: 6, wickets: 0 },
      { over: 2, runs: 6, wickets: 1 },
      { over: 3, runs: 12, wickets: 0 },
    ])
  })

  it('carries forward an over with no deliveries', () => {
    const pts = wormPoints([ball('spartans', 1, 3), ball('spartans', 3, 1)])
    expect(pts.map(p => p.runs)).toEqual([0, 3, 3, 4])
  })
})

describe('buildWorm', () => {
  const balls = [
    ball('spartans', 1, 10), ball('spartans', 2, 10),
    ball('opponent', 1, 5), ball('opponent', 2, 5),
  ]

  it('derives target and constant required rate from the first innings', () => {
    const m = buildWorm(balls, 20, true)
    expect(m.target).toBe(21)
    expect(m.requiredRate).toBeCloseTo(1.05)
    expect(m.chaseSide).toBe('opponent')
    expect(m.first?.side).toBe('spartans')
  })

  it('prefers the scorecard total for the target', () => {
    const m = buildWorm(balls, 20, true, { spartans: 150 })
    expect(m.target).toBe(151)
  })

  it('works out the chase side when the opposition batted first', () => {
    const m = buildWorm(balls, 20, false)
    expect(m.target).toBe(11)
    expect(m.chaseSide).toBe('spartans')
  })

  it('has no target when batting order is unknown', () => {
    const m = buildWorm(balls, 20, null)
    expect(m.target).toBeNull()
    expect(m.ordered.map(i => i.side)).toEqual(['spartans', 'opponent'])
  })

  it('handles a missing innings', () => {
    const m = buildWorm(balls.filter(b => b.batting_side === 'spartans'), 20, true)
    expect(m.second).toBeNull()
    expect(m.target).toBe(21)
  })
})

describe('requiredLineAt', () => {
  it('is a straight line to the target at the final over', () => {
    expect(requiredLineAt(0, 168, 20)).toBe(0)
    expect(requiredLineAt(10, 168, 20)).toBe(84)
    expect(requiredLineAt(20, 168, 20)).toBe(168)
  })
})

describe('wicket notes', () => {
  it('records who, how, the score and the ball for each wicket', () => {
    const w = { ...ball('spartans', 2, 0, true), dismissed_batter: 'Siva', dismissal_text: 'Siva c Rohit b Kumar (12r 9b)', dismissal_kind: 'caught', ball_in_over: 2 }
    const pts = wormPoints([ball('spartans', 1, 5), w])
    expect(pts[2].notes).toEqual([{ wicketNo: 1, batter: 'Siva', how: 'c Rohit b Kumar', score: 5, ball: '1.2' }])
  })
})

describe('chaseSeries', () => {
  const chase = wormPoints([ball('opponent', 1, 6), ball('opponent', 2, 12), ball('opponent', 3, 20, true)])

  it('gives scored, needed and the changing required rate', () => {
    const rows = chaseSeries(chase, 60, 10)
    expect(rows[0]).toMatchObject({ over: 1, runsInOver: 6, scored: 6, needed: 54 })
    expect(rows[0].rrr).toBeCloseTo(54 / 9)
    expect(rows[1].rrr).toBeCloseTo(42 / 8)
    expect(rows[2]).toMatchObject({ wickets: 1, crr: 38 / 3 })
  })

  it('stops once the target is reached', () => {
    const rows = chaseSeries(chase, 18, 10)
    expect(rows.map(r => r.over)).toEqual([1, 2])
    expect(rows[1]).toMatchObject({ needed: 0, rrr: 0 })
  })

  it('has no required rate with no overs left', () => {
    const rows = chaseSeries(chase, 100, 3)
    expect(rows[2].rrr).toBeNull()
  })
})

describe('per-over who', () => {
  it('lists who bowled and who batted in each over, with their runs and balls', () => {
    const a = { ...ball('spartans', 1, 4), batter: 'Siva', bowler: 'Kumar', batter_player_id: 'p1' }
    const b = { ...ball('spartans', 1, 1), seq: 11, batter: 'Loki', bowler: 'Kumar' }
    const c = { ...ball('spartans', 1, 2), seq: 12, batter: 'Siva', bowler: 'Kumar' }
    const pts = wormPoints([a, b, c])
    expect(pts[1].bowlers).toEqual([{ name: 'Kumar', id: null }])
    expect(pts[1].batters).toEqual([
      { name: 'Siva', id: 'p1', runs: 6, balls: 2 },
      { name: 'Loki', id: null, runs: 1, balls: 1 },
    ])
    expect(pts[1].runsInOver).toBe(7)
  })

  it('tracks cumulative wickets', () => {
    const pts = wormPoints([ball('spartans', 1, 0, true), ball('spartans', 2, 0, true)])
    expect(pts.map(p => p.wicketsAfter)).toEqual([0, 1, 2])
  })
})

describe('rateCrossings', () => {
  const row = (over: number, crr: number, rrr: number | null) =>
    ({ over, runsInOver: 0, scored: 0, needed: 1, oversLeft: 1, crr, rrr, wickets: 0 })

  it('finds where current drops below required, interpolated between overs', () => {
    const x = rateCrossings([row(5, 12, 10), row(6, 10, 11), row(7, 9, 12)])
    expect(x).toHaveLength(1)
    expect(x[0].direction).toBe('behind')
    expect(x[0].over).toBeCloseTo(5.667, 2)
    expect(x[0].rate).toBeCloseTo(10.667, 2)
  })

  it('finds a recovery and ignores overs with no required rate', () => {
    const x = rateCrossings([row(1, 8, 10), row(2, 11, 10), row(3, 12, null)])
    expect(x.map(c => c.direction)).toEqual(['ahead'])
  })

  it('returns nothing when the lines never meet', () => {
    expect(rateCrossings([row(1, 12, 10), row(2, 13, 10)])).toEqual([])
  })
})

describe('bowlingOverSeries', () => {
  const b = (over: number, bowler: string, runs: number, extra: Partial<BallRow> = {}): BallRow =>
    ({ ...ball('opponent', over, runs), bowler, ...extra, seq: over * 10 + (extra.seq ?? 0) })

  it('combines several selected bowlers', () => {
    const balls = [b(1, 'Kumar', 4), b(2, 'Rao', 6), b(3, 'Sen', 2)]
    const s = bowlingOverSeries(balls, ['Kumar', 'Rao'], 3)
    expect(s.map(o => o.bowled)).toEqual([true, true, false])
    expect(s[1].runs).toBe(6)
  })

  it('covers the whole innings and shows only the chosen bowler\'s overs', () => {
    const balls = [b(1, 'Kumar', 4), b(2, 'Rao', 6), b(3, 'Kumar', 0, { is_wicket: true, dismissal_kind: 'bowled' })]
    const s = bowlingOverSeries(balls, 'Kumar', 5)
    expect(s).toHaveLength(5)
    expect(s.map(o => o.bowled)).toEqual([true, false, true, false, false])
    expect(s.map(o => o.runs)).toEqual([4, 0, 0, 0, 0])
    expect(s[2].wickets).toBe(1)
  })

  it('charges the bowler wides and no-balls but not byes, and ignores run-outs', () => {
    const balls = [
      b(1, 'Kumar', 0, { extra_type: 'wide', extras: 1, runs_total: 1 }),
      b(1, 'Kumar', 0, { extra_type: 'bye', extras: 2, runs_total: 2, seq: 1 }),
      b(1, 'Kumar', 0, { is_wicket: true, dismissal_kind: 'run out', seq: 2 }),
    ]
    const o = bowlingOverSeries(balls, 'Kumar', 1)[0]
    expect(o.runs).toBe(1)
    expect(o.wickets).toBe(0)
  })

  it('shows every run and wicket for the entire innings, matching the score', () => {
    const balls = [
      b(1, 'Kumar', 2), b(1, 'Rao', 3, { seq: 1 }),
      b(2, 'Rao', 0, { is_wicket: true, dismissal_kind: 'run out' }),
    ]
    const s = bowlingOverSeries(balls, null, 2)
    expect(s.map(o => o.runs)).toEqual([5, 0])
    expect(s[1].wickets).toBe(1)
    expect(s[0].bowlers.map(x => x.name)).toEqual(['Kumar', 'Rao'])
  })

  it('matches bowler names loosely on case and spaces', () => {
    expect(bowlingOverSeries([b(1, ' kumar ', 3)], 'Kumar', 1)[0].runs).toBe(3)
  })
})

describe('overContexts', () => {
  const pts = wormPoints([ball('opponent', 1, 6), ball('opponent', 2, 12), ball('opponent', 3, 20, true)])

  it('gives the rates going into each over, with no current rate before over 1', () => {
    const c = overContexts(pts, 61, 10)
    expect(c[0]).toMatchObject({ over: 1, runsBefore: 0, crr: null, needed: 61 })
    expect(c[0].rrr).toBeCloseTo(6.1)
    expect(c[1]).toMatchObject({ over: 2, runsBefore: 6, crr: 6, wicketsBefore: 0 })
    expect(c[1].rrr).toBeCloseTo(55 / 9)
    expect(c[2]).toMatchObject({ over: 3, runsBefore: 18, crr: 9 })
  })

  it('has no required rate when there is no target (Spartans bowled first)', () => {
    const c = overContexts(pts, null, 10)
    expect(c.every(x => x.rrr == null && x.needed == null)).toBe(true)
    expect(c[2].crr).toBe(9)
  })

  it('stops once the target has been passed', () => {
    expect(overContexts(pts, 15, 10).map(x => x.over)).toEqual([1, 2])
  })
})

describe('vsRequiredRate', () => {
  const ov = (runs: number, legalBalls = 6, bowled = true) => ({ over: 1, runs, wickets: 0, legalBalls, bowled, bowlers: [] })
  const ctx = (rrr: number | null) => ({ over: 1, runsBefore: 0, wicketsBefore: 0, crr: null, rrr, needed: 0, oversLeft: 1 })

  it('compares economy with the going-in required rate', () => {
    expect(vsRequiredRate(ov(5), ctx(8))).toBe('under')
    expect(vsRequiredRate(ov(8), ctx(8))).toBe('level')
    expect(vsRequiredRate(ov(11), ctx(8))).toBe('over')
  })
  it('can compare with the current rate instead', () => {
    const c = { ...ctx(null), crr: 7 }
    expect(vsRequiredRate(ov(5), c, 'crr')).toBe('under')
    expect(vsRequiredRate(ov(9), c, 'crr')).toBe('over')
    expect(vsRequiredRate(ov(9), ctx(null), 'crr')).toBeNull()
  })
  it('scales a part over', () => {
    expect(vsRequiredRate(ov(5, 3), ctx(8))).toBe('over')
  })
  it('is null without a required rate or when the selection did not bowl', () => {
    expect(vsRequiredRate(ov(5), ctx(null))).toBeNull()
    expect(vsRequiredRate(ov(5), undefined)).toBeNull()
    expect(vsRequiredRate(ov(0, 0, false), ctx(8))).toBeNull()
  })
})

describe('overEndRates', () => {
  const pts = wormPoints([ball('opponent', 1, 7), ball('opponent', 2, 3), ball('opponent', 3, 20)])
  it('gives the rates at the end of each over, so over 1 has a current rate', () => {
    const r = overEndRates(pts, null, 10)
    expect(r.map(x => x.crr)).toEqual([7, 5, 10])
    expect(r.every(x => x.rrr == null)).toBe(true)
  })
  it('gives the rate still needed after each over and stops at the target', () => {
    const r = overEndRates(pts, 25, 10)
    expect(r[0]).toMatchObject({ over: 1, needed: 18 })
    expect(r[0].rrr).toBeCloseTo(18 / 9)
    expect(r.map(x => x.over)).toEqual([1, 2, 3])
    expect(r[2]).toMatchObject({ needed: 0, rrr: null })
  })
})

describe('battingOverSeries', () => {
  const bt = (over: number, batter: string, runs: number, extra: Partial<BallRow> = {}): BallRow =>
    ({ ...ball('spartans', over, runs), batter, runs_bat: runs, ...extra, seq: over * 10 + (extra.seq ?? 0) })

  it('combines several selected batters', () => {
    const balls = [bt(1, 'Siva', 4), bt(1, 'Loki', 1, { seq: 1 }), bt(2, 'Rao', 2)]
    const s = battingOverSeries(balls, ['Siva', 'Loki'], 3)
    expect(s.map(o => o.faced)).toEqual([true, false, false])
    expect(s[0].runs).toBe(5)
  })

  it('shows only the chosen batter\'s balls, covering the whole innings', () => {
    const balls = [bt(1, 'Siva', 4), bt(1, 'Loki', 1, { seq: 1 }), bt(2, 'Loki', 2)]
    const s = battingOverSeries(balls, 'Siva', 3)
    expect(s).toHaveLength(3)
    expect(s.map(o => o.faced)).toEqual([true, false, false])
    expect(s[0]).toMatchObject({ runs: 4, balls: 1 })
  })

  it('does not count wides as balls faced, and records his dismissal', () => {
    const balls = [
      bt(1, 'Siva', 0, { extra_type: 'wide', extras: 1, runs_total: 1, is_legal: false, runs_bat: 0 }),
      bt(1, 'Siva', 0, { is_wicket: true, dismissed_batter: 'Siva', seq: 1 }),
    ]
    const o = battingOverSeries(balls, 'Siva', 1)[0]
    expect(o.balls).toBe(1)
    expect(o.wickets).toBe(1)
  })

  it('shows every run and wicket for the entire innings', () => {
    const balls = [bt(1, 'Siva', 2), bt(1, 'Loki', 3, { seq: 1 }), bt(2, 'Loki', 0, { is_wicket: true, dismissed_batter: 'Loki' })]
    const s = battingOverSeries(balls, null, 2)
    expect(s.map(o => o.runs)).toEqual([5, 0])
    expect(s[1].wickets).toBe(1)
  })
})

describe('vsBattingRate', () => {
  const ov = (runs: number, balls = 6, faced = true) => ({ over: 1, runs, balls, wickets: 0, faced, bowlers: [] })
  const ctx = (crr: number | null, rrr: number | null) => ({ over: 2, runsBefore: 0, wicketsBefore: 0, crr, rrr, needed: 0, oversLeft: 1 })

  it('is ahead when he scored faster than the rate going in', () => {
    expect(vsBattingRate(ov(10), ctx(null, 8), 'rrr')).toBe('ahead')
    expect(vsBattingRate(ov(8), ctx(null, 8), 'rrr')).toBe('level')
    expect(vsBattingRate(ov(5), ctx(7, null), 'crr')).toBe('behind')
  })
  it('scales a part over by balls faced', () => {
    expect(vsBattingRate(ov(5, 3), ctx(null, 8), 'rrr')).toBe('ahead')
  })
  it('is null with no rate or no balls faced', () => {
    expect(vsBattingRate(ov(5), ctx(null, null), 'rrr')).toBeNull()
    expect(vsBattingRate(ov(0, 0, true), ctx(null, 8), 'rrr')).toBeNull()
    expect(vsBattingRate(ov(5, 6, false), ctx(null, 8), 'rrr')).toBeNull()
  })
})


describe('parRuns (part overs)', () => {
  const ov = (runs: number, balls: number) => ({ over: 1, runs, balls, wickets: 0, faced: true, bowlers: [] })
  const ctx = (crr: number | null, rrr: number | null) => ({ over: 1, crr, rrr } as never)
  it('scales the rate to the balls faced', () => {
    expect(parRuns(ov(1, 1), ctx(null, 6), 'rrr')).toBe(1)
    expect(parRuns(ov(3, 3), ctx(null, 8), 'rrr')).toBe(4)
  })
  it('never asks for more than six a ball', () => {
    expect(parRuns(ov(6, 1), ctx(null, 50), 'rrr')).toBe(6)
  })
  it('one run off one ball against 6 an over is level, not behind', () => {
    expect(vsBattingRate(ov(1, 1), ctx(null, 6), 'rrr')).toBe('level')
  })
  it('is null with no rate or no balls', () => {
    expect(parRuns(ov(0, 0), ctx(null, 6), 'rrr')).toBeNull()
    expect(parRuns(ov(2, 2), ctx(null, null), 'rrr')).toBeNull()
  })
})

describe('overInsights', () => {
  const b = (over: number, o: Partial<BallRow> = {}): BallRow => ({ ...ball('spartans', over, 0), seq: over * 10 + (o.seq ?? 0), is_legal: true, ...o })
  it('reports a double strike and a wicket maiden', () => {
    const balls = [b(3, { is_wicket: true, dismissed_batter: 'X', dismissal_kind: 'Bowled', seq: 1 }), b(3, { is_wicket: true, dismissed_batter: 'Y', dismissal_kind: 'Bowled', seq: 2 })]
    const n = overInsights(balls, 3)
    expect(n[0]).toMatch(/Double strike \(a wicket maiden\)/)
  })
  it('counts boundaries from the outcome', () => {
    const balls = [b(1, { outcome: 'FOUR', runs_bat: 4, runs_total: 4, seq: 1 }), b(1, { outcome: 'SIX', runs_bat: 6, runs_total: 6, seq: 2 })]
    expect(overInsights(balls, 1).join(' ')).toMatch(/2 boundaries \(1 four, 1 six\): 10 of the over's 10 runs/)
  })
  it('flags a bowler coming into the attack only after the openers', () => {
    const balls = [b(1, { bowler: 'P' }), b(2, { bowler: 'Q' }), b(3, { bowler: 'R' })]
    expect(overInsights(balls, 3).join(' ')).toMatch(/R comes into the attack/)
    expect(overInsights(balls, 2).join(' ')).not.toMatch(/comes into the attack/)
  })
  it('flags a batter reaching fifty in the over', () => {
    const balls = [b(1, { batter: 'A', runs_bat: 48, runs_total: 48, seq: 1 }), b(2, { batter: 'A', runs_bat: 4, runs_total: 4, outcome: 'FOUR' })]
    expect(overInsights(balls, 2).join(' ')).toMatch(/A reaches fifty \(52\)/)
  })
  it('is empty for an over with nothing to say', () => {
    expect(overInsights([b(1, { runs_bat: 1, runs_total: 1 })], 1)).toEqual(['Batting after the over: A 1 (1).'])
    expect(overInsights([], 5)).toEqual([])
  })
  it('gives the dismissed batter\'s score, a duck and the stand ended', () => {
    const balls = [
      b(1, { batter: 'A', runs_bat: 25, runs_total: 25, seq: 1 }),
      b(2, { batter: 'B', is_wicket: true, dismissed_batter: 'B', dismissal_kind: 'Bowled', seq: 1 }),
    ]
    const n = overInsights(balls, 2).join(' ')
    expect(n).toMatch(/B Bowled \(0 off 1\), a golden duck/)
    expect(n).toMatch(/Ended a 25-run stand/)
  })
  it('marks a new batter and the bowler\'s figures', () => {
    const balls = [b(1, { bowler: 'P', seq: 1 }), b(2, { bowler: 'Q', seq: 1 }), b(3, { bowler: 'P', seq: 1, batter: 'N', runs_bat: 1, runs_total: 1 })]
    const n = overInsights(balls, 3).join(' ')
    expect(n).toMatch(/N comes in at 0\/0/)
    expect(n).toMatch(/P: 0\.2-1-0 after 2 overs/)
  })
  it('notes a lift against the run rate so far', () => {
    const balls = [b(1, { runs_total: 2 }), b(2, { runs_total: 2 }), b(3, { runs_total: 2 }), b(4, { runs_bat: 4, runs_total: 4, outcome: 'FOUR', seq: 1 }), b(4, { runs_bat: 6, runs_total: 6, outcome: 'SIX', seq: 2 })]
    expect(overInsights(balls, 4).join(' ')).toMatch(/10 runs against a run rate of 2\.0 so far/)
  })
})
