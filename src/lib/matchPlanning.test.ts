import { describe, it, expect } from 'vitest'
import type { BallRow } from './ballByBall'
import { scoutTeam, scoutPlayers, dismissalGroup, type ScoutMatchInput } from './matchPlanning'

let seq = 0
function ball(o: Partial<BallRow>): BallRow {
  seq += 1
  return {
    batting_side: 'spartans', seq, over_no: 1, ball_in_over: 1, is_legal: true, bowler: 'Opp Bowler', batter: 'Ravi',
    outcome: null, runs_bat: 0, extras: 0, extra_type: null, runs_total: 0, is_wicket: false, dismissal_kind: null,
    dismissal_text: null, dismissed_batter: null, fielder: null, shot: null, direction: null, score_after: null,
    wickets_after: null, bowler_player_id: null, batter_player_id: 'p1', dismissed_player_id: null, fielder_player_id: null, ...o,
  }
}
function match(id: string, date: string, balls: BallRow[]): ScoutMatchInput {
  return { bookingId: id, matchId: id, gameDate: date, format: 'T20', result: 'lost', teamTotal: 100, teamWickets: 5, oppTotal: 120, oppWickets: 3, balls }
}

describe('dismissalGroup', () => {
  it('buckets kinds', () => {
    expect(dismissalGroup('Caught Behind')).toBe('caught')
    expect(dismissalGroup('bowled')).toBe('bowled')
    expect(dismissalGroup('LBW')).toBe('lbw')
    expect(dismissalGroup('Run Out')).toBe('run out')
    expect(dismissalGroup(null)).toBe('other')
  })
})

describe('scoutPlayers', () => {
  it('derives batting position, phase and how out; bowler credited from the text', () => {
    seq = 0
    const balls = [
      ball({ batter: 'Ravi', batter_player_id: 'p1', runs_bat: 4, runs_total: 4, over_no: 2 }),
      ball({ batter: 'Ravi', batter_player_id: 'p1', is_wicket: true, dismissed_batter: 'Ravi', dismissed_player_id: 'p1',
        dismissal_kind: 'bowled', dismissal_text: 'Ravi b Opp Bowler (4r 2b)', over_no: 3 }),
      ball({ batter: 'Sam', batter_player_id: 'p2', runs_bat: 1, runs_total: 1, over_no: 3 }),
    ]
    const [r] = scoutPlayers([match('m1', '2026-01-01', balls)], [{ id: 'p1', name: 'Ravi' }])
    expect(r.batting?.innings).toBe(1)
    expect(r.batting?.runs).toBe(4)
    expect(r.batting?.positions).toEqual([{ position: 1, innings: 1, runs: 4, balls: 2 }])
    expect(r.batting?.log[0].bowler).toBe('Opp Bowler')
    expect(r.batting?.byPhase.pp.runs).toBe(4)
  })
  it('flags the same bowler dismissing twice', () => {
    seq = 0
    const mk = (id: string, d: string) => match(id, d, [
      ball({ batter: 'Ravi', batter_player_id: 'p1', runs_bat: 1, runs_total: 1 }),
      ball({ batter: 'Ravi', batter_player_id: 'p1', is_wicket: true, dismissed_batter: 'Ravi', dismissed_player_id: 'p1',
        dismissal_kind: 'bowled', dismissal_text: 'Ravi b Nemesis (1r 2b)' }),
      ...Array.from({ length: 20 }, () => ball({ batter: 'Ravi', batter_player_id: 'p1' })),
    ])
    const [r] = scoutPlayers([mk('a', '2026-01-01'), mk('b', '2026-02-01')], [{ id: 'p1', name: 'Ravi' }])
    expect(r.insights.join(' ')).toMatch(/Nemesis 2 times/)
  })
  it('skips players with no data', () => {
    seq = 0
    expect(scoutPlayers([match('m', '2026-01-01', [ball({})])], [{ id: 'zzz', name: 'Nobody' }])).toEqual([])
  })
})

describe('scoutTeam', () => {
  it('tallies phases and dismissal groups, newest match first', () => {
    seq = 0
    const a = match('a', '2026-01-01', [ball({ runs_bat: 6, runs_total: 6, over_no: 1 })])
    const b = match('b', '2026-03-01', [
      ball({ batting_side: 'opponent', batter: 'Zed', is_wicket: true, dismissed_batter: 'Zed', dismissal_kind: 'lbw', dismissal_text: 'Zed lbw b Kumar (0r 1b)', over_no: 18 }),
    ])
    const t = scoutTeam([a, b])
    expect(t.matches.map(m => m.bookingId)).toEqual(['b', 'a'])
    expect(t.batting.pp.runs).toBe(6)
    expect(t.bowling.death.wickets).toBe(1)
    expect(t.wicketsTaken.lbw).toBe(1)
    expect(t.insights).toEqual([])
    expect(scoutTeam([a]).insights[0]).toMatch(/treat these as hints/)
  })
})
