import { describe, it, expect } from 'vitest'
import { computeBreakthroughs, summariseBreakers, oversToBalls } from './breakthroughs'
import { aggregateBreakthroughLeaders } from './breakthroughLeaders'

const row = (n: number, score: number, over: number, out: string, bowler: string | null, type = 'bowled') =>
  ({ wicket_number: n, team_score: score, over, player_name: out, bowler_name: bowler, dismissal_type: type })

describe('computeBreakthroughs', () => {
  const fow = [
    row(1, 40, 5.2, 'A', 'Ramesh'),
    row(2, 45, 6.0, 'B', null, 'run_out'),
    row(3, 100, 12.3, 'C', 'Ramesh', 'caught'),
  ]

  it('derives stand runs, balls and bowler credit', () => {
    const s = computeBreakthroughs(fow, { total: 100, overs: 12.3, wickets: 3 })
    expect(s.map(x => x.runs)).toEqual([40, 5, 55])
    expect(s.map(x => x.balls)).toEqual([32, 4, 39])
    expect(s.map(x => x.bowlerName)).toEqual(['Ramesh', null, 'Ramesh'])
    expect(s.every(x => !x.unbroken)).toBe(true)
  })

  it('adds an unbroken closing stand when not all out', () => {
    const s = computeBreakthroughs(fow, { total: 130, overs: 15, wickets: 3 })
    expect(s).toHaveLength(4)
    expect(s[3]).toMatchObject({ unbroken: true, runs: 30, wicketNumber: 4, bowlerName: null, balls: 15 })
  })

  it('no closing stand when all out', () => {
    const all = Array.from({ length: 10 }, (_, i) => row(i + 1, (i + 1) * 10, i + 1, `P${i}`, 'X'))
    expect(computeBreakthroughs(all, { total: 100, overs: 10, wickets: 10 })).toHaveLength(10)
  })

  it('zero wickets lost gives one unbroken stand', () => {
    const s = computeBreakthroughs([], { total: 80, overs: 10, wickets: 0 })
    expect(s).toHaveLength(1)
    expect(s[0]).toMatchObject({ unbroken: true, runs: 80, balls: 60 })
  })

  it('hides when rows do not cover every wicket, or nothing synced', () => {
    expect(computeBreakthroughs(fow, { total: 120, overs: 14, wickets: 4 })).toEqual([])
    expect(computeBreakthroughs([], null)).toEqual([])
    expect(computeBreakthroughs(null, { total: 90, overs: 10, wickets: 5 })).toEqual([])
  })

  it('shows rows without a final score', () => {
    expect(computeBreakthroughs(fow, null)).toHaveLength(3)
  })

  it('parses overs.balls without float error', () => {
    expect(oversToBalls(9.2)).toBe(56)
    expect(oversToBalls('0')).toBe(0)
  })
})

describe('summariseBreakers', () => {
  it('tallies per bowler, ignoring run-outs and unbroken', () => {
    const s = computeBreakthroughs(
      [row(1, 40, 5, 'A', 'Ramesh'), row(2, 45, 6, 'B', null, 'run_out'), row(3, 100, 12, 'C', 'Ramesh'), row(4, 110, 13, 'D', 'Sagar')],
      { total: 140, overs: 16, wickets: 4 })
    expect(summariseBreakers(s)).toEqual([
      { bowlerName: 'Ramesh', broken: 2, bigBreaks: 2, standRuns: 95 },
      { bowlerName: 'Sagar', broken: 1, bigBreaks: 0, standRuns: 10 },
    ])
  })
})

describe('aggregateBreakthroughLeaders', () => {
  const stands = computeBreakthroughs(
    [row(1, 40, 5, 'A', 'Ramesh'), row(2, 100, 12, 'B', 'Sagar'), row(3, 110, 13, 'C', 'Ramesh')],
    { total: 110, overs: 13, wickets: 3 })
  const resolve = (name: string) => ({ playerId: name === 'Ramesh' ? 'r1' : null, playerName: name, cricheroesUrl: null })
  const out = aggregateBreakthroughLeaders([
    { matchId: 'm1', bookingId: 'b1', gameDate: '2026-10-01', opponentName: 'X', stands },
    { matchId: 'm2', bookingId: 'b2', gameDate: '2026-10-08', opponentName: 'Y', stands },
  ], resolve)

  it('ranks by stands broken', () => {
    expect(out.breakers[0]).toMatchObject({ broken: 4, matches: 2, bigBreaks: 2 })
    expect(out.breakers[0].bowler.playerName).toBe('Ramesh')
    expect(out.breakers[1].bowler.playerName).toBe('Sagar')
  })

  it('lists biggest stands first', () => {
    expect(out.biggest[0]).toMatchObject({ runs: 60, wicketNumber: 2 })
    expect(out.biggest[0].bowler.playerName).toBe('Sagar')
  })
})
