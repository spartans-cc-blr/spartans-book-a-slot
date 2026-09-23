// Pure, client-safe half of the team-stats layer — types, filters and
// aggregators only. NO server imports: this file is imported by the
// 'use client' components under src/components/team/ (TeamFilterPanel,
// TeamSplitTable), and anything reachable from a client component ends up
// in the browser bundle. The fetch (getTeamMatches) lives in teamStats.ts,
// which imports server-only modules (service-role Supabase, the analytics
// client, and via those, web-push) and must never be imported client-side
// — a `next build` fails with "Can't resolve 'net'" if it is.
//
// Everything here is unit-tested in teamStats.test.ts.

import { normaliseOpponentName } from '@/lib/opponents'
import { isInformalFormat } from '@/types'
import type { StageType, PitchType } from '@/types'

export type MatchResult = 'won' | 'lost' | 'tied' | 'nr'

export interface TeamMatch {
  bookingId:      string
  matchId:        string
  gameDate:       string        // YYYY-MM-DD
  slotTime:       string
  format:         string | null
  result:         MatchResult | null
  teamTotal:      number | null
  teamWickets:    number | null
  teamOvers:      number | null
  oppTotal:       number | null
  oppWickets:     number | null
  oppOvers:       number | null
  // Raw spelling as booked (falls back to the scorecard's own spelling)
  opponentName:   string
  // Canonical opponent, once reconciled — see src/lib/opponents.ts
  opponentId:     string | null
  opponentLabel:  string        // canonical name if resolved, else raw
  isMarquee:      boolean
  tournamentId:   string | null
  tournamentName: string | null
  // tournaments.total_league_games — feeds the Ongoing/Completed split on
  // the Tournament dimension (see splitTournamentRowsByStatus() below).
  // null when the admin hasn't set a target for this tournament.
  tournamentTotalLeagueGames: number | null
  isPractice:     boolean
  groundId:       string | null
  groundName:     string | null
  // tournaments.pitch_type (migration 079) — Matted / Astro / Turf, or null
  // when the tournament hasn't been classified yet. Tournament-level, not
  // ground-level: a ground's physical surface can change over time, but a
  // tournament runs on one surface for its whole duration — see
  // features/team-stats.md §6.
  pitchType:      PitchType | null
  stageType:      StageType | null
  matchStage:     string | null
  // From the analytics DB's match_stats.toss_won/toss_decision (100%
  // coverage on every synced match at the time of writing). battedFirst is
  // the same derivation deriveBattedFirst() in playerStats.ts uses.
  tossWon:        boolean | null
  tossDecision:   'bat' | 'field' | null
  battedFirst:    boolean | null
  // Match captain from the squad table's is_captain row (the match-specific
  // designation, not players.is_captain — see features/squad-selection.md §3)
  captainId:      string | null
  captainName:    string | null
}

export function normaliseResult(raw: string | null | undefined): MatchResult | null {
  if (!raw) return null
  const s = raw.toLowerCase().trim()
  if (s.startsWith('won') || s === 'w') return 'won'
  if (s.startsWith('lost') || s === 'l') return 'lost'
  if (s.startsWith('tie')) return 'tied'
  if (s === 'nr' || s.includes('no result') || s.includes('abandon')) return 'nr'
  return null
}

// ── Filters ────────────────────────────────────────────────────────────────

// A dimension's single-value type — no 'all' member any more. Multi-select
// (added September 2026, see features/team-stats.md §3) represents "no
// restriction on this dimension" as an empty array rather than a sentinel
// string, so every one of these is now the *element* type of a filter
// array, not a value that can itself mean "everything".
export type FormatFilter = 'T20' | 'T30' | 'other'
export type InningsFilter = 'defending' | 'chasing'
export type StageFilter = 'league' | 'knockout'
export type TossFilter = 'won' | 'lost'
export type PitchFilter = PitchType

// Every dimension the page can split by is also filterable (added
// September 2026, see features/team-stats.md §3.2) — that's what makes a
// two-dimension question like "how does each captain do after winning the
// toss" answerable: filter on one, split by the other. Every field here is
// now a multi-select array — an empty (or absent) array means "no
// restriction on this dimension", matching an unchecked checkbox list.
export interface TeamFilters {
  year?:           number[]     // empty/undefined = all time
  month?:          string[]     // 'YYYY-MM'
  format?:         FormatFilter[]
  tournamentId?:   string[]
  groundId?:       string[]
  pitch?:          PitchFilter[]
  opponentKey?:    string[]     // opponentKey() values
  captainKey?:     string[]     // captainKey() values
  slotTime?:       string[]     // 'HH:MM'
  innings?:        InningsFilter[]
  toss?:           TossFilter[]
  stage?:          StageFilter[]
  includePractice?: boolean
}

