import { describe, it, expect } from 'vitest'
import {
  DEFAULT_TEAM_FILTER_STATE, activeFilterKeys, buildTeamStatsHref, clearAllFilters, clearFilter,
  filterValueLabel, isFilterSet, toTeamFilters, type TeamFilterState,
} from './teamStatsFilters'

const options = {
  years: ['2026', '2025'],
  tournaments: [{ id: 't1', name: 'Thunder 5' }],
  grounds: [{ id: 'g1', name: 'Mario Turner' }],
  opponents: [{ id: 'id:o1', name: 'Rising Phoenix CC' }],
}

describe('teamStatsFilters', () => {
  it('default state maps to the bare /team-stats href', () => {
    expect(buildTeamStatsHref(DEFAULT_TEAM_FILTER_STATE)).toBe('/team-stats')
    expect(activeFilterKeys(DEFAULT_TEAM_FILTER_STATE)).toEqual([])
  })

  it('encodes only non-default params, split dimension included', () => {
    const s: TeamFilterState = { ...DEFAULT_TEAM_FILTER_STATE, year: '2026', format: 'T20', practice: true, by: 'ground' }
    expect(buildTeamStatsHref(s)).toBe('/team-stats?year=2026&format=T20&practice=1&by=ground')
    expect(activeFilterKeys(s)).toEqual(['year', 'format', 'practice'])
  })

  it('clearFilter / clearAllFilters keep the split dimension', () => {
    const s: TeamFilterState = { ...DEFAULT_TEAM_FILTER_STATE, tournament: 't1', practice: true, by: 'toss' }
    expect(isFilterSet(s, 'tournament')).toBe(true)
    expect(clearFilter(s, 'tournament').tournament).toBe('all')
    expect(clearFilter(s, 'practice').practice).toBe(false)
    expect(clearAllFilters(s)).toEqual({ ...DEFAULT_TEAM_FILTER_STATE, by: 'toss' })
  })

  it('toTeamFilters converts sentinels to nulls/numbers', () => {
    const s: TeamFilterState = { ...DEFAULT_TEAM_FILTER_STATE, year: '2025', opponent: 'id:o1', innings: 'chasing' }
    expect(toTeamFilters(s)).toEqual({
      year: 2025, format: 'all', tournamentId: null, groundId: null, opponentKey: 'id:o1',
      innings: 'chasing', stage: 'all', includePractice: false,
    })
    expect(toTeamFilters(DEFAULT_TEAM_FILTER_STATE).year).toBeNull()
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
})
