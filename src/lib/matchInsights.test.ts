import { describe, it, expect } from 'vitest'
import type { BallRow } from '@/lib/ballByBall'
import { buildWorm, chaseSeries, requiredLineAt, wormPoints } from '@/lib/matchInsights'

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
