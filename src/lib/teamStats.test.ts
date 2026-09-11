import { describe, it, expect } from 'vitest'
import {
  summarize, recentForm, currentStreak, splitBy, computeRecords, winMargin,
  applyFilters, opponentKey, normaliseResult, type TeamMatch,
} from './teamStatsCore'

function m(over: Partial<TeamMatch> & { gameDate: string }): TeamMatch {
  return {
    bookingId: `b-${over.gameDate}-${over.slotTime ?? '07:30'}`,
    matchId: `m-${over.gameDate}`,
    slotTime: '07:30', format: 'T20', result: 'won',
    teamTotal: 150, teamWickets: 5, teamOvers: 20, oppTotal: 120, oppWickets: 10, oppOvers: 18.4,
    opponentName: 'Rising Phoenix CC', opponentId: null, opponentLabel: 'Rising Phoenix CC', isMarquee: false,
    tournamentId: 't1', tournamentName: 'Trumphate', isPractice: false,
    groundId: 'g1', groundName: 'Mario Turner', stageType: null, matchStage: null,
    tossWon: true, tossDecision: 'bat', battedFirst: true,
    captainId: 'p1', captainName: 'Muthu',
    ...over,
  }
}

const sample: TeamMatch[] = [
  m({ gameDate: '2026-01-04', result: 'won' }),
  m({ gameDate: '2026-01-11', result: 'lost', tossWon: false, tossDecision: 'bat', battedFirst: false, teamTotal: 90, teamWickets: 10, oppTotal: 180 }),
  m({ gameDate: '2026-02-01', result: 'won', tossWon: true, tossDecision: 'field', battedFirst: false, teamTotal: 181, teamWickets: 4, oppTotal: 180, opponentName: 'Blue Warriors', opponentLabel: 'Blue Warriors', stageType: 'knockout' }),
  m({ gameDate: '2026-02-08', result: 'nr', teamTotal: null, oppTotal: null, tossWon: null, tossDecision: null, battedFirst: null }),
  m({ gameDate: '2026-02-15', result: 'won', teamTotal: 210, teamWickets: 6, oppTotal: 100, format: 'T30', isPractice: true }),
]

describe('normaliseResult', () => {
  it('maps the cache vocabulary', () => {
    expect(normaliseResult('WON')).toBe('won')
    expect(normaliseResult('lost')).toBe('lost')
    expect(normaliseResult('NR')).toBe('nr')
    expect(normaliseResult('Tied')).toBe('tied')
    expect(normaliseResult(null)).toBeNull()
  })
})

describe('summarize', () => {
  it('excludes no-results from win %', () => {
    const s = summarize(sample)
    expect(s).toMatchObject({ played: 5, won: 3, lost: 1, tied: 0, nr: 1 })
    expect(s.winPct).toBe(75)
  })
  it('returns null win % with nothing decided', () => {
    expect(summarize([]).winPct).toBeNull()
  })
})

describe('recentForm / currentStreak', () => {
  it('reads newest-first regardless of input order', () => {
    expect(recentForm(sample, 3)).toEqual(['W', 'NR', 'W'])
  })
  it('skips no-results when counting a streak', () => {
    expect(currentStreak(sample)).toEqual({ letter: 'W', length: 2 })
    expect(currentStreak([m({ gameDate: '2026-03-01', result: 'nr' })])).toBeNull()
  })
})

describe('applyFilters', () => {
  it('excludes practice by default and includes on request', () => {
    expect(applyFilters(sample, {}).length).toBe(4)
    expect(applyFilters(sample, { includePractice: true }).length).toBe(5)
  })
  it('filters by innings, stage, format and year', () => {
    expect(applyFilters(sample, { innings: 'chasing' }).map(x => x.gameDate)).toEqual(['2026-01-11', '2026-02-01'])
    expect(applyFilters(sample, { stage: 'knockout' }).length).toBe(1)
    expect(applyFilters(sample, { includePractice: true, format: 'T30' }).length).toBe(1)
    expect(applyFilters(sample, { year: 2025 }).length).toBe(0)
  })
})

describe('splitBy', () => {
  it('groups opponents by canonical id when reconciled, else normalised spelling', () => {
    const a = m({ gameDate: '2026-03-01', opponentName: 'Blue Warriors ' })
    const b = m({ gameDate: '2026-03-08', opponentName: 'blue warriors' })
    expect(opponentKey(a)).toBe(opponentKey(b))
    const c = m({ gameDate: '2026-03-15', opponentName: 'BW', opponentId: 'o1', opponentLabel: 'Blue Warriors', isMarquee: true })
    const rows = splitBy([a, b, c], 'opponent')
    expect(rows.length).toBe(2)
    expect(rows[0].meta?.isMarquee).toBe(true) // marquee pinned first despite fewer matches
  })
  it('treats unclassified stage as league', () => {
    const rows = splitBy(sample, 'stage')
    expect(rows.map(r => [r.key, r.played])).toEqual([['knockout', 1], ['league', 4]])
  })
  it('puts a toss-winning match in both the outcome and decision buckets', () => {
    const rows = splitBy(sample, 'toss')
    expect(rows.map(r => r.key)).toEqual(['toss-won', 'toss-lost', 'chose-bat', 'chose-field'])
    expect(rows.find(r => r.key === 'toss-won')!.played).toBe(3)
    expect(rows.find(r => r.key === 'chose-field')!.played).toBe(1)
  })
  it('drops matches with no toss data from the innings split', () => {
    const rows = splitBy(sample, 'innings')
    expect(rows.reduce((n, r) => n + r.played, 0)).toBe(4)
  })
})

describe('records', () => {
  it('derives run and wicket margins from batting order', () => {
    expect(winMargin(sample[0])).toEqual({ kind: 'runs', value: 30 })
    expect(winMargin(sample[2])).toEqual({ kind: 'wickets', value: 6 })
    expect(winMargin(sample[1])).toBeNull()
  })
  it('computes headline records and ignores no-results', () => {
    const recs = computeRecords(sample)
    const by = (t: string) => recs.find(r => r.title === t)!
    expect(by('Highest team total').match.gameDate).toBe('2026-02-15')
    expect(by('Lowest team total').match.gameDate).toBe('2026-01-11')
    expect(by('Highest successful chase').value).toBe('181/4 (20 ov)')
    expect(by('Lowest total defended').match.gameDate).toBe('2026-01-04')
    expect(by('Biggest win by runs').value).toBe('by 110 runs')
    expect(by('Biggest win by wickets').value).toBe('by 6 wickets')
  })
})
