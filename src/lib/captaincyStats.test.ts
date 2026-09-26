import { describe, it, expect } from 'vitest'
import {
  buildCaptainRecord, buildPlayerUnderCaptains, buildSeasonProgression, battingLine, bowlingLine,
  type CaptaincyInnings,
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
    expect(p1.totalInnings).toBe(6)
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

  it('orders positions by innings then position', () => {
    expect(out[0].positions.map(p => [p.position, p.innings])).toEqual([[3, 2], [5, 1]])
  })

  it('builds a chronological timeline', () => {
    expect(out[0].timeline.map(t => t.gameDate)).toEqual(['2026-01-01', '2026-03-01', '2026-04-01'])
    expect(out[0].firstDate).toBe('2026-01-01')
    expect(out[0].lastDate).toBe('2026-04-01')
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
