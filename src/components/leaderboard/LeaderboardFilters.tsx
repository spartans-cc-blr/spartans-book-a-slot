'use client'
// Filter bar for /leaderboard. Grouped nav tree, two branches:
//
//   Honor Board — Overall (career milestones, unchanged) · Monthly (new)
//   Detailed    — MVP / Bat / Bowl / Field (the sortable tables)
//
//   Row 1 — Honor Board / Detailed, then Year (only rendered for Detailed
//           or Honor Board → Overall — Monthly has its own month stepper
//           instead, and showing both would be two conflicting timeframe
//           controls at once)
//   Row 2 — the active branch's sub-tabs, with the T20/T30 format
//           checkboxes on the same line (right-aligned via a flex spacer,
//           same trick this file already used before this pass)
//   Row 3 — Tournament, Ground (disabled for the whole Honor Board branch,
//           same as the old Milestones tab — neither Overall nor Monthly
//           is scoped to a single tournament/ground)
//   Row 4 — month stepper, only rendered for Honor Board → Monthly; reuses
//           the exact stepper/picker pattern from MatchHistoryClient.tsx's
//           month navigator on /matches/history
//
// Server component owns the actual data fetch (see
// src/app/leaderboard/page.tsx); this just pushes new searchParams on
// change so the page re-renders server-side with the new filter/category.

import { useState } from 'react'
import { useRouter } from 'next/navigation'

// Table-backed categories — each renders a sortable LeaderboardTable, and
// together make up the "Detailed" branch.
export type TableCategory = 'batting' | 'bowling' | 'fielding' | 'mvp'
// "Honor Board" branch — 'overall' is the renamed Milestones view
// (LeaderboardMilestones.tsx, unchanged internally), 'monthly' is the new
// month-scoped view (LeaderboardMonthly.tsx).
export type HonorCategory = 'overall' | 'monthly'
export type LeaderboardCategory = HonorCategory | TableCategory

export type Format = 'T20' | 'T30'
// Defending = our team batted first and set a target. Chasing = our team
// batted second, chasing the target. Only surfaced on Detailed → MVP — see
// LeaderboardTable.tsx's MVP tab and getLeaderboard()'s innings scoping in
// src/lib/playerStats.ts (same toss_won/toss_decision derivation as the
// player stats page's Defending/Chasing filter).
export type Innings = 'all' | 'defending' | 'chasing'

const DETAILED_LABEL: Record<TableCategory, string> = {
  mvp: 'MVP', batting: 'Bat', bowling: 'Bowl', fielding: 'Field',
}

// Same convention as shortTourney() in the Captains' Corner matrix header
// (src/components/captains/CaptainsCornerGrid.tsx) — kept purely visual
// via CSS on the <select> itself (max-width + text-overflow: ellipsis) so
// the CLOSED control stays compact while the OPEN dropdown list still shows
// full names; a native <select> renders identical text in both states, so
// slicing the option string itself would truncate both.
const SELECT_TRUNCATE = 'truncate min-w-0'

function pillClass(active: boolean): string {
  return `font-rajdhani text-xs font-bold tracking-widest uppercase px-3 py-1.5 rounded border transition-colors whitespace-nowrap
    ${active ? 'bg-gold/20 border-gold-dim text-gold' : 'border-ink-5 text-zinc-500 hover:text-zinc-300'}`
}

