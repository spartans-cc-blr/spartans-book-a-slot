'use client'
// Pitch Type tab row for /leaderboard's Detailed → Bat/Bowl tabs — narrows
// LeaderboardTable below it (and, on Bat, sits under BattingPositionLeaders
// rather than filtering it — see src/app/leaderboard/page.tsx) to matches
// played on one surface. Only ever rendered by the page when no Tournament/
// Ground is already selected (a tournament already pins one specific
// pitch_type or none at all — see features/team-stats.md §6), so there's no
// "hidden but still filtering" state to worry about here.
//
// Navigates via a plain ?pitch= query param, same pattern as
// CaptainPicker.tsx — merges into whatever's already in the URL rather than
// rebuilding it from scratch, so Year/Format/etc. selected via
// LeaderboardFilters are preserved. Conversely, LeaderboardFilters' own
// navigate() rebuilds the URL from just its own props and never carries
// `pitch` forward — so any change made there (year, tournament, format,
// switching category, ...) naturally resets the pitch tab back to "All",
// which is the desired behaviour once a Tournament/Ground is picked (the
// tabs disappear) and harmless everywhere else.

import { useRouter, useSearchParams } from 'next/navigation'
import type { PitchType } from '@/types'
import { pillClass } from './LeaderboardFilters'

const TABS: { key: PitchType | 'all'; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'Matted', label: 'Matted' },
  { key: 'Astro', label: 'Astro' },
  { key: 'Turf', label: 'Turf' },
]

export function PitchTypeTabs({ active }: { active: PitchType | 'all' }) {
  const router = useRouter()
  const searchParams = useSearchParams()

  function select(key: PitchType | 'all') {
    const params = new URLSearchParams(searchParams.toString())
    if (key === 'all') params.delete('pitch')
    else params.set('pitch', key)
    router.replace(`/leaderboard?${params.toString()}`)
  }

  return (
    <div className="flex items-center gap-2 flex-wrap mb-4">
      <span className="font-rajdhani text-xs font-bold tracking-widest uppercase text-[var(--stats-text-muted)] dark:text-zinc-500 mr-1">
        Pitch
      </span>
      {TABS.map(t => (
        <button key={t.key} onClick={() => select(t.key)} className={pillClass(active === t.key)}>
          {t.label}
        </button>
      ))}
    </div>
  )
}