// Canonical grouping key for an opponent: the master id once reconciled,
// else the normalised raw spelling — so two bookings typed identically
// still group together even before anyone reconciles them.
export function opponentKey(m: Pick<TeamMatch, 'opponentId' | 'opponentName'>): string {
  return m.opponentId ? `id:${m.opponentId}` : `name:${normaliseOpponentName(m.opponentName)}`
}

// Same idea for the match captain: the squad row's player id, or a single
// 'unknown' bucket for a booking whose captain was never recorded (worth
// surfacing rather than hiding — it's a data gap a wrangler can fix).
export function captainKey(m: Pick<TeamMatch, 'captainId'>): string {
  return m.captainId ?? 'unknown'
}

export function effectiveStage(m: Pick<TeamMatch, 'stageType'>): StageType {
  return m.stageType === 'knockout' ? 'knockout' : 'league'
}

export function applyFilters(matches: TeamMatch[], f: TeamFilters): TeamMatch[] {
  return matches.filter(m => {
    if (!f.includePractice && m.isPractice) return false
    if (f.year && f.year.length > 0 && !f.year.some(y => m.gameDate.startsWith(`${y}-`))) return false
    if (f.format && f.format.length > 0) {
      const hit = f.format.some(v => v === 'other' ? isInformalFormat(m.format) : m.format === v)
      if (!hit) return false
    }
    if (f.tournamentId && f.tournamentId.length > 0 && !(m.tournamentId && f.tournamentId.includes(m.tournamentId))) return false
    if (f.groundId && f.groundId.length > 0 && !(m.groundId && f.groundId.includes(m.groundId))) return false
    if (f.pitch && f.pitch.length > 0 && !(m.pitchType && f.pitch.includes(m.pitchType))) return false
    if (f.opponentKey && f.opponentKey.length > 0 && !f.opponentKey.includes(opponentKey(m))) return false
    if (f.month && f.month.length > 0 && !f.month.includes(m.gameDate.slice(0, 7))) return false
    if (f.captainKey && f.captainKey.length > 0 && !f.captainKey.includes(captainKey(m))) return false
    if (f.slotTime && f.slotTime.length > 0 && !f.slotTime.includes(m.slotTime)) return false
    if (f.innings && f.innings.length > 0) {
      const val: InningsFilter | null = m.battedFirst === null ? null : m.battedFirst ? 'defending' : 'chasing'
      if (!val || !f.innings.includes(val)) return false
    }
    // A match with no toss data can't satisfy either side of a toss
    // filter, so it drops out entirely — same as the toss *split*, which
    // gives it no group to sit in.
    if (f.toss && f.toss.length > 0) {
      const val: TossFilter | null = m.tossWon === null ? null : m.tossWon ? 'won' : 'lost'
      if (!val || !f.toss.includes(val)) return false
    }
    if (f.stage && f.stage.length > 0 && !f.stage.includes(effectiveStage(m))) return false
    return true
  })
}

// ── Aggregation ────────────────────────────────────────────────────────────

export interface Summary {
  played:  number
  won:     number
  lost:    number
  tied:    number
  nr:      number
  // won / (won + lost + tied) — no-results excluded, the usual cricket
  // convention. null when nothing has been decided yet.
  winPct:  number | null
}

export function summarize(matches: TeamMatch[]): Summary {
  let won = 0, lost = 0, tied = 0, nr = 0
  for (const m of matches) {
    if (m.result === 'won') won++
    else if (m.result === 'lost') lost++
    else if (m.result === 'tied') tied++
    else nr++
  }
  const decided = won + lost + tied
  return {
    played: matches.length, won, lost, tied, nr,
    winPct: decided === 0 ? null : Math.round((won / decided) * 1000) / 10,
  }
}

export type FormLetter = 'W' | 'L' | 'T' | 'NR'

function resultLetter(r: MatchResult | null): FormLetter {
  return r === 'won' ? 'W' : r === 'lost' ? 'L' : r === 'tied' ? 'T' : 'NR'
}

// Most-recent-first list of the last `n` results (input may be in any
// order — sorted here so callers don't have to care).
export function recentForm(matches: TeamMatch[], n = 5): FormLetter[] {
  return sortNewestFirst(matches).slice(0, n).map(m => resultLetter(m.result))
}