function shiftMonth(m: string, delta: number): string {
  const [y, mo] = m.split('-').map(Number)
  const d = new Date(Date.UTC(y, mo - 1 + delta, 1))
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`
}
function currentMonthStr(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}
function monthChipLabel(m: string): string {
  const [y, mo] = m.split('-').map(Number)
  return new Date(Date.UTC(y, mo - 1, 1)).toLocaleDateString('en-IN', { month: 'short', year: 'numeric', timeZone: 'UTC' })
}
function monthOnlyLabel(m: string): string {
  const [y, mo] = m.split('-').map(Number)
  return new Date(Date.UTC(y, mo - 1, 1)).toLocaleDateString('en-IN', { month: 'short', timeZone: 'UTC' })
}
// months arrives sorted most-recent-first with each year's months
// contiguous, so a simple running-group walk keeps that order intact —
// same approach as MatchHistoryClient.tsx's groupMonthsByYear().
function groupMonthsByYear(months: string[]): { year: string; months: string[] }[] {
  const groups: { year: string; months: string[] }[] = []
  for (const m of months) {
    const y = m.slice(0, 4)
    const last = groups[groups.length - 1]
    if (last && last.year === y) last.months.push(m)
    else groups.push({ year: y, months: [m] })
  }
  return groups
}

interface Props {
  years:        number[]
  months:       string[]  // available months with data, most-recent-first
  tournaments:  { id: string; name: string }[]
  grounds:      { id: string; name: string }[]
  year:         number | 'all'
  month:        string     // currently selected month, 'YYYY-MM'
  tournamentId: string | 'all'
  groundId:     string | 'all'
  formats:      Set<Format>
  innings:      Innings
  category:     LeaderboardCategory
}

export function LeaderboardFilters({ years, months, tournaments, grounds, year, month, tournamentId, groundId, formats, innings, category }: Props) {
  const router = useRouter()
  const [monthPickerOpen, setMonthPickerOpen] = useState(false)

  const topGroup: 'honor' | 'detailed' = (category === 'overall' || category === 'monthly') ? 'honor' : 'detailed'
  const isMonthly = category === 'monthly'
  // Year shows for Detailed and for Honor Board → Overall — both are
  // genuinely year-scoped views. Monthly has its own, more specific
  // timeframe control (the stepper below) instead. Once a Tournament is
  // picked it's disabled (not hidden — the layout stays put) rather than
  // combined with Year, since narrowing an already-specific tournament
  // down to one year on top would usually just produce an empty result.
  const showYear = topGroup === 'detailed' || category === 'overall'

  function navigate(next: Partial<{ year: string; month: string; tournament: string; ground: string; category: string; format: string; innings: string }>) {
    const params = new URLSearchParams({
      year: String(year),
      month,
      tournament: tournamentId,
      ground: groundId,
      category,
      // Carry the current format restriction forward on unrelated
      // navigations (e.g. changing Tournament shouldn't reset Format).
      ...(formats.size === 1 ? { format: Array.from(formats)[0] } : {}),
      ...(innings !== 'all' ? { innings } : {}),
      ...next,
    })
    // toggleFormat() passes format: '' to mean "back to no restriction" —
    // an empty query param isn't the same as an absent one, so strip it.
    if (next.format === '') params.delete('format')
    if (next.innings === '') params.delete('innings')
    router.push(`/leaderboard?${params.toString()}`)
  }

  function toggleFormat(fmt: Format) {
    const next = new Set(formats)
    if (next.has(fmt)) {
      next.delete(fmt)
      // Never persist an all-unchecked state — that's the same as "all",
      // so just snap back to both checked rather than showing zero results.
      if (next.size === 0) { next.add('T20'); next.add('T30') }
    } else {
      next.add(fmt)
    }
    navigate({ format: next.size === 1 ? Array.from(next)[0] : '' })
  }

  // Mutually exclusive checkbox pair, mirroring toggleFormat()'s shape —
  // clicking the already-checked one clears back to 'all'. Only ever
  // rendered when category === 'mvp' (see Row 2 below), and resetting on
  // every other sub-tab selection (selectDetailedSub / selectHonorSub)
  // keeps a stale value from silently scoping a table it's no longer shown
  // next to.
  function toggleInnings(v: Exclude<Innings, 'all'>) {
    navigate({ innings: innings === v ? '' : v })
  }

  // Monthly is a strictly month-scoped view — its own stepper is the
  // timeframe control, so tournament/ground get forced back to "all" (and
  // hidden entirely, see Row 3 below) whenever it's selected. Overall does
  // allow tournament/ground scoping (with a loosened qualification bar —
  // see minGamesThreshold() in LeaderboardMilestones.tsx), so switching to
  // it deliberately does NOT reset them — whatever was selected on
  // Detailed carries over.
  function selectHonorSub(sub: HonorCategory) {
    navigate(sub === 'monthly' ? { category: sub, tournament: 'all', ground: 'all', innings: '' } : { category: sub, innings: '' })
  }
  function selectDetailedSub(sub: TableCategory) {
    // Defending/Chasing only ever shows next to MVP — clear it on every
    // other sub-tab so it can't keep scoping a table it's no longer
    // visibly filtering.
    navigate(sub === 'mvp' ? { category: sub } : { category: sub, innings: '' })
  }
  // Clicking a top-level branch button jumps to that branch's default
  // sub-tab — but only when actually switching branches, so re-clicking
  // "Honor Board" while already on Monthly doesn't silently bounce back
  // to Overall and lose the selected month.
  function selectTopGroup(top: 'honor' | 'detailed') {
    if (top === 'honor' && topGroup !== 'honor') selectHonorSub('overall')
    if (top === 'detailed' && topGroup !== 'detailed') selectDetailedSub('mvp')
  }

  const earliestMonth = months.length ? months[months.length - 1] : currentMonthStr()
  const canGoOlder = month > earliestMonth
  const canGoNewer = month < currentMonthStr()
  function goOlder() { if (canGoOlder) navigate({ category: 'monthly', month: shiftMonth(month, -1), tournament: 'all', ground: 'all' }) }
  function goNewer() { if (canGoNewer) navigate({ category: 'monthly', month: shiftMonth(month, 1), tournament: 'all', ground: 'all' }) }
  function selectMonth(m: string) { setMonthPickerOpen(false); navigate({ category: 'monthly', month: m, tournament: 'all', ground: 'all' }) }

  const monthGroups = groupMonthsByYear(months)

  const formatCheckboxes = (
    <div className="flex items-center gap-2 flex-shrink-0">
      <label className={`flex items-center gap-1.5 font-rajdhani text-xs font-bold tracking-widest uppercase cursor-pointer select-none
        ${formats.has('T20') ? 'text-gold' : 'text-zinc-500'}`}>
        <input type="checkbox" checked={formats.has('T20')} onChange={() => toggleFormat('T20')} className="accent-gold" />
        T20
      </label>
      <label className={`flex items-center gap-1.5 font-rajdhani text-xs font-bold tracking-widest uppercase cursor-pointer select-none
        ${formats.has('T30') ? 'text-gold' : 'text-zinc-500'}`}>
        <input type="checkbox" checked={formats.has('T30')} onChange={() => toggleFormat('T30')} className="accent-gold" />
        T30
      </label>
    </div>
  )

  // Detailed → MVP only. Sits ahead of the T20/T30 checkboxes on the same
  // line — see Row 2 below.
  const inningsCheckboxes = category === 'mvp' ? (
    <div className="flex items-center gap-2 flex-shrink-0">
      <label className={`flex items-center gap-1.5 font-rajdhani text-xs font-bold tracking-widest uppercase cursor-pointer select-none
        ${innings === 'defending' ? 'text-gold' : 'text-zinc-500'}`}>
        <input type="checkbox" checked={innings === 'defending'} onChange={() => toggleInnings('defending')} className="accent-gold" />
        Defending
      </label>
      <label className={`flex items-center gap-1.5 font-rajdhani text-xs font-bold tracking-widest uppercase cursor-pointer select-none
        ${innings === 'chasing' ? 'text-gold' : 'text-zinc-500'}`}>
        <input type="checkbox" checked={innings === 'chasing'} onChange={() => toggleInnings('chasing')} className="accent-gold" />
        Chasing
      </label>
    </div>
  ) : null

  return (
    <div className="flex flex-col gap-2 mb-5">
      {/* Row 1 — Honor Board, Detailed, then Year (Detailed / Overall only) */}
      <div className="flex items-center gap-2 flex-wrap">
        <button onClick={() => selectTopGroup('honor')} className={pillClass(topGroup === 'honor')}>Honor Board</button>
        <button onClick={() => selectTopGroup('detailed')} className={pillClass(topGroup === 'detailed')}>Detailed</button>
        {showYear && (
          <select
            value={String(year)}
            onChange={e => navigate({ year: e.target.value })}
            disabled={tournamentId !== 'all'}
            title={tournamentId !== 'all' ? 'A tournament is already selected — every one of its games is shown, regardless of year' : undefined}
            className="form-input w-auto font-rajdhani text-xs py-1.5 flex-shrink-0 disabled:opacity-50 disabled:cursor-not-allowed">
            <option value="all">All time</option>
            {years.map(y => <option key={y} value={y}>{y}</option>)}
          </select>
        )}
      </div>

      {/* Row 2 — active branch's sub-tabs, T20/T30 on the same line */}
      {topGroup === 'honor' ? (
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <div className="flex items-center gap-2">
            <button onClick={() => selectHonorSub('overall')} className={pillClass(category === 'overall')}>Overall</button>
            <button onClick={() => selectHonorSub('monthly')} className={pillClass(category === 'monthly')}>Monthly</button>
          </div>
          {formatCheckboxes}
        </div>
      ) : (
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <div className="flex items-center gap-2 flex-wrap">
            {(['mvp', 'batting', 'bowling', 'fielding'] as TableCategory[]).map(c => (
              <button key={c} onClick={() => selectDetailedSub(c)} className={pillClass(category === c)}>{DETAILED_LABEL[c]}</button>
            ))}
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            {inningsCheckboxes}
            {formatCheckboxes}
          </div>
        </div>
      )}

      {/* Row 3 — Tournament, Ground. Hidden (not just disabled, which was
          just clutter) for Monthly only — it's strictly month-scoped.
          Shown for Detailed (unchanged) and now for Overall too — see
          selectHonorSub() above and the loosened qualification bar in
          LeaderboardMilestones.tsx. */}
      {!isMonthly && (
        <div className="grid grid-cols-2 gap-2">
          <select
            value={tournamentId}
            onChange={e => navigate({ tournament: e.target.value, ...(e.target.value !== 'all' ? { year: 'all' } : {}) })}
            className={`form-input font-rajdhani text-xs py-1.5 ${SELECT_TRUNCATE}`}>
            <option value="all">All tournaments</option>
            {tournaments.map(t => <option key={t.id} value={t.id} title={t.name}>{t.name}</option>)}
          </select>
          <select
            value={groundId}
            onChange={e => navigate({ ground: e.target.value })}
            className={`form-input font-rajdhani text-xs py-1.5 ${SELECT_TRUNCATE}`}>
            <option value="all">All grounds</option>
            {grounds.map(g => <option key={g.id} value={g.id} title={g.name}>{g.name}</option>)}
          </select>
        </div>
      )}

      {/* Row 4 — month stepper, Monthly only */}
      {isMonthly && (
        <div>
          <div className="flex items-center gap-2 bg-ink-4 border border-ink-5 rounded-full px-2 py-1.5">
            <button
              onClick={goOlder}
              disabled={!canGoOlder}
              aria-label="Older month"
              className="w-7 h-7 flex-shrink-0 flex items-center justify-center border border-gold-dim text-gold rounded-full text-sm disabled:opacity-30 disabled:border-ink-5 disabled:text-zinc-600 hover:bg-gold-dim transition-colors">
              ‹
            </button>
            <button
              onClick={() => setMonthPickerOpen(v => !v)}
              className="flex-1 flex items-center justify-center gap-1.5 font-rajdhani text-xs font-bold tracking-wide text-gold py-1">
              {monthChipLabel(month)}
              <span className="text-zinc-500 text-[10px]">{monthPickerOpen ? '▲' : '▾'}</span>
            </button>
            <button
              onClick={goNewer}
              disabled={!canGoNewer}
              aria-label="Newer month"
              className="w-7 h-7 flex-shrink-0 flex items-center justify-center border border-gold-dim text-gold rounded-full text-sm disabled:opacity-30 disabled:border-ink-5 disabled:text-zinc-600 hover:bg-gold-dim transition-colors">
              ›
            </button>
          </div>

          {monthPickerOpen && (
            <div className="mt-2 bg-ink-4 border border-ink-5 rounded-lg p-3 space-y-3">
              {monthGroups.length === 0 && (
                <p className="font-rajdhani text-xs text-zinc-600">No months with stats yet.</p>
              )}
              {monthGroups.map(group => (
                <div key={group.year} className="space-y-1.5">
                  <span className="font-rajdhani text-[10px] font-bold tracking-widest uppercase text-zinc-600">
                    {group.year}
                  </span>
                  <div className="flex flex-wrap gap-2">
                    {group.months.map(m => (
                      <button
                        key={m}
                        onClick={() => selectMonth(m)}
                        className={`font-rajdhani text-xs font-bold tracking-wide px-3 py-1.5 rounded-full border transition-colors ${
                          month === m
                            ? 'bg-gold/20 border-gold-dim text-gold'
                            : 'bg-ink-3 border-ink-5 text-zinc-500 hover:text-zinc-300'
                        }`}>
                        {monthOnlyLabel(m)}
                      </button>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
