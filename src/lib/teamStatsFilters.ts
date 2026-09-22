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
//
// Multi-select (added September 2026, see features/team-stats.md §3.8):
// every filterable dimension holds a *list* of selected values rather than
// a single value — an empty array means "no restriction", the same thing
// the old 'all' sentinel meant. `year` is the one exception with a real
// default (see currentTeamStatsYear() below), so an explicit "All time"
// still has to be spelled out in the URL as `year=all` rather than an
// empty/omitted param, or it would round-trip back into "unspecified" →
// current year on the next load.

import { monthLabel, slotLabel } from '@/lib/teamStatsCore'
import type { FormatFilter, InningsFilter, StageFilter, TossFilter, PitchFilter, SplitDimension, TeamFilters } from '@/lib/teamStatsCore'

export interface TeamFilterState {
  year:       string[]       // years as plain 'YYYY' strings; [] = "all time"
  month:      string[]       // 'YYYY-MM'
  format:     FormatFilter[]
  tournament: string[]       // ids
  ground:     string[]       // ids
  pitch:      PitchFilter[]
  opponent:   string[]       // opponentKeys
  captain:    string[]       // captainKeys
  slot:       string[]       // 'HH:MM'
  innings:    InningsFilter[]
  toss:       TossFilter[]
  stage:      StageFilter[]
  practice:   boolean
  by:         SplitDimension
  then:       SplitDimension | null   // second-level split, null = none
}

export type FilterKey = Exclude<keyof TeamFilterState, 'by' | 'then'>

// Order the panel lists them in — broadest scope first, then the
// match-level slices.
export const FILTER_KEYS: FilterKey[] = [
  'year', 'month', 'tournament', 'ground', 'pitch', 'opponent', 'captain',
  'format', 'slot', 'innings', 'toss', 'stage', 'practice',
]

export const FILTER_LABEL: Record<FilterKey, string> = {
  year:       'Season',
  month:      'Month',
  tournament: 'Tournament',
  ground:     'Ground',
  pitch:      'Pitch Type',
  opponent:   'Opponent',
  captain:    'Captain',
  format:     'Format',
  slot:       'Slot time',
  innings:    'Defending / Chasing',
  toss:       'Toss',
  stage:      'League / Knockout',
  practice:   'Practice games',
}

export const SPLIT_DIMENSIONS: SplitDimension[] = ['tournament', 'ground', 'pitch', 'opponent', 'format', 'stage', 'innings', 'toss', 'captain', 'year', 'month', 'slot']

// The Captain dimension (filter, split, and "then by") is restricted to
// captains, GC and admin — see features/team-stats.md §3.6. Comparing
// captains' win rates against each other is exactly the kind of thing that
// can stir up drama in the player community if it's open to everyone, so
// this isn't offered as a filter/split option at all for a plain player.
// `visibleFilterKeys()`/`visibleSplitDimensions()` are the single place
// that decides this — both the Server Component (page.tsx, which also
// re-validates any `captain`/`by=captain`/`then=captain` URL param against
// the same gate, since a hidden option is not the same as a blocked one)
// and the client filter panel call these instead of the raw
// FILTER_KEYS/SPLIT_DIMENSIONS constants, so the two can never disagree on
// who gets to see it.
export function visibleFilterKeys(canUseCaptainDimension: boolean): FilterKey[] {
  return canUseCaptainDimension ? FILTER_KEYS : FILTER_KEYS.filter(k => k !== 'captain')
}

export function visibleSplitDimensions(canUseCaptainDimension: boolean): SplitDimension[] {
  return canUseCaptainDimension ? SPLIT_DIMENSIONS : SPLIT_DIMENSIONS.filter(d => d !== 'captain')
}

export const DEFAULT_TEAM_FILTER_STATE: TeamFilterState = {
  year: [], month: [], format: [], tournament: [], ground: [],
  pitch: [], opponent: [], captain: [], slot: [], innings: [], toss: [],
  stage: [], practice: false, by: 'tournament', then: null,
}

// The page's own default season — resolved fresh on every call (not a
// module-level constant) since it's a genuine "today" concept, not a
// build-time one. Both the Server Component (§3, resolving a bare or
// invalid `?year=` to this) and buildTeamStatsHref (deciding whether a
// state's year is the implicit default or needs to be spelled out in the
// URL) call this same function, so they can never disagree on what "the
// default season" currently means.
export function currentTeamStatsYear(): string {
  return String(new Date().getFullYear())
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
  return key === 'practice' ? state.practice : state[key].length > 0
}

