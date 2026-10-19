import { describe, it, expect } from 'vitest'
import { computeBreakthroughs, summariseBreakers, oversToBalls, describeDismissal } from './breakthroughs'
import { aggregateBreakthroughLeaders } from './breakthroughLeaders'
import { buildStandBaselines, classifyStand, standGroup, MIN_BASELINE_SAMPLE } from './standBaselines'

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
      { bowlerName: 'Ramesh', broken: 2, standRuns: 95 },
      { bowlerName: 'Sagar', broken: 1, standRuns: 10 },
    ])
  })
})

describe('standGroup', () => {
  it('buckets wickets into openers, top, middle and tail', () => {
    expect([1, 2, 3, 4, 5, 8, 9, 10, 11].map(standGroup))
      .toEqual(['openers', 'openers', 'top', 'top', 'middle', 'middle', 'tail', 'tail', 'tail'])
  })
})

describe('stand baselines', () => {
  // 25 T20 openers' stands 1..25 runs; 25 T30 openers' stands 11..35.
  const mk = (format: string, start: number) => ({
    format,
    stands: Array.from({ length: 25 }, (_, i) => ({
      wicketNumber: 1, runs: start + i, balls: 10, overFrom: 0, overTo: 1, outBatter: 'x', bowlerName: 'b', dismissalType: 'bowled', unbroken: false,
    })),
  })
  const b = buildStandBaselines([mk('T20', 1), mk('T30', 11)])

  it('judges a stand against its own format and slot', () => {
    expect(classifyStand(b, 'T20', 1, 25).big).toBe(true)    // top quarter of 1..25
    expect(classifyStand(b, 'T30', 1, 25).big).toBe(false)   // ordinary in the T30 bucket
    expect(classifyStand(b, 'T20', 9, 30).big).toBe(false)   // no tail data at all
  })

  it('reports runs above the bucket average', () => {
    expect(classifyStand(b, 'T20', 2, 23).abovePar).toBeCloseTo(23 - 13, 5)
  })

  it('falls back to all formats for a thin bucket and ignores unbroken stands', () => {
    const thin = buildStandBaselines([{ format: 'T20', stands: [{ wicketNumber: 1, runs: 99, balls: 1, overFrom: 0, overTo: 1, outBatter: null, bowlerName: null, dismissalType: null, unbroken: true }] }])
    expect(thin).toEqual({})
    expect(MIN_BASELINE_SAMPLE).toBe(20)
    const mixed = buildStandBaselines([mk('T20', 1)])
    expect(classifyStand(mixed, 'T30', 1, 20).big).toBe(true) // T30 has no bucket → all-formats
  })

  it('treats nothing as big without baselines', () => {
    expect(classifyStand(null, 'T20', 1, 200)).toEqual({ big: false, abovePar: 0 })
  })
})

describe('aggregateBreakthroughLeaders', () => {
  const stands = computeBreakthroughs(
    [row(1, 40, 5, 'A', 'Ramesh'), row(2, 100, 12, 'B', 'Sagar'), row(3, 110, 13, 'C', null, 'run_out')],
    { total: 110, overs: 13, wickets: 3 })
  const standsB = computeBreakthroughs(
    [row(1, 70, 8, 'A', 'Sagar'), row(2, 90, 11, 'B', 'Ramesh')],
    { total: 90, overs: 11, wickets: 2 })
  const resolve = (name: string) => ({ playerId: name === 'Ramesh' ? 'r1' : null, playerName: name, cricheroesUrl: null })
  const out = aggregateBreakthroughLeaders([
    { matchId: 'm1', bookingId: 'b1', gameDate: '2026-10-01', opponentName: 'X', stands },
    { matchId: 'm2', bookingId: 'b2', gameDate: '2026-10-08', opponentName: 'Y', stands: standsB },
  ], resolve)

  it('lists biggest stands first, skipping run-outs', () => {
    expect(out.biggest.map(r => r.runs)).toEqual([70, 60, 40, 20])
    expect(out.biggest[0].bowler.playerName).toBe('Sagar')
    expect(out.biggest.some(r => r.runs === 10)).toBe(false)
  })

  it('picks the biggest stand for each wicket, credited to its bowler', () => {
    expect(out.byWicket.map(r => r.wicketNumber)).toEqual([1, 2])
    expect(out.byWicket[0]).toMatchObject({ runs: 70, matchId: 'm2' })
    expect(out.byWicket[0].bowler.playerName).toBe('Sagar')
    expect(out.byWicket[1]).toMatchObject({ runs: 60, matchId: 'm1' })
  })
})

describe('describeDismissal', () => {
  const txt = (t: string | null, f: string | null, w: string | null) =>
    describeDismissal({ dismissalType: t, fielderName: f, bowlerName: w }).map(x => x.value).join('')
  it('words each dismissal with fielder and bowler', () => {
    expect(txt('caught', 'Sagar', 'Ramesh')).toBe('Caught by Sagar, bowled Ramesh')
    expect(txt('caught', 'Ramesh', 'Ramesh')).toBe('Caught & bowled by Ramesh')
    expect(txt('caught_behind', 'Siva', 'PP')).toBe('Caught behind by Siva, bowled PP')
    expect(txt('stumping', 'Siva', 'PP')).toBe('Stumped by Siva, bowled PP')
    expect(txt('bowled', null, 'Kishore')).toBe('Bowled by Kishore')
    expect(txt('lbw', null, 'Ramesh')).toBe('LBW, bowled Ramesh')
    expect(txt('run_out', 'Kishore', null)).toBe('Run out (Kishore)')
  })
})