// Current unbroken run of the same decided result, newest-first, e.g.
// { letter: 'W', length: 3 }. No-results are skipped over (they neither
// extend nor break a streak). null when there's no decided match yet.
export function currentStreak(matches: TeamMatch[]): { letter: 'W' | 'L' | 'T'; length: number } | null {
  let letter: 'W' | 'L' | 'T' | null = null
  let length = 0
  for (const m of sortNewestFirst(matches)) {
    const l = resultLetter(m.result)
    if (l === 'NR') continue
    if (letter === null) { letter = l; length = 1; continue }
    if (l === letter) length++
    else break
  }
  return letter === null ? null : { letter, length }
}

export function sortNewestFirst(matches: TeamMatch[]): TeamMatch[] {
  return [...matches].sort((a, b) =>
    b.gameDate.localeCompare(a.gameDate) || b.slotTime.localeCompare(a.slotTime))
}

// One row per distinct group — the shape TeamSplitTable renders.
export interface SplitRow extends Summary {
  key:      string
  label:    string
  // Extra context per dimension (e.g. a marquee flag, a canonical id)
  meta?:    Record<string, string | boolean | null>
  form:     FormLetter[]
  lastPlayed: string | null      // YYYY-MM-DD of the most recent match
  matches:  TeamMatch[]          // newest first
  // Second-level breakdown, when a "then by" dimension is chosen —
  // splitByNested() below. Absent for a plain single-level split.
  sub?:     SplitRow[]
}

export type SplitDimension =
  | 'tournament' | 'ground' | 'pitch' | 'opponent' | 'format' | 'stage'
  | 'innings' | 'toss' | 'year' | 'month' | 'captain' | 'slot'

export const SPLIT_LABEL: Record<SplitDimension, string> = {
  tournament: 'Tournament',
  ground:     'Ground',
  pitch:      'Pitch Type',
  opponent:   'Opponent',
  format:     'Format',
  stage:      'League / Knockout',
  innings:    'Defending / Chasing',
  toss:       'Toss',
  year:       'Year',
  month:      'Month',
  captain:    'Captain',
  slot:       'Slot Time',
}

export function monthLabel(ym: string): string {
  const [y, mo] = ym.split('-').map(Number)
  return new Date(Date.UTC(y, mo - 1, 1)).toLocaleDateString('en-IN', { month: 'short', year: 'numeric', timeZone: 'UTC' })
}

export function slotLabel(t: string): string {
  const [h, m] = t.split(':').map(Number)
  const period = h >= 12 ? 'PM' : 'AM'
  const h12 = h % 12 === 0 ? 12 : h % 12
  return `${h12}:${String(m).padStart(2, '0')} ${period}`
}

// A match belongs to zero groups (e.g. no toss/innings data) or exactly
// one — every dimension, including `toss`, is mutually exclusive.
function groupsFor(m: TeamMatch, dim: SplitDimension): { key: string; label: string; meta?: SplitRow['meta'] }[] {
  switch (dim) {
    case 'tournament':
      return [{ key: m.tournamentId ?? 'none', label: m.tournamentName ?? 'No tournament' }]
    case 'ground':
      return [{ key: m.groundId ?? `name:${m.groundName ?? 'unknown'}`, label: m.groundName ?? 'Unknown ground' }]
    case 'pitch':
      // A real, first-class group rather than an empty return (unlike toss/
      // innings' "no data" case) — most tournaments have no pitch_type set
      // yet at the time this dimension shipped, and that's worth surfacing
      // as its own "Not set" bucket so it's visible, not silently dropped.
      return [{ key: m.pitchType ?? 'unset', label: m.pitchType ?? 'Not set' }]
    case 'opponent':
      return [{ key: opponentKey(m), label: m.opponentLabel, meta: { opponentId: m.opponentId, isMarquee: m.isMarquee, reconciled: !!m.opponentId } }]
    case 'format':
      return [{ key: m.format ?? 'unknown', label: m.format ?? 'Unknown' }]
    case 'stage':
      return [{ key: effectiveStage(m), label: effectiveStage(m) === 'knockout' ? 'Knockout' : 'League' }]
    case 'innings':
      if (m.battedFirst === null) return []
      return m.battedFirst
        ? [{ key: 'defending', label: 'Batted first (defending)' }]
        : [{ key: 'chasing',   label: 'Batted second (chasing)' }]
    case 'toss': {
      // Standardised to the four real, mutually-exclusive outcomes a toss
      // can produce — won/lost crossed with batted/fielded first — instead
      // of the old "won the toss" / "lost the toss" / "chose to bat" /
      // "chose to field" scheme, which put a toss-winning match in two
      // buckets at once (its outcome bucket AND its decision bucket) with
      // nothing on screen showing they were the same match. See
      // features/team-stats.md §2.
      if (m.tossWon === null || m.battedFirst === null) return []
      const key = `toss-${m.tossWon ? 'won' : 'lost'}-${m.battedFirst ? 'bat' : 'field'}`
      const label = `${m.tossWon ? 'Won' : 'Lost'} the toss & ${m.battedFirst ? 'batted' : 'fielded'} first`
      return [{ key, label }]
    }
    case 'year':
      return [{ key: m.gameDate.slice(0, 4), label: m.gameDate.slice(0, 4) }]
    case 'month':
      return [{ key: m.gameDate.slice(0, 7), label: monthLabel(m.gameDate.slice(0, 7)) }]
    case 'captain':
      return [{ key: captainKey(m), label: m.captainName ?? 'Captain not recorded', meta: { playerId: m.captainId } }]
    case 'slot':
      return [{ key: m.slotTime, label: slotLabel(m.slotTime) }]
  }
}

