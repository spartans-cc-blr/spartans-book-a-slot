import { describe, it, expect } from 'vitest'
import { pickHighlights, type CareerHighlights } from './playerHighlights'

function base(over: Partial<CareerHighlights> = {}): CareerHighlights {
  return {
    matches: 10, runs: 0, battingInnings: 0, battingAverage: null,
    wickets: 0, bowlingAverage: null, dismissals: 0,
    bestInnings: null, bestBowling: null, ...over,
  }
}

describe('pickHighlights', () => {
  it('returns nothing for a player with no stats', () => {
    expect(pickHighlights(null)).toEqual([])
    expect(pickHighlights(base())).toEqual([])
  })

  it('leads with a century over a two-wicket best', () => {
    const h = pickHighlights(base({
      bestInnings: { runs: 104, balls: 61, notOut: true },
      bestBowling: { wickets: 2, runs: 20 },
    }))
    expect(h[0].key).toBe('best_innings')
    expect(h[0].value).toBe('104* (61)')
    expect(h[1].value).toBe('2/20')
  })

  it('leads with a five-for over a modest top score', () => {
    const h = pickHighlights(base({
      bestInnings: { runs: 22, balls: 18, notOut: false },
      bestBowling: { wickets: 5, runs: 14 },
    }))
    expect(h[0].key).toBe('best_bowling')
    expect(h[0].value).toBe('5/14')
  })

  it('only shows averages once the sample is big enough', () => {
    const small = pickHighlights(base({ battingInnings: 3, battingAverage: 80, wickets: 4, bowlingAverage: 5 }), 10)
    expect(small.find(x => x.key === 'bat_avg')).toBeUndefined()
    expect(small.find(x => x.key === 'bowl_avg')).toBeUndefined()

    const big = pickHighlights(base({ battingInnings: 12, battingAverage: 34.5, wickets: 12, bowlingAverage: 14.25 }), 10)
    expect(big.find(x => x.key === 'bat_avg')?.value).toBe('34.5')
    expect(big.find(x => x.key === 'bowl_avg')?.value).toBe('14.3')
  })

  it('caps at max and sorts by score', () => {
    const h = pickHighlights(base({
      runs: 1500, wickets: 30, dismissals: 20,
      bestInnings: { runs: 55, balls: 40, notOut: false },
    }))
    expect(h).toHaveLength(3)
    expect(h.map(x => x.key)).toEqual(['career_runs', 'dismissals', 'career_wickets'])
  })
})
