import { describe, it, expect } from 'vitest'
import { aggregatePartnershipLeaders, type MatchPartnerships } from './partnershipLeaders'
import type { Partnership, PartnershipPlayer } from './partnerships'

const A: PartnershipPlayer = { playerId: 'a', playerName: 'Alpha' }
const B: PartnershipPlayer = { playerId: 'b', playerName: 'Bravo' }
const C: PartnershipPlayer = { playerId: null, playerName: 'Charlie K' }

function p(wicketNumber: number, runs: number, players: [PartnershipPlayer, PartnershipPlayer], overFrom = 0, overTo = 1, unbroken = false): Partnership {
  return { wicketNumber, runs, overFrom, overTo, players, outPlayer: unbroken ? null : players[0] }
}
function match(id: string, date: string, partnerships: Partnership[]): MatchPartnerships {
  return { matchId: id, bookingId: `bk-${id}`, gameDate: date, opponentName: `Opp ${id}`, partnerships }
}
const resolve = (x: { playerId: string | null; playerName: string }) => ({ ...x, cricheroesUrl: null })

describe('aggregatePartnershipLeaders', () => {
  const matches = [
    match('m1', '2026-01-10', [p(1, 40, [A, B], 0, 5.2), p(2, 80, [B, C], 5.2, 12, true)]),
    match('m2', '2026-02-10', [p(1, 40, [B, A], 0, 4), p(3, 15, [A, C])]),
  ]

  it('ranks top partnerships by runs, fewer balls breaking a tie', () => {
    const { top } = aggregatePartnershipLeaders(matches, resolve)
    expect(top.map(r => `${r.matchId}:${r.wicketNumber}`)).toEqual(['m1:2', 'm2:1', 'm1:1', 'm2:3'])
    expect(top[0].unbroken).toBe(true)
    expect(top[1].balls).toBe(24)
    expect(top[2].balls).toBe(32) // 5.2 overs = 32 balls, not 5.2 * 6
  })

  it('picks the best stand per wicket, in wicket order', () => {
    const { byWicket } = aggregatePartnershipLeaders(matches, resolve)
    expect(byWicket.map(r => [r.wicketNumber, r.runs])).toEqual([[1, 40], [2, 80], [3, 15]])
  })

  it('aggregates a pair regardless of batting side, keying unreconciled names by name', () => {
    const { pairs } = aggregatePartnershipLeaders(matches, resolve)
    // B+C (80 in 1 innings) and A+B (40 + 40, batting sides swapped) tie on
    // runs — fewer innings ranks first.
    expect(pairs.map(x => [x.players.map(pl => pl.playerName).join('&'), x.runs, x.innings])).toEqual([
      ['Bravo&Charlie K', 80, 1],
      ['Alpha&Bravo', 80, 2],
      ['Alpha&Charlie K', 15, 1],
    ])
    expect(pairs[0].bestUnbroken).toBe(true)
    expect(pairs).toHaveLength(3)
  })

  it('caps the top list', () => {
    const many = [match('x', '2026-03-01', Array.from({ length: 12 }, (_, i) => p(1, i, [A, B])))]
    expect(aggregatePartnershipLeaders(many, resolve).top).toHaveLength(10)
  })
})
