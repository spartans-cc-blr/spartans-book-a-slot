'use client'

// GC/admin-only captain picker on /captains-corner/my-players. Selection
// lives in ?captainId= (server re-validates it), and uses router.replace so
// switching captains doesn't grow the back stack — see
// features/back-navigation.md §2.

import { useRouter, useSearchParams } from 'next/navigation'
import type { CaptainOption } from '@/lib/captaincyStatsCore'

export function CaptainSelect({ captains, selectedId, ownPlayerId }: {
  captains: CaptainOption[]
  selectedId: string
  ownPlayerId: string | null
}) {
  const router = useRouter()
  const searchParams = useSearchParams()

  function handleChange(e: React.ChangeEvent<HTMLSelectElement>) {
    const params = new URLSearchParams(searchParams.toString())
    params.set('captainId', e.target.value)
    router.replace(`/captains-corner/my-players?${params.toString()}`)
  }

  return (
    <label className="flex items-center gap-2 flex-wrap mt-3">
      <span className="font-rajdhani text-[11px] font-bold uppercase tracking-widest text-[var(--stats-text-faint)]">Captain</span>
      <select value={selectedId} onChange={handleChange}
        className="font-rajdhani text-sm font-semibold bg-[var(--stats-card-bg)] border border-[var(--stats-card-border)] text-[var(--stats-text)] rounded px-3 py-1.5">
        {captains.map(c => (
          <option key={c.id} value={c.id}>
            {c.name}{c.id === ownPlayerId ? ' (you)' : ''} — {c.matches} {c.matches === 1 ? 'match' : 'matches'}
          </option>
        ))}
      </select>
    </label>
  )
}
