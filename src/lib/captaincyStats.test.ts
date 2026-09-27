import { describe, it, expect } from 'vitest'
import {
  buildCaptainRecord, buildPlayerUnderCaptains, buildSeasonProgression, battingLine, bowlingLine,
  pickRecommendedPosition, filterCaptaincyInnings, type CaptaincyInnings, type PositionUsage,
} from './captaincyStatsCore'

let seq = 0
function inn(p: Partial<CaptaincyInnings> & { playerId: string }): CaptaincyInnings {
  seq++
  return {
    matchId: `m${seq}`, bookingId: `b${seq}`, gameDate: '2026-05-01', format: 'T20',
    tournamentName: 'T', opponentName: 'Opp', captainId: 'cap1', captainName: 'Cap One',
    playerName: p.playerId.toUpperCase(), cricheroesUrl: null, batting: null, bowling: null,
    ...p,
  }
}
const bat = (position: number, runs: number, balls = runs, notOut = false) => ({ position, runs, balls, notOut })
const bowl = (balls: number, runs: number, wickets: number) => ({ balls, runs, wickets })

describe('battingLine / bowlingLine', () => {
  it('computes average with not-outs and best innings', () => {
    const l = battingLine([
      inn({ playerId: 'a', batting: bat(1, 40, 30) }),
      inn({ playerId: 'a', batting: bat(1, 40, 20, true) }),
      inn({ playerId: 'a', batting: bat(1, 10, 10) }),
      inn({ playerId: 'a' }), // did not bat
    ])
    expect(l.innings).toBe(3)
    expect(l.runs).toBe(90)
    expect(l.average).toBe(45) // 90 / 2 dismissals
    expect(l.strikeRate).toBe(150)
    expect(l.best).toEqual({ runs: 40, notOut: true })
  })

  it('sums balls, not float overs', () => {
    const l = bowlingLine([
      inn({ playerId: 'a', bowling: bowl(22, 30, 1) }), // 3.4
      inn({ playerId: 'a', bowling: bowl(17, 20, 3) }), // 2.5
    ])
    expect(l.overs).toBe('6.3')
    expect(l.economy).toBe(7.69)
    expect(l.average).toBe(12.5)
    expect(l.best).toEqual({ wickets: 3, runs: 20 })
  })
})

describe('buildCaptainRecord', () => {
  const rows = [
    inn({ playerId: 'a', batting: bat(1, 60) }),
    inn({ playerId: 'a', batting: bat(1, 20) }),
    inn({ playerId: 'b', batting: bat(1, 80) }),
    inn({ playerId: 'c', batting: bat(1, 80), bowling: bowl(24, 30, 2) }),
    inn({ playerId: 'c', batting: bat(1, 0) }),
    inn({ playerId: 'd', batting: bat(1, 5) }),
    inn({ playerId: 'd', batting: bat(4, 50), bowling: bowl(12, 10, 1) }),
    inn({ playerId: 'e', batting: { position: null, runs: 99, balls: 50, notOut: false } }),
  ]
  const rec = buildCaptainRecord(rows)

  it('ranks top 3 per position by runs, then fewer innings', () => {
    const p1 = rec.positions.find(p => p.position === 1)!
    expect(p1.choices.map(c => c.playerId)).toEqual(['b', 'a', 'c'])
    expect(p1.choices.map(c => c.rank)).toEqual([1, 2, 3])
  })

  it('skips innings with no recorded position', () => {
    expect(rec.positions.map(p => p.position)).toEqual([1, 4])
  })

  it('orders bowlers by balls bowled with share of the total', () => {
    expect(rec.bowlers.map(b => b.playerId)).toEqual(['c', 'd'])
    expect(rec.bowlers[0].share).toBeCloseTo(24 / 36)
  })

  it('counts distinct matches', () => {
    expect(rec.matches).toBe(rows.length)
  })
})

