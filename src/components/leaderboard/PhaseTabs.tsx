'use client'
// Phase-of-play tabs (All / Powerplay / Middle / Death) for Detailed → Bowl's two control charts.
// Only rendered by the page when exactly one format is selected (phases differ per format) and the
// gate in bowlingPhaseLeaders.ts passes (≥50% of the filter's matches have complete commentary, and
// enough bowlers with a real sample in the phase). Affects the charts only, not the table below.
// Same ?param + router.replace pattern as PitchTypeTabs.tsx; LeaderboardFilters' own navigate()
// never carries `phase` forward, so changing format/year/etc. resets it to "All".

import { useRouter, useSearchParams } from 'next/navigation'
import { PHASE_LABEL, phaseRangeLabel, type PhaseKey } from '@/lib/ballByBall'
import { pillClass } from './LeaderboardFilters'

export function PhaseTabs({
  active, phases, format, totalOvers, covered, total,
}: {
  active: PhaseKey | 'all'
  phases: PhaseKey[]
  format: string
  totalOvers: number
  covered: number
  total: number
}) {
  const router = useRouter()
  const searchParams = useSearchParams()

  function select(key: PhaseKey | 'all') {
    const params = new URLSearchParams(searchParams.toString())
    if (key === 'all') params.delete('phase')
    else params.set('phase', key)
    router.replace(`/leaderboard?${params.toString()}`)
  }

  return (
    <div className="mb-4">
      <div className="flex items-center gap-2 flex-wrap">
        <span className="font-rajdhani text-xs font-bold tracking-widest uppercase text-[var(--stats-text-muted)] dark:text-zinc-500 mr-1">
          Phase
        </span>
        <button onClick={() => select('all')} className={pillClass(active === 'all')}>All</button>
        {phases.map(p => (
          <button key={p} onClick={() => select(p)} className={pillClass(active === p)} title={phaseRangeLabel(p, totalOvers)}>
            {PHASE_LABEL[p]}
          </button>
        ))}
      </div>
      <p className="font-rajdhani text-xs text-[var(--stats-text-muted)] dark:text-zinc-500 mt-1.5">
        Phase views use ball-by-ball commentary: {covered === total ? `all ${total}` : `${covered} of ${total}`} {format} matches in this filter. They change the two charts below only, not the table.
      </p>
    </div>
  )
}
