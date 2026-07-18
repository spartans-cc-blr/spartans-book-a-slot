'use client'
// Filter bar for /admin/stats — year, tournament, and stat-category
// selects. Mirrors src/components/leaderboard/LeaderboardFilters.tsx but
// defaults to "All time" (full history) rather than the current year, and
// adds a Fielding category — the admin performance report covers more
// ground than the player-facing leaderboard.

import { useRouter } from 'next/navigation'

export type AdminStatsCategory = 'runs' | 'wickets' | 'fielding' | 'mvp'

interface Props {
  years:        number[]
  tournaments:  { id: string; name: string }[]
  year:         number | 'all'
  tournamentId: string | 'all'
  category:     AdminStatsCategory
}

export function AdminStatsFilters({ years, tournaments, year, tournamentId, category }: Props) {
  const router = useRouter()

  function navigate(next: Partial<{ year: string; tournament: string; category: string }>) {
    const params = new URLSearchParams({
      year: String(year),
      tournament: tournamentId,
      category,
      ...next,
    })
    router.push(`/admin/stats?${params.toString()}`)
  }

  return (
    <div className="flex flex-wrap items-center gap-3 mb-5">
      <div className="flex gap-1">
        {(['runs', 'wickets', 'fielding', 'mvp'] as const).map(c => (
          <button
            key={c}
            onClick={() => navigate({ category: c })}
            className={`font-rajdhani text-xs font-bold tracking-widest uppercase px-3 py-1.5 rounded border transition-colors
              ${category === c ? 'bg-gold/20 border-gold-dim text-gold' : 'border-ink-5 text-zinc-500 hover:text-zinc-300'}`}>
            {c === 'mvp' ? 'MVP' : c}
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