describe('buildPlayerUnderCaptains', () => {
  const rows = [
    inn({ playerId: 'p', captainId: 'x', captainName: 'X', gameDate: '2026-03-01', batting: bat(5, 10) }),
    inn({ playerId: 'p', captainId: 'y', captainName: 'Y', gameDate: '2026-02-01', batting: bat(3, 30), bowling: bowl(18, 20, 1) }),
    inn({ playerId: 'p', captainId: 'x', captainName: 'X', gameDate: '2026-01-01', batting: bat(3, 40) }),
    inn({ playerId: 'p', captainId: 'x', captainName: 'X', gameDate: '2026-04-01', batting: bat(3, 12) }),
    inn({ playerId: 'p', captainId: null, captainName: null, gameDate: '2026-05-01', batting: bat(7, 1) }),
  ]
  const out = buildPlayerUnderCaptains(rows)

  it('groups by captain, most matches first, unknown captain last', () => {
    expect(out.map(c => c.captainName)).toEqual(['X', 'Y', 'Captain not recorded'])
    expect(out[0].matches).toBe(3)
  })

  it('orders positions by batting order (ascending), not innings frequency', () => {
    expect(out[0].positions.map(p => [p.position, p.innings])).toEqual([[3, 2], [5, 1]])
  })

  it('sorts by position even when innings frequency disagrees', () => {
    const divergent = buildPlayerUnderCaptains([
      inn({ playerId: 'q', captainId: 'z', captainName: 'Z', gameDate: '2026-01-01', batting: bat(2, 10) }),
      inn({ playerId: 'q', captainId: 'z', captainName: 'Z', gameDate: '2026-01-02', batting: bat(8, 20) }),
      inn({ playerId: 'q', captainId: 'z', captainName: 'Z', gameDate: '2026-01-03', batting: bat(8, 20) }),
      inn({ playerId: 'q', captainId: 'z', captainName: 'Z', gameDate: '2026-01-04', batting: bat(8, 20) }),
    ])
    // Position 8 has the most innings (3) but position 2 still leads —
    // a plain innings-desc sort would have put 8 first.
    expect(divergent[0].positions.map(p => p.position)).toEqual([2, 8])
  })

  it('lists each position\'s matches newest first', () => {
    const pos3 = out[0].positions.find(p => p.position === 3)!
    expect(pos3.matches.map(m => [m.gameDate, m.runs])).toEqual([['2026-04-01', 12], ['2026-01-01', 40]])
  })

  it('builds a chronological timeline', () => {
    expect(out[0].timeline.map(t => t.gameDate)).toEqual(['2026-01-01', '2026-03-01', '2026-04-01'])
    expect(out[0].firstDate).toBe('2026-01-01')
    expect(out[0].lastDate).toBe('2026-04-01')
  })

  it('attaches a recommended position once a captain has enough data', () => {
    // Under X: No.3 (2 inn, 52 runs, avg 26) vs No.5 (1 inn, only — too few
    // innings to be eligible at all).
    expect(out[0].recommendedPosition?.position).toBe(3)
    expect(out[0].recommendedPosition?.reason).toMatch(/2\+ innings/)
    // Y only ever has one innings recorded at any position — nothing
    // qualifies yet.
    const y = out.find(c => c.captainName === 'Y')!
    expect(y.recommendedPosition).toBeNull()
  })
})

describe('pickRecommendedPosition', () => {
  const pos = (over: Partial<PositionUsage>): PositionUsage =>
    ({ position: 1, innings: 3, runs: 0, average: null, strikeRate: null, matches: [], ...over })

  it('picks the position with the best blended runs/average/SR, ignoring too-thin samples', () => {
    const positions = [
      pos({ position: 3, innings: 3, runs: 30, average: 10, strikeRate: 80 }),
      pos({ position: 5, innings: 4, runs: 200, average: 66.7, strikeRate: 140 }),
      pos({ position: 7, innings: 1, runs: 90, average: 90, strikeRate: 200 }), // 1 inn — excluded
    ]
    const rec = pickRecommendedPosition(positions)
    expect(rec?.position).toBe(5)
  })

  it('returns null when nothing has enough innings', () => {
    expect(pickRecommendedPosition([pos({ position: 4, innings: 1, runs: 50, average: 50, strikeRate: 120 })])).toBeNull()
  })

  it('breaks an exact tie toward the lower (earlier) position', () => {
    const positions = [
      pos({ position: 6, innings: 3, runs: 60, average: 30, strikeRate: 100 }),
      pos({ position: 2, innings: 3, runs: 60, average: 30, strikeRate: 100 }),
    ]
    expect(pickRecommendedPosition(positions)?.position).toBe(2)
  })
})