export function splitBy(matches: TeamMatch[], dim: SplitDimension): SplitRow[] {
  const groups = new Map<string, { label: string; meta?: SplitRow['meta']; matches: TeamMatch[] }>()
  for (const m of matches) {
    for (const g of groupsFor(m, dim)) {
      const existing = groups.get(g.key)
      if (existing) existing.matches.push(m)
      else groups.set(g.key, { label: g.label, meta: g.meta, matches: [m] })
    }
  }
  const rows: SplitRow[] = []
  // Array.from — downlevelIteration isn't enabled in tsconfig (see gc-players.md)
  for (const [key, g] of Array.from(groups.entries())) {
    const sorted = sortNewestFirst(g.matches)
    rows.push({
      key, label: g.label, meta: g.meta,
      ...summarize(sorted),
      form: recentForm(sorted, 5),
      lastPlayed: sorted[0]?.gameDate ?? null,
      matches: sorted,
    })
  }
  // Chronological/fixed-sequence dimensions keep their own natural order
  // (a season reads newest-first, a toss outcome reads
  // won-bat, won-field, lost-bat, lost-field — TOSS_ORDER); everything
  // else ranks by Win % descending — the number this whole page exists to
  // answer — with
  // Played descending, then alphabetical, as tie-breaks. Opponents are the
  // exception: always alphabetical by team name, since the Opponent split
  // is read as a head-to-head directory (marquee rivals get their own table
  // via splitOpponentRowsByMarquee() below, not a pin at the top).
  rows.sort((a, b) => {
    if (dim === 'opponent') return compareLabels(a.label, b.label)
    if (dim === 'year' || dim === 'month') return b.key.localeCompare(a.key)
    if (dim === 'slot') return a.key.localeCompare(b.key)
    if (dim === 'toss') return TOSS_ORDER.indexOf(a.key) - TOSS_ORDER.indexOf(b.key)
    // A group with nothing decided yet (winPct === null) has no rank to
    // offer — sorts last, not first, so it never outranks a real number.
    const aw = a.winPct ?? -1, bw = b.winPct ?? -1
    if (aw !== bw) return bw - aw
    return (b.played - a.played) || a.label.localeCompare(b.label)
  })
  return rows
}
const TOSS_ORDER = ['toss-won-bat', 'toss-won-field', 'toss-lost-bat', 'toss-lost-field']

// Two-dimension split: group by `dim`, then group each group's own matches
// by `then` — e.g. captain, then toss. Deliberately capped at two levels:
// three-deep nesting stops being readable in one table, and the filters
// cover any further narrowing (features/team-stats.md §3.2).
//
// `then` equal to `dim`, or absent, gives a plain single-level split, so a
// caller can pass whatever the URL says without checking first.
//
// Every dimension's groups are mutually exclusive (see groupsFor() above),
// so a sub-split's rows always sum back to exactly their parent's P — a
// match with no data for the second dimension (e.g. no toss data) is
// simply absent from every sub-row instead of double-counted anywhere.
export function splitByNested(matches: TeamMatch[], dim: SplitDimension, then?: SplitDimension | null): SplitRow[] {
  const rows = splitBy(matches, dim)
  if (!then || then === dim) return rows
  return rows.map(r => ({ ...r, sub: splitBy(r.matches, then) }))
}