export function activeFilterKeys(state: TeamFilterState): FilterKey[] {
  return FILTER_KEYS.filter(k => isFilterSet(state, k))
}

export function clearFilter(state: TeamFilterState, key: FilterKey): TeamFilterState {
  return key === 'practice' ? { ...state, practice: false } : { ...state, [key]: [] }
}

export function clearAllFilters(state: TeamFilterState): TeamFilterState {
  return { ...DEFAULT_TEAM_FILTER_STATE, by: state.by, then: state.then }
}

// The TeamFilters shape applyFilters() consumes.
export function toTeamFilters(state: TeamFilterState): TeamFilters {
  return {
    year: state.year.map(Number),
    month: state.month,
    format: state.format,
    tournamentId: state.tournament,
    groundId: state.ground,
    pitch: state.pitch,
    opponentKey: state.opponent,
    captainKey: state.captain,
    slotTime: state.slot,
    innings: state.innings,
    toss: state.toss,
    stage: state.stage,
    includePractice: state.practice,
  }
}

// Canonical href for a state — defaults are omitted so the bare
// /team-stats URL is always the default view. A `then` equal to `by` is a
// no-op split (splitByNested ignores it), so it's never encoded. Every
// multi-value filter is comma-joined into a single query param, e.g.
// `?tournament=t1,t2`.
//
// Year is the one filter whose "default" isn't a fixed sentinel — the page
// pre-filters to the current season (§3), so the bare URL's implicit year
// is whatever currentTeamStatsYear() returns *today*, not "no restriction".
// A single-value selection of exactly that year is therefore the one thing
// omitted from the URL; an empty selection (an explicit "All time" request)
// is spelled out as `year=all` rather than omitted, so it round-trips
// correctly instead of being reinterpreted as "no year specified" (→
// current year) on the next load. Any other year selection (a different
// single year, or more than one) is comma-joined as usual.
export function buildTeamStatsHref(state: TeamFilterState): string {
  const params = new URLSearchParams()
  if (!(state.year.length === 1 && state.year[0] === currentTeamStatsYear())) {
    params.set('year', state.year.length === 0 ? 'all' : state.year.join(','))
  }
  const setList = (key: string, values: string[]) => { if (values.length > 0) params.set(key, values.join(',')) }
  setList('month', state.month)
  setList('tournament', state.tournament)
  setList('ground', state.ground)
  setList('pitch', state.pitch)
  setList('opponent', state.opponent)
  setList('captain', state.captain)
  setList('format', state.format)
  setList('slot', state.slot)
  setList('innings', state.innings)
  setList('toss', state.toss)
  setList('stage', state.stage)
  if (state.practice)             params.set('practice', '1')
  if (state.by !== 'tournament')  params.set('by', state.by)
  if (state.then && state.then !== state.by) params.set('then', state.then)
  const qs = params.toString()
  return qs ? `/team-stats?${qs}` : '/team-stats'
}

function singleValueLabel(key: FilterKey, value: string, options: TeamFilterOptions): string {
  const named = (list: { id: string; name: string }[], id: string) => list.find(o => o.id === id)?.name ?? id
  switch (key) {
    case 'year':       return value
    case 'month':      return named(options.months, value) || monthLabel(value)
    case 'tournament': return named(options.tournaments, value)
    case 'ground':     return named(options.grounds, value)
    case 'pitch':      return value
    case 'opponent':   return named(options.opponents, value)
    case 'captain':    return named(options.captains, value)
    case 'slot':       return named(options.slots, value) || slotLabel(value)
    case 'format':     return value === 'other' ? 'Other (T10/T25)' : value
    case 'innings':    return value === 'defending' ? 'Defending' : 'Chasing'
    case 'toss':       return value === 'won' ? 'Won the toss' : 'Lost the toss'
    case 'stage':      return value === 'league' ? 'League' : 'Knockout'
    case 'practice':   return 'Practice included'
  }
}

// One chip's worth of text for a (possibly multi-valued) filter — the
// single value's own label when only one is selected, else the first
// value's label plus a "+N more" count so the summary row's chips stay a
// fixed, glanceable width regardless of how many values are checked.
export function filterValueLabel(state: TeamFilterState, key: FilterKey, options: TeamFilterOptions): string {
  if (key === 'practice') return 'Practice included'
  const values = state[key]
  if (values.length === 0) return ''
  const names = values.map(v => singleValueLabel(key, v, options))
  return names.length === 1 ? names[0] : `${names[0]} +${names.length - 1} more`
}

