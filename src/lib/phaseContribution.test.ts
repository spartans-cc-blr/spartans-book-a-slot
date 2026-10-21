import { describe, it, expect } from 'vitest'
import type { BallRow } from './ballByBall'
import type { ScoutMatchInput } from './matchPlanning'
import { compareCell, phaseContributions, MIN_CONTRIB_BALLS } from './phaseContribution'

let seq = 0
function ball(o: Partial<BallRow>): BallRow {
  seq += 1
  return {
    batting_side: 'spartans', seq, over_no: 1, ball_in_over: 1, is_legal: true, bowler: 'Opp', batter: 'Ravi',
    outcome: null, runs_bat: 0, extras: 0, extra_type: null, runs_total: 0, is_wicket: false, dismissal_kind: null,
    dismissal_text: null, dismissed_batter: null, fielder: null, shot: null, direction: null, score_after: null,
    wickets_after: null, bowler_player_id: null, batter_player_id: 'p1', dismissed_player_id: null, fielder_player_id: null, ...o,
  }
}
const match = (balls: BallRow[]): ScoutMatchInput => ({
  bookingId: 'm1', matchId: 'm1', gameDate: '2026-01-01', format: 'T20', result: 'won',
  teamTotal: 100, teamWickets: 5, oppTotal: 90, oppWickets: 5, balls,
})

/** n powerplay balls for one batter, each scoring `runs` */
const spell = (id: string, name: string, n: number, runs: number) =>
  Array.from({ length: n }, () => ball({ batter: name, batter_player_id: id, runs_bat: runs, runs_total: runs }))

describe('compareCell', () => {
  const acc = (balls: number, runs: number, dots: number, sumSq = runs * 2) =>
    ({ balls, deliveries: balls, runs, sumSq, dots, legal: balls, events: 0 })

  it('is small below the minimum sample', () => {
    const c = compareCell(acc(MIN_CONTRIB_BALLS - 1, 20, 2), acc(200, 300, 80), true)
    expect(c.verdict).toBe('small')
    expect(c.rpoDelta).toBeNull()
  })
  it('calls a clearly faster batter above, a clearly slower one below', () => {
    const team = acc(240, 300, 90, 600)
    // 30 balls, 70 runs vs rest 210 balls, 230 runs
    expect(compareCell(acc(30, 70, 6, 150), team, true).verdict).toBe('above')
    expect(compareCell(acc(30, 15, 20, 30), team, true).verdict).toBe('below')
  })
  it('keeps a small gap on a modest sample at par', () => {
    const team = acc(240, 300, 90, 600)
    const c = compareCell(acc(18, 24, 7, 48), team, true)
    expect(c.verdict).toBe('par')
  })
  it('inverts the direction for bowling: lower economy is good', () => {
    const team = acc(240, 300, 90, 600)
    expect(compareCell(acc(30, 20, 18, 40), team, false).verdict).toBe('above')
    expect(compareCell(acc(30, 70, 6, 150), team, false).verdict).toBe('below')
  })
})

describe('phaseContributions', () => {
  it('compares each batter with the rest of the team and lists the available best', () => {
    seq = 0
    // Powerplay: Fast scores 2 a ball, Slow scores 0 a ball (all dots), Mid scores 1 a ball.
    const balls = [
      ...spell('p1', 'Fast', 36, 2),
      ...spell('p2', 'Slow', 36, 0),
      ...spell('p3', 'Mid', 36, 1),
    ]
    const r = phaseContributions([match(balls)], [{ id: 'p1', name: 'Fast' }, { id: 'p2', name: 'Slow' }])
    const fast = r.batting.rows.find(x => x.playerId === 'p1')!
    const slow = r.batting.rows.find(x => x.playerId === 'p2')!
    expect(fast.byPhase.pp?.verdict).toBe('above')
    expect(slow.byPhase.pp?.verdict).toBe('below')
    expect(slow.byPhase.pp?.dotFlag).toBe('bad')
    expect(fast.byPhase.pp?.dotFlag).toBe('good')
    expect(r.batting.best.pp.map(x => x.playerId)).toEqual(['p1'])
    expect(r.batting.weak.pp.map(x => x.playerId)).toEqual(['p2'])
    // Mid is not available, so computed but never recommended
    expect(r.batting.rows.find(x => x.playerId === 'p3')!.available).toBe(false)
    expect(r.batting.best.pp.some(x => x.playerId === 'p3')).toBe(false)
    expect(r.batting.baseline.pp.balls).toBe(108)
    expect(fast.usualPosition).toBe(1)
  })

  it('treats bowling as lower-is-better and counts bowler wickets', () => {
    seq = 0
    const bowl = (id: string, name: string, n: number, runs: number) =>
      Array.from({ length: n }, () => ball({ batting_side: 'opponent', bowler: name, bowler_player_id: id, batter: 'X', batter_player_id: null, runs_bat: runs, runs_total: runs }))
    const balls = [...bowl('b1', 'Tight', 36, 0), ...bowl('b2', 'Leaky', 36, 2), ...bowl('b3', 'Avg', 36, 1)]
    balls.push(ball({ batting_side: 'opponent', bowler: 'Tight', bowler_player_id: 'b1', batter: 'X', batter_player_id: null,
      is_wicket: true, dismissal_kind: 'bowled', dismissed_batter: 'X' }))
    const r = phaseContributions([match(balls)], [{ id: 'b1', name: 'Tight' }, { id: 'b2', name: 'Leaky' }])
    expect(r.bowling.rows.find(x => x.playerId === 'b1')!.byPhase.pp?.verdict).toBe('above')
    expect(r.bowling.rows.find(x => x.playerId === 'b1')!.byPhase.pp?.events).toBe(1)
    expect(r.bowling.rows.find(x => x.playerId === 'b2')!.byPhase.pp?.verdict).toBe('below')
  })

  it('returns no rows when there is no data', () => {
    const r = phaseContributions([], [{ id: 'p1', name: 'A' }])
    expect(r.batting.rows).toEqual([])
    expect(r.bowling.rows).toEqual([])
  })
})
