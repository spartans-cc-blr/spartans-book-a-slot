import { describe, it, expect } from 'vitest'
import { findCapHolders, capsForPlayer } from './capHolders'
import type { LeaderboardRow } from '@/types'

const row = (id: string, s: Partial<LeaderboardRow['stats']>): LeaderboardRow =>
  ({ playerId: id, playerName: id, cricheroesUrl: null, stats: { runs: 0, wickets: 0, strikeRate: null, economy: null, bowlingStrikeRate: null, ...s } } as unknown as LeaderboardRow)

describe('findCapHolders', () => {
  it('orange: most runs, ties broken by strike rate', () => {
    const rows = [row('a', { runs: 200, strikeRate: 120 }), row('b', { runs: 200, strikeRate: 140 }), row('c', { runs: 150, strikeRate: 200 })]
    expect(Array.from(findCapHolders(rows, 'orange'))).toEqual(['b'])
  })
  it('orange: exact tie shares the cap', () => {
    const rows = [row('a', { runs: 200, strikeRate: 120 }), row('b', { runs: 200, strikeRate: 120 })]
    expect(findCapHolders(rows, 'orange').size).toBe(2)
  })
  it('purple: most wickets, ties broken by lower economy', () => {
    const rows = [row('a', { wickets: 10, economy: 7.5 }), row('b', { wickets: 10, economy: 6.2 }), row('c', { wickets: 9, economy: 4 })]
    expect(Array.from(findCapHolders(rows, 'purple'))).toEqual(['b'])
  })
  it('nobody holds a cap on zero runs/wickets', () => {
    const rows = [row('a', {}), row('b', {})]
    expect(findCapHolders(rows, 'orange').size).toBe(0)
    expect(findCapHolders(rows, 'purple').size).toBe(0)
  })
})

describe('capsForPlayer', () => {
  it('returns every cap held', () => {
    expect(capsForPlayer('a', { orange: ['a'], purple: ['a'] })).toEqual(['orange', 'purple'])
    expect(capsForPlayer('z', { orange: ['a'], purple: ['a'] })).toEqual([])
  })
})
