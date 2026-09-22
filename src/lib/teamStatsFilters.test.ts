import { describe, it, expect } from 'vitest'
import {
  DEFAULT_TEAM_FILTER_STATE, FILTER_KEYS, SPLIT_DIMENSIONS, activeFilterKeys, buildTeamStatsHref, clearAllFilters, clearFilter,
  currentTeamStatsYear, filterValueLabel, isFilterSet, parseCsvParam, parseTeamFilterState, toTeamFilters,
  visibleFilterKeys, visibleSplitDimensions,
  type TeamFilterState,
} from './teamStatsFilters'

const options = {
  years: ['2026', '2025'],
  tournaments: [{ id: 't1', name: 'Thunder 5' }, { id: 't2', name: 'Sara Cup' }],
  grounds: [{ id: 'g1', name: 'Mario Turner' }],
  opponents: [{ id: 'id:o1', name: 'Rising Phoenix CC' }],
  captains: [{ id: 'p1', name: 'Muthu' }, { id: 'p2', name: 'Keshav' }],
  months: [{ id: '2026-09', name: 'Sep 2026' }],
  slots: [{ id: '07:30', name: '7:30 AM' }],
}

describe('teamStatsFilters', () => {
  // The page pre-filters to the current season by default (see
  // features/team-stats.md §3) — the bare-href sentinel for year is
  // therefore "whatever year it is today", not the empty-array sentinel
  // every other filter uses. An explicit "All time" (empty array) has to
  // be spelled out in the URL instead, or it would round-trip back into
  // "no year specified" → current year on the next load.
  it('the current-year state (the page default) maps to the bare /team-stats href', () => {
    const s: TeamFilterState = { ...DEFAULT_TEAM_FILTER_STATE, year: [currentTeamStatsYear()] }
    expect(buildTeamStatsHref(s)).toBe('/team-stats')
    expect(activeFilterKeys(s)).toEqual(['year'])
  })

  it('"all time" is spelled out explicitly, not omitted', () => {
    expect(buildTeamStatsHref(DEFAULT_TEAM_FILTER_STATE)).toBe('/team-stats?year=all')
    // An empty array is still the "no restriction" sentinel for chip/count
    // purposes — it just isn't the same thing as an unspecified URL year.
    expect(activeFilterKeys(DEFAULT_TEAM_FILTER_STATE)).toEqual([])
  })

  it('encodes only non-default params, split dimension included', () => {
    // A non-current year (not just any year — see the two tests above for
    // why the current year specifically is the one that gets omitted).
    const s: TeamFilterState = { ...DEFAULT_TEAM_FILTER_STATE, year: ['2025'], format: ['T20'], practice: true, by: 'ground' }
    expect(buildTeamStatsHref(s)).toBe('/team-stats?year=2025&format=T20&practice=1&by=ground')
    expect(activeFilterKeys(s)).toEqual(['year', 'format', 'practice'])
  })

  it('encodes the new toss / captain / month / slot filters', () => {
    // year pinned to the current-season default so only the filters under
    // test show up in the href — see the two tests above.
    const s: TeamFilterState = { ...DEFAULT_TEAM_FILTER_STATE, year: [currentTeamStatsYear()], toss: ['won'], captain: ['p1'], month: ['2026-09'], slot: ['07:30'] }
    expect(buildTeamStatsHref(s)).toBe('/team-stats?month=2026-09&captain=p1&slot=07%3A30&toss=won')
    expect(activeFilterKeys(s)).toEqual(['year', 'month', 'captain', 'slot', 'toss'])
  })

  it('encodes a second-level split, and never one equal to the first', () => {
    const nested: TeamFilterState = { ...DEFAULT_TEAM_FILTER_STATE, year: [currentTeamStatsYear()], by: 'captain', then: 'toss' }
    expect(buildTeamStatsHref(nested)).toBe('/team-stats?by=captain&then=toss')
    const sameBoth: TeamFilterState = { ...DEFAULT_TEAM_FILTER_STATE, year: [currentTeamStatsYear()], by: 'captain', then: 'captain' }
    expect(buildTeamStatsHref(sameBoth)).toBe('/team-stats?by=captain')
  })

  it('clearFilter / clearAllFilters keep both split dimensions', () => {
    const s: TeamFilterState = { ...DEFAULT_TEAM_FILTER_STATE, tournament: ['t1'], practice: true, by: 'captain', then: 'toss' }
    expect(isFilterSet(s, 'tournament')).toBe(true)
    expect(clearFilter(s, 'tournament').tournament).toEqual([])
    expect(clearFilter(s, 'practice').practice).toBe(false)
    expect(clearAllFilters(s)).toEqual({ ...DEFAULT_TEAM_FILTER_STATE, by: 'captain', then: 'toss' })
  })

  it('toTeamFilters converts year strings to numbers and passes the rest through', () => {
    const s: TeamFilterState = { ...DEFAULT_TEAM_FILTER_STATE, year: ['2025'], opponent: ['id:o1'], innings: ['chasing'], captain: ['p1'] }
    expect(toTeamFilters(s)).toEqual({
      year: [2025], month: [], format: [], tournamentId: [], groundId: [], pitch: [], opponentKey: ['id:o1'],
      captainKey: ['p1'], slotTime: [], innings: ['chasing'], toss: [], stage: [], includePractice: false,
    })
    const bare = toTeamFilters(DEFAULT_TEAM_FILTER_STATE)
    expect(bare.year).toEqual([])
    expect(bare.month).toEqual([])
    expect(bare.captainKey).toEqual([])
    expect(bare.slotTime).toEqual([])
  })

  it('filterValueLabel resolves ids to names and enums to words', () => {
    const s: TeamFilterState = { ...DEFAULT_TEAM_FILTER_STATE, tournament: ['t1'], ground: ['g1'], opponent: ['id:o1'], format: ['other'], innings: ['defending'], stage: ['knockout'], practice: true, year: ['2026'] }
    expect(filterValueLabel(s, 'tournament', options)).toBe('Thunder 5')
    expect(filterValueLabel(s, 'ground', options)).toBe('Mario Turner')
    expect(filterValueLabel(s, 'opponent', options)).toBe('Rising Phoenix CC')
    expect(filterValueLabel(s, 'format', options)).toBe('Other (T10/T25)')
    expect(filterValueLabel(s, 'innings', options)).toBe('Defending')
    expect(filterValueLabel(s, 'stage', options)).toBe('Knockout')
    expect(filterValueLabel(s, 'practice', options)).toBe('Practice included')
    expect(filterValueLabel(s, 'year', options)).toBe('2026')
  })

  it('labels the new filters from the option lists', () => {
    const s: TeamFilterState = { ...DEFAULT_TEAM_FILTER_STATE, captain: ['p1'], month: ['2026-09'], slot: ['07:30'], toss: ['won'] }
    expect(filterValueLabel(s, 'captain', options)).toBe('Muthu')
    expect(filterValueLabel(s, 'month', options)).toBe('Sep 2026')
    expect(filterValueLabel(s, 'slot', options)).toBe('7:30 AM')
    expect(filterValueLabel(s, 'toss', options)).toBe('Won the toss')
    expect(filterValueLabel({ ...s, toss: ['lost'] }, 'toss', options)).toBe('Lost the toss')
  })

  // Multi-select (added September 2026) — several checked values on one
  // dimension, both the "N selected" chip label and the comma-joined href.
  describe('multi-select', () => {
    it('shows the single value when only one is selected, else "first +N more"', () => {
      const one: TeamFilterState = { ...DEFAULT_TEAM_FILTER_STATE, tournament: ['t1'] }
      expect(filterValueLabel(one, 'tournament', options)).toBe('Thunder 5')
      const two: TeamFilterState = { ...DEFAULT_TEAM_FILTER_STATE, tournament: ['t1', 't2'] }
      expect(filterValueLabel(two, 'tournament', options)).toBe('Thunder 5 +1 more')
      const both: TeamFilterState = { ...DEFAULT_TEAM_FILTER_STATE, toss: ['won', 'lost'] }
      expect(filterValueLabel(both, 'toss', options)).toBe('Won the toss +1 more')
    })

    it('comma-joins several selected values into one query param', () => {
      const s: TeamFilterState = { ...DEFAULT_TEAM_FILTER_STATE, year: [currentTeamStatsYear()], tournament: ['t1', 't2'], captain: ['p1', 'p2'] }
      expect(buildTeamStatsHref(s)).toBe('/team-stats?tournament=t1%2Ct2&captain=p1%2Cp2')
    })

    it('parseCsvParam splits, trims and dedupes', () => {
      expect(parseCsvParam(undefined)).toEqual([])
      expect(parseCsvParam('')).toEqual([])
      expect(parseCsvParam('t1, t2 ,t1')).toEqual(['t1', 't2'])
    })
  })

  // Captain filter/split/then-by is restricted to captains, GC and admin —
  // see features/team-stats.md §3.6. A plain player must never see it as a
  // filter or split option.
  describe('visibleFilterKeys / visibleSplitDimensions — Captain dimension gating', () => {
    it('omits captain for a non-privileged viewer, keeps every other key/dimension', () => {
      expect(visibleFilterKeys(false)).toEqual(FILTER_KEYS.filter(k => k !== 'captain'))
      expect(visibleFilterKeys(false)).not.toContain('captain')
      expect(visibleSplitDimensions(false)).toEqual(SPLIT_DIMENSIONS.filter(d => d !== 'captain'))
      expect(visibleSplitDimensions(false)).not.toContain('captain')
    })

    it('includes captain for a captain/GC/admin viewer', () => {
      expect(visibleFilterKeys(true)).toEqual(FILTER_KEYS)
      expect(visibleFilterKeys(true)).toContain('captain')
      expect(visibleSplitDimensions(true)).toEqual(SPLIT_DIMENSIONS)
      expect(visibleSplitDimensions(true)).toContain('captain')
    })
  })

  describe('parseTeamFilterState', () => {
    it('defaults to the current season, no other filters, split by tournament', () => {
      const state = parseTeamFilterState(undefined, options, true)
      expect(state.year).toEqual([currentTeamStatsYear()])
      expect(state.tournament).toEqual([])
      expect(state.by).toBe('tournament')
      expect(state.then).toBeNull()
    })

    it('parses comma-separated multi-select params, dropping unknown ids/values', () => {
      const state = parseTeamFilterState({ tournament: 't1,t2,bogus', toss: 'won,lost,bogus', format: 'T20,other' }, options, true)
      expect(state.tournament).toEqual(['t1', 't2'])
      expect(state.toss).toEqual(['won', 'lost'])
      expect(state.format).toEqual(['T20', 'other'])
    })

    it('year=all means every year; an unrecognised year falls back to the current-season default', () => {
      expect(parseTeamFilterState({ year: 'all' }, options, true).year).toEqual([])
      expect(parseTeamFilterState({ year: '2025,2026' }, options, true).year).toEqual(['2025', '2026'])
      expect(parseTeamFilterState({ year: 'nonsense' }, options, true).year).toEqual([currentTeamStatsYear()])
    })

    it('re-validates captain against the server-side gate, not just the URL', () => {
      const state = parseTeamFilterState({ captain: 'p1,p2', by: 'captain', then: 'captain' }, options, false)
      expect(state.captain).toEqual([])
      expect(state.by).toBe('tournament')   // 'captain' isn't in the visible split list for this viewer
      expect(state.then).toBeNull()
    })

    it('a `then` equal to `by` collapses to null', () => {
      const state = parseTeamFilterState({ by: 'ground', then: 'ground' }, options, true)
      expect(state.then).toBeNull()
    })
  })
})