// Ongoing vs Completed partition for the Tournament split only (added
// September 2026, see features/team-stats.md §3.7). Every match behind a
// Team Record row has already been played (getTeamMatches() only ever
// includes synced scorecards), so "completed" here means the *tournament*
// has nothing left to play, not that any individual match is unresolved.
//
// Proxy: a tournament counts as Completed once this row's `played` count
// (every synced match for that tournament, league or knockout) has
// reached its admin-set `total_league_games` target. A tournament with no
// target set (null) can never be proven complete this way, so it's always
// Ongoing — the same "can't confirm complete, so don't claim it" posture
// Tournament Planner takes for its own isCompleted check. Every row in a
// group shares one tournamentId, so any match in it carries the same
// target — reading it off the first is enough.
export function splitTournamentRowsByStatus(rows: SplitRow[]): { ongoing: SplitRow[]; completed: SplitRow[] } {
  const ongoing: SplitRow[] = []
  const completed: SplitRow[] = []
  for (const r of rows) {
    const target = r.matches[0]?.tournamentTotalLeagueGames ?? null
    ;(target !== null && r.played >= target ? completed : ongoing).push(r)
  }
  return { ongoing, completed }
}

// Opponent split only — partitions rows into the marquee rivals (their own
// table on /team-stats) and everyone else, so no opponent appears in both.
// Each half is alphabetical by team name (features/team-stats.md §3.3).
export function splitOpponentRowsByMarquee(rows: SplitRow[]): { marquee: SplitRow[]; others: SplitRow[] } {
  const byName = (a: SplitRow, b: SplitRow) => compareLabels(a.label, b.label)
  return {
    marquee: rows.filter(r => r.meta?.isMarquee).sort(byName),
    others:  rows.filter(r => !r.meta?.isMarquee).sort(byName),
  }
}

function compareLabels(a: string, b: string): number {
  return a.localeCompare(b, undefined, { sensitivity: 'base' })
}

// ── Records ────────────────────────────────────────────────────────────────

export interface RecordEntry {
  title:   string
  value:   string                // e.g. "212/6 (30 ov)"
  match:   TeamMatch
}

export function scoreString(total: number | null, wickets: number | null, overs: number | null): string {
  if (total === null) return '—'
  const w = wickets === null ? '' : `/${wickets}`
  const o = overs === null ? '' : ` (${overs} ov)`
  return `${total}${w}${o}`
}

// Margin of victory, in the conventional cricket sense: runs when we
// defended, wickets when we chased. null when it can't be derived (no
// toss data, no totals, or not a win).
export function winMargin(m: TeamMatch): { kind: 'runs' | 'wickets'; value: number } | null {
  if (m.result !== 'won' || m.battedFirst === null) return null
  if (m.battedFirst) {
    if (m.teamTotal === null || m.oppTotal === null) return null
    return { kind: 'runs', value: m.teamTotal - m.oppTotal }
  }
  if (m.teamWickets === null) return null
  return { kind: 'wickets', value: 10 - m.teamWickets }
}

function pick(matches: TeamMatch[], pred: (m: TeamMatch) => boolean, score: (m: TeamMatch) => number, best: 'max' | 'min'): TeamMatch | null {
  let chosen: TeamMatch | null = null
  let chosenScore = 0
  for (const m of matches) {
    if (!pred(m)) continue
    const s = score(m)
    if (chosen === null || (best === 'max' ? s > chosenScore : s < chosenScore)) { chosen = m; chosenScore = s }
  }
  return chosen
}

