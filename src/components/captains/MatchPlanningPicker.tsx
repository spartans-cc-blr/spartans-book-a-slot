'use client'

// Dropdown of upcoming games for /captains-corner/match-planning. Picking one
// navigates to ?booking=<id>&lens=<lens> (replace, so Back skips past it).

import { useRouter } from 'next/navigation'

export interface PickerOption { id: string; label: string }

export function MatchPlanningPicker({ options, selectedId, lens }: { options: PickerOption[]; selectedId: string; lens: string }) {
  const router = useRouter()
  return (
    <label className="block mt-3">
      <span className="font-rajdhani text-xs font-bold uppercase tracking-wide text-[var(--stats-text-muted)]">Upcoming game</span>
      <select
        value={selectedId}
        onChange={e => router.replace(`/captains-corner/match-planning?booking=${encodeURIComponent(e.target.value)}&lens=${lens}`, { scroll: false })}
        className="mt-1 w-full max-w-md font-rajdhani text-sm font-semibold rounded-lg border border-[var(--stats-card-border)] bg-[var(--stats-card-bg)] text-[var(--stats-text)] px-3 py-2"
      >
        {options.map(o => <option key={o.id} value={o.id}>{o.label}</option>)}
      </select>
    </label>
  )
}
