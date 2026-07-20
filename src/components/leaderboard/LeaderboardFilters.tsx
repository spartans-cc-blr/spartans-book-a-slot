'use client'
// Filter bar for /leaderboard — year, tournament, and stat-category
// selects. Server component owns the actual data fetch (see
// src/app/leaderboard/page.tsx); this just pushes new searchParams on
// change so the page re-renders server-side with the new filter.

import { useRouter } from 'next/navigation'

// Table-backed categories — each renders a sortable LeaderboardTable.
export type TableCategory = 'batting' | 'bowling' | 'fielding' | 'mvp'
// 'milestones' is a peer tab, not a table — it renders LeaderboardMilestones
// instead. It's the default landing tab (see src/app/leaderboard/page.tsx).
export type LeaderboardCategory = 'milestones' | TableCategory

interface Props {
  years:        number[]
  tournaments:  { id: string; name: string }[]
  year:         number | 'all'
  tournamentId: string | 'all'
  category:     LeaderboardCategory
}

export function LeaderboardFilters({ years, tournaments, year, tournamentId, category }: Props) {
  const router = useRouter()

  function navigate(next: Partial<{ year: string; tournament: string; category: string }>) {
    const params = new URLSearchParams({
      year: String(year),
      tournament: tournamentId,
      category,
      ...next,
    })
    router.push(`/leaderboard?${params.toString()}`)
  }

  return (
    <div className="flex flex-wrap items-center gap-3 mb-5">
      <div className="flex gap-1 flex-wrap">
        {(['milestones', 'batting', 'bowling', 'fielding', 'mvp'] as const).map(c => (
          <button
            key={c}
            onClick={() => navigate({ category: c })}
            className={`font-rajdhani text-xs font-bold tracking-widest uppercase px-3 py-1.5 rounded border transition-colors
              ${category === c ? 'bg-gold/20 border-gold-dim text-gold' : 'border-ink-5 text-zinc-500 hover:text-zinc-300'}`}>
            {c === 'mvp' ? 'MVP' : c === 'milestones' ? '🏆 Milestones' : c}
          </button>
        ))}
      </div>

      <select
        value={String(year)}
        onChange={e => navigate({ year: e.target.value })}
        className="form-input w-auto font-rajdhani text-xs py-1.5">
        <option value="all">All time</option>
        {years.map(y => <option key={y} value={y}>{y}</option>)}
      </select>

      <select
        value={tournamentId}
        onChange={e => navigate({ tournament: e.target.value })}
        className="form-input w-auto font-rajdhani text-xs py-1.5">
        <option value="all">All tournaments</option>
        {tournaments.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
      </select>
    </div>
  )
}