export function computeRecords(matches: TeamMatch[]): RecordEntry[] {
  const scored = matches.filter(m => m.teamTotal !== null && m.result !== 'nr')
  const out: RecordEntry[] = []
  const add = (title: string, m: TeamMatch | null, value: (m: TeamMatch) => string) => {
    if (m) out.push({ title, value: value(m), match: m })
  }
  const ours = (m: TeamMatch) => scoreString(m.teamTotal, m.teamWickets, m.teamOvers)
  const theirs = (m: TeamMatch) => scoreString(m.oppTotal, m.oppWickets, m.oppOvers)

  add('Highest team total', pick(scored, () => true, m => m.teamTotal!, 'max'), ours)
  // Scoped to a loss, not "our lowest total ever" (fixed September 2026) —
  // a low total we still won with (a tiny target successfully defended,
  // already covered by "Lowest total defended" below) isn't a low point,
  // it's a bowling performance. Showing it under "Lowest team total" read
  // backwards: a card meant to flag a capitulation was sometimes actually
  // a win.
  add('Lowest team total (losing cause)', pick(scored, m => m.result === 'lost', m => m.teamTotal!, 'min'), ours)
  add('Highest successful chase', pick(scored, m => m.result === 'won' && m.battedFirst === false, m => m.teamTotal!, 'max'), ours)
  add('Lowest total defended', pick(scored, m => m.result === 'won' && m.battedFirst === true, m => m.teamTotal!, 'min'), ours)
  add('Biggest win by runs', pick(scored, m => winMargin(m)?.kind === 'runs', m => winMargin(m)!.value, 'max'),
    m => `by ${winMargin(m)!.value} runs`)
  // Narrowest wins (added September 2026) — same winMargin() pool as
  // "Biggest win by …" above, just the other end of the range.
  add('Narrowest win by runs', pick(scored, m => winMargin(m)?.kind === 'runs', m => winMargin(m)!.value, 'min'),
    m => `by ${winMargin(m)!.value} runs`)
  add('Biggest win by wickets', pick(scored, m => winMargin(m)?.kind === 'wickets', m => winMargin(m)!.value, 'max'),
    m => `by ${winMargin(m)!.value} wickets`)
  add('Narrowest win by wickets', pick(scored, m => winMargin(m)?.kind === 'wickets', m => winMargin(m)!.value, 'min'),
    m => `by ${winMargin(m)!.value} wickets`)
  // Scoped to a loss too, same reasoning as "Lowest team total" above — the
  // biggest total we've ever conceded is only a meaningful low point if we
  // actually lost that match. Conceding a big total and still winning (an
  // even bigger chase) is "Highest successful chase" above, not a
  // defensive low. "Lowest total conceded" was dropped outright rather
  // than rescoped (September 2026) — restricted to wins (its only sensible
  // scope, since a low total conceded in a loss would mean we somehow lost
  // defending a tiny total, effectively already "Lowest total defended"
  // inverted) it never carried information "Biggest win by runs" didn't
  // already cover: bowling a side out cheaply and winning big is, in
  // practice, the same match either card would point at.
  add('Highest total conceded (losing cause)', pick(scored.filter(m => m.oppTotal !== null), m => m.result === 'lost', m => m.oppTotal!, 'max'), theirs)
  return out
}

// ── Option lists for the filter bar ───────────────────────────────────────

export function filterOptions(matches: TeamMatch[]) {
  const years = Array.from(new Set(matches.map(m => m.gameDate.slice(0, 4)))).sort().reverse()
  const tournaments = uniqBy(matches.filter(m => m.tournamentId).map(m => ({ id: m.tournamentId!, name: m.tournamentName ?? 'Unnamed' })), t => t.id)
  const grounds = uniqBy(matches.filter(m => m.groundId).map(m => ({ id: m.groundId!, name: m.groundName ?? 'Unnamed' })), g => g.id)
  const opponents = uniqBy(matches.map(m => ({ id: opponentKey(m), name: m.opponentLabel })), o => o.id)
  const captains = uniqBy(matches.map(m => ({ id: captainKey(m), name: m.captainName ?? 'Captain not recorded' })), c => c.id)
  const months = uniqBy(matches.map(m => ({ id: m.gameDate.slice(0, 7), name: monthLabel(m.gameDate.slice(0, 7)) })), x => x.id)
  const slots = uniqBy(matches.map(m => ({ id: m.slotTime, name: slotLabel(m.slotTime) })), x => x.id)
  const byName = (a: { name: string }, b: { name: string }) => a.name.localeCompare(b.name)
  return {
    years,
    tournaments: tournaments.sort(byName),
    grounds: grounds.sort(byName),
    opponents: opponents.sort(byName),
    // "Captain not recorded" sorts last rather than alphabetically among
    // real names — it's a data gap, not a captain.
    captains: captains.sort((a, b) => (a.id === 'unknown' ? 1 : 0) - (b.id === 'unknown' ? 1 : 0) || byName(a, b)),
    months: months.sort((a, b) => b.id.localeCompare(a.id)),   // newest first
    slots: slots.sort((a, b) => a.id.localeCompare(b.id)),     // chronological
  }
}

function uniqBy<T>(arr: T[], key: (t: T) => string): T[] {
  const seen = new Set<string>()
  const out: T[] = []
  for (const t of arr) {
    const k = key(t)
    if (seen.has(k)) continue
    seen.add(k)
    out.push(t)
  }
  return out
}