// ── URL parsing ────────────────────────────────────────────────────────────

// A raw query-param value, comma-separated, deduped, whitespace-trimmed.
// `?tournament=t1,t2,t1` -> ['t1', 't2'].
export function parseCsvParam(raw: string | undefined): string[] {
  if (!raw) return []
  return Array.from(new Set(raw.split(',').map(s => s.trim()).filter(Boolean)))
}

function pickEnum<T extends string>(v: string | undefined, allowed: readonly T[], fallback: T): T {
  return (allowed as readonly string[]).includes(v ?? '') ? (v as T) : fallback
}

const FORMAT_VALUES: readonly FormatFilter[] = ['T20', 'T30', 'other']
const PITCH_VALUES: readonly PitchFilter[] = ['Matted', 'Astro', 'Turf']
const INNINGS_VALUES: readonly InningsFilter[] = ['defending', 'chasing']
const TOSS_VALUES: readonly TossFilter[] = ['won', 'lost']
const STAGE_VALUES: readonly StageFilter[] = ['league', 'knockout']

// Every raw query-param value this page understands, keyed the same way the
// URL spells them — a plain object rather than Next's searchParams type so
// this stays testable with no framework dependency.
export type TeamStatsRawSearchParams = Partial<Record<
  'year' | 'month' | 'format' | 'tournament' | 'ground' | 'pitch' | 'opponent' | 'captain' | 'slot'
  | 'innings' | 'toss' | 'stage' | 'practice' | 'by' | 'then', string>>

// The single place that turns a URL's searchParams into a validated
// TeamFilterState — used by the Server Component so the parsing logic is
// unit-testable independent of Next's request machinery. Every id-based
// value is checked against the actual option list; every enum value is
// checked against its fixed allowed set. Anything invalid/unknown is
// silently dropped rather than falling back to "all time" wholesale, same
// forgiving posture the single-select version had.
export function parseTeamFilterState(
  searchParams: TeamStatsRawSearchParams | undefined,
  options: TeamFilterOptions,
  canUseCaptainDimension: boolean,
): TeamFilterState {
  const sp = searchParams ?? {}
  const splitDimensions = visibleSplitDimensions(canUseCaptainDimension)

  const idList = (raw: string | undefined, valid: Set<string>) => parseCsvParam(raw).filter(v => valid.has(v))
  const enumList = <T extends string>(raw: string | undefined, allowed: readonly T[]) =>
    parseCsvParam(raw).filter((v): v is T => (allowed as readonly string[]).includes(v))

  const yearValid = new Set(options.years)
  const year =
    sp.year === 'all' ? []
    : sp.year ? (() => { const v = idList(sp.year, yearValid); return v.length > 0 ? v : [currentTeamStatsYear()] })()
    : [currentTeamStatsYear()]

  const by = pickEnum<SplitDimension>(sp.by, splitDimensions, 'tournament')
  // A `then` equal to `by` is a no-op (splitByNested ignores it) — treated
  // as "none" here so it never round-trips back into the URL either.
  const thenCandidates = enumList<SplitDimension>(sp.then, splitDimensions)
  const thenVal = thenCandidates.length > 0 ? thenCandidates[0] : null

  return {
    year,
    month:      idList(sp.month, new Set(options.months.map(m => m.id))),
    format:     enumList<FormatFilter>(sp.format, FORMAT_VALUES),
    tournament: idList(sp.tournament, new Set(options.tournaments.map(t => t.id))),
    ground:     idList(sp.ground, new Set(options.grounds.map(g => g.id))),
    pitch:      enumList<PitchFilter>(sp.pitch, PITCH_VALUES),
    opponent:   idList(sp.opponent, new Set(options.opponents.map(o => o.id))),
    // Re-validated against the same server-side gate as `by`/`then` above —
    // a non-privileged viewer's `?captain=` is ignored, not just hidden
    // from the panel.
    captain:    canUseCaptainDimension ? idList(sp.captain, new Set(options.captains.map(c => c.id))) : [],
    slot:       idList(sp.slot, new Set(options.slots.map(s => s.id))),
    innings:    enumList<InningsFilter>(sp.innings, INNINGS_VALUES),
    toss:       enumList<TossFilter>(sp.toss, TOSS_VALUES),
    stage:      enumList<StageFilter>(sp.stage, STAGE_VALUES),
    practice:   sp.practice === '1',
    by,
    then: thenVal === by ? null : thenVal,
  }
}
