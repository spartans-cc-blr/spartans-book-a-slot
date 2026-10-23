'use client'

// A small multi-select dropdown (checkbox list in a popover) for the Batting and Bowling charts.
// An empty selection means "entire innings". Closes on an outside tap or Escape.

import { useEffect, useRef, useState } from 'react'

export interface MultiOption { value: string; label: string }

export function PlayerMultiSelect({ options, selected, onChange, allLabel, summary }: {
  options: MultiOption[]
  selected: string[]
  onChange: (next: string[]) => void
  allLabel: string        // shown when nothing is ticked, e.g. "Entire innings (all bowlers)"
  summary: string         // the button text for the current selection
}) {
  const [open, setOpen] = useState(false)
  const box = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const down = (e: MouseEvent | TouchEvent) => { if (box.current && !box.current.contains(e.target as Node)) setOpen(false) }
    const key = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false) }
    document.addEventListener('mousedown', down)
    document.addEventListener('touchstart', down)
    document.addEventListener('keydown', key)
    return () => { document.removeEventListener('mousedown', down); document.removeEventListener('touchstart', down); document.removeEventListener('keydown', key) }
  }, [open])

  const toggle = (v: string) => onChange(selected.includes(v) ? selected.filter(x => x !== v) : [...selected, v])

  return (
    <div ref={box} className="relative">
      <button type="button" aria-haspopup="listbox" aria-expanded={open} onClick={() => setOpen(o => !o)}
        className="rounded border border-[var(--scorecard-table-border)] bg-transparent px-1.5 py-1 text-xs text-[var(--scorecard-heading-text)] max-w-[12rem] truncate flex items-center gap-1.5">
        <span className="truncate">{summary}</span><span aria-hidden>▾</span>
      </button>
      {open && (
        <div role="listbox" aria-multiselectable="true"
          className="absolute right-0 z-20 mt-1 w-64 max-h-72 overflow-y-auto rounded border border-[var(--scorecard-table-border)] bg-[var(--scorecard-card-bg-solid,var(--scorecard-page-bg))] shadow-lg p-1 font-rajdhani text-xs text-[var(--scorecard-heading-text)]">
          <label className="flex items-center gap-2 px-1.5 py-1 rounded cursor-pointer hover:bg-[var(--scorecard-divider)]">
            <input type="checkbox" checked={selected.length === 0} onChange={() => onChange([])} />
            <span>{allLabel}</span>
          </label>
          <div className="my-0.5 border-t border-[var(--scorecard-table-divider)]" />
          {options.map(o => (
            <label key={o.value} className="flex items-center gap-2 px-1.5 py-1 rounded cursor-pointer hover:bg-[var(--scorecard-divider)]">
              <input type="checkbox" checked={selected.includes(o.value)} onChange={() => toggle(o.value)} />
              <span className="truncate">{o.label}</span>
            </label>
          ))}
          {selected.length > 0 && (
            <button type="button" onClick={() => onChange([])} className="mt-0.5 w-full text-left px-1.5 py-1 text-[var(--fx-accent)] underline">Clear selection</button>
          )}
        </div>
      )}
    </div>
  )
}
