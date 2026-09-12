// URL <-> filter-state helpers for /team-stats ("Team Record").
//
// Pure module, no React, no 'use client' — imported by both the Server
// Component (src/app/team-stats/page.tsx, to parse searchParams and build
// links) and the client filter shell (TeamFilterPanel.tsx, to stage a
// draft and push the applied URL). Keeping the URL shape in one place is
// what lets every Team Record view stay a shareable link (see
// features/team-stats.md §3) even though the filters are now edited in a
// panel rather than inline selects.
//
// Every dimension the page can split by is also filterable (§3.2), so a
// two-dimension question is answerable either way: filter one and split
// the other, or split one and "then by" the other.

import { monthLabel, slotLabel } from '@/lib/teamStatsCore'
import type { FormatFilter, InningsFilter, StageFilter, TossFilter, SplitDimension, TeamFilters } from '@/lib/teamStatsCore'

export interface TeamFilterState {
  year:       string        // 'all' | 'YYYY'
  month:      string        // 'all' | 'YYYY-MM'
  format:     FormatFilter
  tournament: string        // 'all' | id
  ground:     string        // 'all' | id
  opponent:   string        // 'all' | opponentKey
  captain:    string        // 'all' | captainKey
  slot:       string        // 'all' | 'HH:MM'
  innings:    InningsFilter
  toss:       TossFilter
  stage:      StageFilter
  practice:   boolean
  by:         SplitDimension
  then:       SplitDimension | null   // second-level split, null = none
}

export type FilterKey = Exclude<keyof TeamFilterState, 'by' | 'then'>

// Order the panel lists them in — broadest scope first, then the
// match-level slices.
export const FILTER_KEYS: FilterKey[] = [
  'year', 'month', 'tournament', 'ground', 'opponent', 'captain',
  'format', 'slot', 'innings', 'toss', 'stage', 'practice',
]

export const FILTER_LABEL: Record<FilterKey, string> = {
  year:       'Season',
  month:      'Month',
  tournament: 'Tournament',
  ground:     'Ground',
  opponent:   'Opponent',
  captain:    'Captain',
  format:     'Format',
  slot:       'Slot time',
  innings:    'Defending / Chasing',
  toss:       'Toss',
  stage:      'League / Knockout',
  practice:   'Practice games',
}

export const SPLIT_DIMENSIONS: SplitDimension[] = ['tournament', 'ground', 'opponent', 'format', 'stage', 'innings', 'toss', 'captain', 'year', 'month', 'slot']

export const DEFAULT_TEAM_FILTER_STATE: TeamFilterState = {
  year: 'all', month: 'all', format: 'all', tournament: 'all', ground: 'all',
  opponent: 'all', captain: 'all', slot: 'all', innings: 'all', toss: 'all',
  stage: 'all', practice: false, by: 'tournament', then: null,
}

export interface TeamFilterOptions {
  years:       string[]
  tournaments: { id: string; name: string }[]
  grounds:     { id: string; name: string }[]
  opponents:   { id: string; name: string }[]
  captains:    { id: string; name: string }[]
  months:      { id: string; name: string }[]
  slots:       { id: string; name: string }[]
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
  return { ...DEFAULT_TEAM_FILTER_STATE, by: state.by, then: state.then }
}

// The TeamFilters shape applyFilters() consumes.
export function toTeamFilters(state: TeamFilterState): TeamFilters {
  return {
    year: state.year === 'all' ? null : Number(state.year),
    month: state.month === 'all' ? null : state.month,
    format: state.format,
    tournamentId: state.tournament === 'all' ? null : state.tournament,
    groundId: state.ground === 'all' ? null : state.ground,
    opponentKey: state.opponent === 'all' ? null : state.opponent,
    captainKey: state.captain === 'all' ? null : state.captain,
    slotTime: state.slot === 'all' ? null : state.slot,
    innings: state.innings,
    toss: state.toss,
    stage: state.stage,
    includePractice: state.practice,
  }
}

// Canonical href for a state — defaults are omitted so the bare
// /team-stats URL is always the default view. A `then` equal to `by` is a
// no-op split (splitByNested ignores it), so it's never encoded.
export function buildTeamStatsHref(state: TeamFilterState): string {
  const params = new URLSearchParams()
  if (state.year !== 'all')       params.set('year', state.year)
  if (state.month !== 'all')      params.set('month', state.month)
  if (state.tournament !== 'all') params.set('tournament', state.tournament)
  if (state.ground !== 'all')     params.set('ground', state.ground)
  if (state.opponent !== 'all')   params.set('opponent', state.opponent)
  if (state.captain !== 'all')    params.set('captain', state.captain)
  if (state.format !== 'all')     params.set('format', state.format)
  if (state.slot !== 'all')       params.set('slot', state.slot)
  if (state.innings !== 'all')    params.set('innings', state.innings)
  if (state.toss !== 'all')       params.set('toss', state.toss)
  if (state.stage !== 'all')      params.set('stage', state.stage)
  if (state.practice)             params.set('practice', '1')
  if (state.by !== 'tournament')  params.set('by', state.by)
  if (state.then && state.then !== state.by) params.set('then', state.then)
  const qs = params.toString()
  return qs ? `/team-stats?${qs}` : '/team-stats'
}

export function filterValueLabel(state: TeamFilterState, key: FilterKey, options: TeamFilterOptions): string {
  const named = (list: { id: string; name: string }[], id: string) => list.find(o => o.id === id)?.name ?? id
  switch (key) {
    case 'year':       return state.year
    case 'month':      return named(options.months, state.month) || monthLabel(state.month)
    case 'tournament': return named(options.tournaments, state.tournament)
    case 'ground':     return named(options.grounds, state.ground)
    case 'opponent':   return named(options.opponents, state.opponent)
    case 'captain':    return named(options.captains, state.captain)
    case 'slot':       return named(options.slots, state.slot) || slotLabel(state.slot)
    case 'format':     return state.format === 'other' ? 'Other (T10/T25)' : state.format
    case 'innings':    return state.innings === 'defending' ? 'Defending' : 'Chasing'
    case 'toss':       return state.toss === 'won' ? 'Won the toss' : 'Lost the toss'
    case 'stage':      return state.stage === 'league' ? 'League' : 'Knockout'
    case 'practice':   return 'Practice included'
  }
}
