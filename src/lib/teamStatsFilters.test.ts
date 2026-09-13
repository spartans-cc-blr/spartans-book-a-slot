import { describe, it, expect } from 'vitest'
import {
  DEFAULT_TEAM_FILTER_STATE, FILTER_KEYS, SPLIT_DIMENSIONS, activeFilterKeys, buildTeamStatsHref, clearAllFilters, clearFilter,
  currentTeamStatsYear, filterValueLabel, isFilterSet, toTeamFilters, visibleFilterKeys, visibleSplitDimensions,
  type TeamFilterState,
} from './teamStatsFilters'

const options = {
  years: ['2026', '2025'],
  tournaments: [{ id: 't1', name: 'Thunder 5' }],
  grounds: [{ id: 'g1', name: 'Mario Turner' }],
  opponents: [{ id: 'id:o1', name: 'Rising Phoenix CC' }],
  captains: [{ id: 'p1', name: 'Muthu' }],
  months: [{ id: '2026-09', name: 'Sep 2026' }],
  slots: [{ id: '07:30', name: '7:30 AM' }],
}

describe('teamStatsFilters', () => {
  // The page pre-filters to the current season by default (see
  // features/team-stats.md §3) — the bare-href sentinel for year is
  // therefore "whatever year it is today", not the 'all' sentinel every
  // other filter uses. 'all' (an explicit "All time" request) has to be
  // spelled out in the URL instead, or it would round-trip back into
  // "no year specified" → current year on the next load.
  it('the current-year state (the page default) maps to the bare /team-stats href', () => {
    const s: TeamFilterState = { ...DEFAULT_TEAM_FILTER_STATE, year: currentTeamStatsYear() }
    expect(buildTeamStatsHref(s)).toBe('/team-stats')
    expect(activeFilterKeys(s)).toEqual(['year'])
  })

  it('"all time" is spelled out explicitly, not omitted', () => {
    expect(buildTeamStatsHref(DEFAULT_TEAM_FILTER_STATE)).toBe('/team-stats?year=all')
    // 'all' is still the "no restriction" sentinel for chip/count purposes —
    // it just isn't the same thing as an unspecified URL year anymore.
    expect(activeFilterKeys(DEFAULT_TEAM_FILTER_STATE)).toEqual([])
  })

  it('encodes only non-default params, split dimension included', () => {
    // A non-current year (not just any year — see the two tests above for
    // why the current year specifically is the one that gets omitted).
    const s: TeamFilterState = { ...DEFAULT_TEAM_FILTER_STATE, year: '2025', format: 'T20', practice: true, by: 'ground' }
    expect(buildTeamStatsHref(s)).toBe('/team-stats?year=2025&format=T20&practice=1&by=ground')
    expect(activeFilterKeys(s)).toEqual(['year', 'format', 'practice'])
  })

  it('encodes the new toss / captain / month / slot filters', () => {
    // year pinned to the current-season default so only the filters under
    // test show up in the href — see the two tests above.
    const s: TeamFilterState = { ...DEFAULT_TEAM_FILTER_STATE, year: currentTeamStatsYear(), toss: 'won', captain: 'p1', month: '2026-09', slot: '07:30' }
    expect(buildTeamStatsHref(s)).toBe('/team-stats?month=2026-09&captain=p1&slot=07%3A30&toss=won')
    expect(activeFilterKeys(s)).toEqual(['year', 'month', 'captain', 'slot', 'toss'])
  })

  it('encodes a second-level split, and never one equal to the first', () => {
    const nested: TeamFilterState = { ...DEFAULT_TEAM_FILTER_STATE, year: currentTeamStatsYear(), by: 'captain', then: 'toss' }
    expect(buildTeamStatsHref(nested)).toBe('/team-stats?by=captain&then=toss')
    const sameBoth: TeamFilterState = { ...DEFAULT_TEAM_FILTER_STATE, year: currentTeamStatsYear(), by: 'captain', then: 'captain' }
    expect(buildTeamStatsHref(sameBoth)).toBe('/team-stats?by=captain')
  })

  it('clearFilter / clearAllFilters keep both split dimensions', () => {
    const s: TeamFilterState = { ...DEFAULT_TEAM_FILTER_STATE, tournament: 't1', practice: true, by: 'captain', then: 'toss' }
    expect(isFilterSet(s, 'tournament')).toBe(true)
    expect(clearFilter(s, 'tournament').tournament).toBe('all')
    expect(clearFilter(s, 'practice').practice).toBe(false)
    expect(clearAllFilters(s)).toEqual({ ...DEFAULT_TEAM_FILTER_STATE, by: 'captain', then: 'toss' })
  })

  it('toTeamFilters converts sentinels to nulls/numbers', () => {
    const s: TeamFilterState = { ...DEFAULT_TEAM_FILTER_STATE, year: '2025', opponent: 'id:o1', innings: 'chasing', captain: 'p1' }
    expect(toTeamFilters(s)).toEqual({
      year: 2025, month: null, format: 'all', tournamentId: null, groundId: null, opponentKey: 'id:o1',
      captainKey: 'p1', slotTime: null, innings: 'chasing', toss: 'all', stage: 'all', includePractice: false,
    })
    const bare = toTeamFilters(DEFAULT_TEAM_FILTER_STATE)
    expect(bare.year).toBeNull()
    expect(bare.month).toBeNull()
    expect(bare.captainKey).toBeNull()
    expect(bare.slotTime).toBeNull()
  })

  it('filterValueLabel resolves ids to names and enums to words', () => {
    const s: TeamFilterState = { ...DEFAULT_TEAM_FILTER_STATE, tournament: 't1', ground: 'g1', opponent: 'id:o1', format: 'other', innings: 'defending', stage: 'knockout', practice: true, year: '2026' }
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
    const s: TeamFilterState = { ...DEFAULT_TEAM_FILTER_STATE, captain: 'p1', month: '2026-09', slot: '07:30', toss: 'won' }
    expect(filterValueLabel(s, 'captain', options)).toBe('Muthu')
    expect(filterValueLabel(s, 'month', options)).toBe('Sep 2026')
    expect(filterValueLabel(s, 'slot', options)).toBe('7:30 AM')
    expect(filterValueLabel(s, 'toss', options)).toBe('Won the toss')
    expect(filterValueLabel({ ...s, toss: 'lost' }, 'toss', options)).toBe('Lost the toss')
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
})