describe('filterCaptaincyInnings', () => {
  const rows = [
    inn({ playerId: 'p', gameDate: '2025-06-01', format: 'T20', captainId: 'x', bookingId: 'bA' }),
    inn({ playerId: 'p', gameDate: '2026-01-01', format: 'T30', captainId: 'x', bookingId: 'bB' }),
    inn({ playerId: 'p', gameDate: '2026-06-01', format: 'T20', captainId: 'p', bookingId: 'bC' }),
  ]

  it('passes everything through with no options', () => {
    expect(filterCaptaincyInnings(rows, {})).toHaveLength(3)
  })

  it('narrows by year', () => {
    expect(filterCaptaincyInnings(rows, { year: 2026 }).map(r => r.bookingId)).toEqual(['bB', 'bC'])
  })

  it('does not restrict when both known formats are checked, but does when only one is', () => {
    expect(filterCaptaincyInnings(rows, { formats: new Set(['T20', 'T30']) })).toHaveLength(3)
    expect(filterCaptaincyInnings(rows, { formats: new Set(['T20']) }).map(r => r.bookingId)).toEqual(['bA', 'bC'])
  })

  it('restricts to matches where the viewer was the match captain', () => {
    expect(filterCaptaincyInnings(rows, { asCaptainOnly: true, viewerPlayerId: 'p' }).map(r => r.bookingId)).toEqual(['bC'])
  })

  it('restricts by defending/chasing via a bookingId-keyed lookup, excluding unknown bookings', () => {
    const battedFirstByBooking = new Map([['bA', true], ['bB', false]]) // bC deliberately missing
    expect(filterCaptaincyInnings(rows, { innings: new Set<'defending' | 'chasing'>(['defending']), battedFirstByBooking }).map(r => r.bookingId))
      .toEqual(['bA'])
    expect(filterCaptaincyInnings(rows, { innings: new Set<'defending' | 'chasing'>(['chasing']), battedFirstByBooking }).map(r => r.bookingId))
      .toEqual(['bB'])
  })

  it('combines filters (AND, not OR)', () => {
    expect(filterCaptaincyInnings(rows, { year: 2026, formats: new Set(['T20']) }).map(r => r.bookingId)).toEqual(['bC'])
  })
})

describe('buildSeasonProgression', () => {
  it('splits by year, newest first, with the most-played batting position', () => {
    const out = buildSeasonProgression([
      inn({ playerId: 'p', gameDate: '2025-06-01', batting: bat(6, 10) }),
      inn({ playerId: 'p', gameDate: '2025-06-08' }), // did not bat
      inn({ playerId: 'p', gameDate: '2026-06-01', batting: bat(3, 30) }),
      inn({ playerId: 'p', gameDate: '2026-06-08', batting: bat(2, 0) }),
      inn({ playerId: 'p', gameDate: '2026-07-01', batting: bat(3, 50), bowling: bowl(6, 8, 1) }),
    ])
    expect(out.map(s => s.year)).toEqual(['2026', '2025'])
    expect(out[0].mostPlayedPosition).toEqual({ position: 3, innings: 2 })
    expect(out[0].batting.innings).toBe(3)
    expect(out[1].batting.innings).toBe(1)
    expect(out[0].batting.runs).toBe(80)
    expect(out[0].bowling.wickets).toBe(1)
  })

  it('breaks a most-played tie toward the higher order', () => {
    const out = buildSeasonProgression([
      inn({ playerId: 'p', gameDate: '2026-01-01', batting: bat(5, 1) }),
      inn({ playerId: 'p', gameDate: '2026-01-02', batting: bat(2, 1) }),
    ])
    expect(out[0].mostPlayedPosition).toEqual({ position: 2, innings: 1 })
  })
})
