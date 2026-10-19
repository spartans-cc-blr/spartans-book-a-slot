import { describe, it, expect } from 'vitest'
import type { BallRow } from '@/lib/ballByBall'
import { buildWorm, requiredLineAt, wormPoints } from '@/lib/matchInsights'

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
    expect(pts).toEqual([
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
