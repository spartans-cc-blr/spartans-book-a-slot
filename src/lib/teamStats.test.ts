import { describe, it, expect } from 'vitest'
import {
  summarize, recentForm, currentStreak, splitBy, splitByNested, computeRecords, winMargin,
  applyFilters, opponentKey, captainKey, filterOptions, normaliseResult, type TeamMatch,
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

  it('sorts categorical splits by win % descending by default', () => {
    // Two captains: p1 (Muthu) 2W-1L across the non-practice sample, p2
    // (Keshav) a single loss added on top — higher win % first, even
    // though p1 has more games played.
    const withLosingCaptain = [...sample, m({ gameDate: '2026-03-01', result: 'lost', captainId: 'p2', captainName: 'Keshav' })]
    const rows = splitBy(withLosingCaptain, 'captain')
    expect(rows.map(r => r.label)).toEqual(['Muthu', 'Keshav'])
    expect(rows[0].winPct).toBeGreaterThan(rows[1].winPct!)
  })

  it('sorts a group with no decided result last, not first', () => {
    // An nr-only group has winPct === null — it must never outrank a real
    // number just because null happens to compare oddly.
    const undecidedOnly = m({ gameDate: '2026-04-01', result: 'nr', teamTotal: null, oppTotal: null, format: 'T30', tossWon: null, tossDecision: null, battedFirst: null })
    const rows = splitBy([...sample.filter(x => x.gameDate !== '2026-02-15'), undecidedOnly], 'format')
    expect(rows[rows.length - 1].key).toBe('T30')
    expect(rows[rows.length - 1].winPct).toBeNull()
  })
})

describe('applyFilters — toss / captain / month / slot', () => {
  it('filters by toss outcome, dropping matches with no toss data', () => {
    expect(applyFilters(sample, { toss: 'won' }).map(x => x.gameDate)).toEqual(['2026-01-04', '2026-02-01'])
    expect(applyFilters(sample, { toss: 'lost' }).map(x => x.gameDate)).toEqual(['2026-01-11'])
    // The 8 Feb no-toss match is in neither, and the 15 Feb one is
    // practice (excluded by default) — so neither side ever sees it.
    expect(applyFilters(sample, { toss: 'won' }).some(x => x.gameDate === '2026-02-08')).toBe(false)
  })

  it('filters by captain, month and slot time', () => {
    const withOther = [...sample, m({ gameDate: '2026-03-01', slotTime: '14:30', captainId: 'p2', captainName: 'Keshav' })]
    expect(applyFilters(withOther, { captainKey: 'p2' }).map(x => x.gameDate)).toEqual(['2026-03-01'])
    expect(applyFilters(withOther, { month: '2026-01' }).map(x => x.gameDate)).toEqual(['2026-01-04', '2026-01-11'])
    expect(applyFilters(withOther, { slotTime: '14:30' }).map(x => x.gameDate)).toEqual(['2026-03-01'])
    expect(applyFilters(withOther, { slotTime: '07:30' })).toHaveLength(4)
  })

  it('buckets a booking with no recorded captain under "unknown"', () => {
    const noCaptain = m({ gameDate: '2026-04-01', captainId: null, captainName: null })
    expect(captainKey(noCaptain)).toBe('unknown')
    expect(applyFilters([...sample, noCaptain], { captainKey: 'unknown' })).toHaveLength(1)
  })

  it('combines a filter with a split — the two-dimension case', () => {
    // "How does each captain do after winning the toss": filter one, split
    // the other. See features/team-stats.md §3.2.
    const rows = splitBy(applyFilters(sample, { toss: 'won' }), 'captain')
    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({ label: 'Muthu', played: 2, won: 2, winPct: 100 })
  })
})

describe('filterOptions', () => {
  it('lists captains, months and slots alongside the existing lists', () => {
    const o = filterOptions([...sample, m({ gameDate: '2026-03-01', slotTime: '14:30', captainId: 'p2', captainName: 'Keshav' })])
    expect(o.captains.map(c => c.name)).toEqual(['Keshav', 'Muthu'])
    expect(o.months.map(x => x.id)).toEqual(['2026-03', '2026-02', '2026-01'])   // newest first
    expect(o.slots.map(x => x.id)).toEqual(['07:30', '14:30'])                    // chronological
  })

  it('sorts "Captain not recorded" last, not alphabetically', () => {
    const o = filterOptions([m({ gameDate: '2026-05-01', captainId: null, captainName: null }), ...sample])
    expect(o.captains[o.captains.length - 1].id).toBe('unknown')
  })
})

describe('splitByNested', () => {
  it('returns a plain split when there is no second dimension', () => {
    expect(splitByNested(sample, 'captain')[0].sub).toBeUndefined()
    expect(splitByNested(sample, 'captain', null)[0].sub).toBeUndefined()
  })

  it('ignores a second dimension equal to the first', () => {
    expect(splitByNested(sample, 'captain', 'captain')[0].sub).toBeUndefined()
  })

  it('breaks each group down by the second dimension', () => {
    const rows = splitByNested(sample, 'captain', 'toss')
    expect(rows).toHaveLength(1)
    const sub = rows[0].sub!
    // splitByNested groups whatever it is given — practice exclusion is
    // applyFilters' job upstream, so all five sample matches are in play.
    expect(sub.find(r => r.key === 'toss-won')).toMatchObject({ played: 3, won: 3 })
    expect(sub.find(r => r.key === 'toss-lost')).toMatchObject({ played: 1, lost: 1 })
    // Sub-rows only ever cover the parent's own matches.
    for (const r of sub) for (const match of r.matches) {
      expect(rows[0].matches.map(x => x.bookingId)).toContain(match.bookingId)
    }
  })

  it('leaves a match with no group for the second dimension out of every sub-row', () => {
    // The 8 Feb match has no toss data, so it belongs to no toss bucket —
    // the table adds a "Not recorded" sub-row for exactly this case.
    const rows = splitByNested(sample, 'captain', 'toss')
    const covered = new Set(rows[0].sub!.flatMap(r => r.matches.map(x => x.bookingId)))
    const uncovered = rows[0].matches.filter(x => !covered.has(x.bookingId))
    expect(uncovered.map(x => x.gameDate)).toEqual(['2026-02-08'])
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
