// URL <-> filter-state helpers for /team-stats ("Team Record").
//
// Pure module, no React, no 'use client' — imported by both the Server
// Component (src/app/team-stats/page.tsx, to parse searchParams and build
// links) and the client filter shell (TeamFilterPanel.tsx, to stage a
// draft and push the applied URL). Keeping the URL shape in one place is
// what lets every Team Record view stay a shareable link (see
// features/team-stats.md §3) even though the filters are now edited in a
// panel rather than inline selects.

import type { FormatFilter, InningsFilter, StageFilter, SplitDimension, TeamFilters } from '@/lib/teamStatsCore'

export interface TeamFilterState {
  year:       string        // 'all' | 'YYYY'
  format:     FormatFilter
  tournament: string        // 'all' | id
  ground:     string        // 'all' | id
  opponent:   string        // 'all' | opponentKey
  innings:    InningsFilter
  stage:      StageFilter
  practice:   boolean
  by:         SplitDimension
}

export type FilterKey = Exclude<keyof TeamFilterState, 'by'>

// Order the panel lists them in — broadest scope first.
export const FILTER_KEYS: FilterKey[] = ['year', 'tournament', 'ground', 'opponent', 'format', 'innings', 'stage', 'practice']

export const FILTER_LABEL: Record<FilterKey, string> = {
  year:       'Season',
  tournament: 'Tournament',
  ground:     'Ground',
  opponent:   'Opponent',
  format:     'Format',
  innings:    'Defending / Chasing',
  stage:      'League / Knockout',
  practice:   'Practice games',
}

export const SPLIT_DIMENSIONS: SplitDimension[] = ['tournament', 'ground', 'opponent', 'format', 'stage', 'innings', 'toss', 'captain', 'year', 'month', 'slot']

export const DEFAULT_TEAM_FILTER_STATE: TeamFilterState = {
  year: 'all', format: 'all', tournament: 'all', ground: 'all', opponent: 'all',
  innings: 'all', stage: 'all', practice: false, by: 'tournament',
}

export interface TeamFilterOptions {
  years:       string[]
  tournaments: { id: string; name: string }[]
  grounds:     { id: string; name: string }[]
  opponents:   { id: string; name: string }[]
}

export function isFilterSet(state: TeamFilterState, key: FilterKey): boolean {
  return key === 'practice' ? state.practice : state[key] !== 'all'
}

export function activeFilterKeys(state: TeamFilterState): FilterKey[] {
  return FILTER_KEYS.filter(k => isFilterSet(state, k))
}

export function clearFilter(state: TeamFilterState, key: FilterKey): TeamFilterState {
  return key === 'practice' ? { ...state, practice: false } : { ...state, [key]: 'all' }
}

export function clearAllFilters(state: TeamFilterState): TeamFilterState {
  return { ...DEFAULT_TEAM_FILTER_STATE, by: state.by }
}

// The TeamFilters shape applyFilters() consumes.
export function toTeamFilters(state: TeamFilterState): TeamFilters {
  return {
    year: state.year === 'all' ? null : Number(state.year),
    format: state.format,
    tournamentId: state.tournament === 'all' ? null : state.tournament,
    groundId: state.ground === 'all' ? null : state.ground,
    opponentKey: state.opponent === 'all' ? null : state.opponent,
    innings: state.innings,
    stage: state.stage,
    includePractice: state.practice,
  }
}

// Canonical href for a state — defaults are omitted so the bare
// /team-stats URL is always the default view.
export function buildTeamStatsHref(state: TeamFilterState): string {
  const params = new URLSearchParams()
  if (state.year !== 'all')       params.set('year', state.year)
  if (state.tournament !== 'all') params.set('tournament', state.tournament)
  if (state.ground !== 'all')     params.set('ground', state.ground)
  if (state.opponent !== 'all')   params.set('opponent', state.opponent)
  if (state.format !== 'all')     params.set('format', state.format)
  if (state.innings !== 'all')    params.set('innings', state.innings)
  if (state.stage !== 'all')      params.set('stage', state.stage)
  if (state.practice)             params.set('practice', '1')
  if (state.by !== 'tournament')  params.set('by', state.by)
  const qs = params.toString()
  return qs ? `/team-stats?${qs}` : '/team-stats'
}

export function filterValueLabel(state: TeamFilterState, key: FilterKey, options: TeamFilterOptions): string {
  switch (key) {
    case 'year':       return state.year
    case 'tournament': return options.tournaments.find(t => t.id === state.tournament)?.name ?? state.tournament
    case 'ground':     return options.grounds.find(g => g.id === state.ground)?.name ?? state.ground
    case 'opponent':   return options.opponents.find(o => o.id === state.opponent)?.name ?? state.opponent
    case 'format':     return state.format === 'other' ? 'Other (T10/T25)' : state.format
    case 'innings':    return state.innings === 'defending' ? 'Defending' : 'Chasing'
    case 'stage':      return state.stage === 'league' ? 'League' : 'Knockout'
    case 'practice':   return 'Practice included'
  }
}
