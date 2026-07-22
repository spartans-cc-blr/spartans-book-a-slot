'use client'
// Filter bar for /leaderboard. Three justified rows (see design notes in
// PR): each control keeps its own natural, text-driven width — nothing is
// stretched or shrunk — and justify-content: space-between spaces the row
// so the first control sits flush left and the last flush right.
//
//   Row 1 — Year, then the Milestones/MVP tabs (the two "headline" views)
//   Row 2 — Bat/Bowl/Field tabs, then Format as two checkboxes (T20/T30,
//           both checked by default = no restriction)
//   Row 3 — Tournament, Ground (plain 50/50 grid — two long, similarly
//           truncated dropdowns read naturally as an even split)
//
// Server component owns the actual data fetch (see
// src/app/leaderboard/page.tsx); this just pushes new searchParams on
// change so the page re-renders server-side with the new filter. Tournament
// and Ground option lists are themselves already scoped by the current
// Format selection — that scoping happens server-side in getFilterOptions()
// and arrives here as plain narrowed-down props, not computed client-side.

import { useRouter } from 'next/navigation'

// Table-backed categories — each renders a sortable LeaderboardTable.
export type TableCategory = 'batting' | 'bowling' | 'fielding' | 'mvp'
// 'milestones' is a peer tab, not a table — it renders LeaderboardMilestones
// instead. It's the default landing tab (see src/app/leaderboard/page.tsx).
export type LeaderboardCategory = 'milestones' | TableCategory

export type Format = 'T20' | 'T30'

const TAB_LABEL: Record<LeaderboardCategory, string> = {
  milestones: '🏆 Milestones',
  mvp: 'MVP',
  batting: 'Bat',
  bowling: 'Bowl',
  fielding: 'Field',
}

interface Props {
  years:        number[]
  tournaments:  { id: string; name: string }[]
  grounds:      { id: string; name: string }[]
  year:         number | 'all'
  tournamentId: string | 'all'
  groundId:     string | 'all'
  formats:      Set<Format>
  category:     LeaderboardCategory
}

// Same convention as shortTourney() in the Captains' Corner matrix header
// (src/components/captains/CaptainsCornerGrid.tsx) — kept purely visual
// via CSS on the <select> itself (max-width + text-overflow: ellipsis) so
// the CLOSED control stays compact while the OPEN dropdown list still shows
// full names; a native <select> renders identical text in both states, so
// slicing the option string itself would truncate both.
const SELECT_TRUNCATE = 'truncate min-w-0'

export function LeaderboardFilters({ years, tournaments, grounds, year, tournamentId, groundId, formats, category }: Props) {
  const router = useRouter()

  function navigate(next: Partial<{ year: string; tournament: string; ground: string; category: string; format: string }>) {
    const params = new URLSearchParams({
      year: String(year),
      tournament: tournamentId,
      ground: groundId,
      category,
      // Carry the current format restriction forward on unrelated
      // navigations (e.g. changing Tournament shouldn't reset Format).
      ...(formats.size === 1 ? { format: Array.from(formats)[0] } : {}),
      ...next,
    })
    // toggleFormat() passes format: '' to mean "back to no restriction" —
    // an empty query param isn't the same as an absent one, so strip it.
    if (next.format === '') params.delete('format')
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

  const tab = (c: LeaderboardCategory) => (
    <button
      key={c}
      onClick={() => navigate({ category: c })}
      className={`font-rajdhani text-xs font-bold tracking-widest uppercase px-3 py-1.5 rounded border transition-colors whitespace-nowrap
        ${category === c ? 'bg-gold/20 border-gold-dim text-gold' : 'border-ink-5 text-zinc-500 hover:text-zinc-300'}`}>
      {TAB_LABEL[c]}
    </button>
  )

  return (
    <div className="flex flex-col gap-2 mb-5">
      {/* Row 1 — Year, Milestones, MVP */}
      <div className="flex items-center justify-between gap-2">
        <select
          value={String(year)}
          onChange={e => navigate({ year: e.target.value })}
          className="form-input w-auto font-rajdhani text-xs py-1.5 flex-shrink-0">
          <option value="all">All time</option>
          {years.map(y => <option key={y} value={y}>{y}</option>)}
        </select>
        {tab('milestones')}
        {tab('mvp')}
      </div>

      {/* Row 2 — Bat / Bowl / Field, then Format (T20 / T30 checkboxes) */}
      <div className="flex items-center justify-between gap-2">
        {tab('batting')}
        {tab('bowling')}
        {tab('fielding')}
        <label className={`flex items-center gap-1.5 font-rajdhani text-xs font-bold tracking-widest uppercase cursor-pointer select-none flex-shrink-0
          ${formats.has('T20') ? 'text-gold' : 'text-zinc-500'}`}>
          <input type="checkbox" checked={formats.has('T20')} onChange={() => toggleFormat('T20')} className="accent-gold" />
          T20
        </label>
        <label className={`flex items-center gap-1.5 font-rajdhani text-xs font-bold tracking-widest uppercase cursor-pointer select-none flex-shrink-0
          ${formats.has('T30') ? 'text-gold' : 'text-zinc-500'}`}>
          <input type="checkbox" checked={formats.has('T30')} onChange={() => toggleFormat('T30')} className="accent-gold" />
          T30
        </label>
      </div>

      {/* Row 3 — Tournament, Ground */}
      <div className="grid grid-cols-2 gap-2">
        <select
          value={tournamentId}
          onChange={e => navigate({ tournament: e.target.value })}
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
    </div>
  )
}
