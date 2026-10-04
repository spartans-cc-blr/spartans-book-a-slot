'use client'

import { useState } from 'react'

// Shared month stepper — ‹ month ▾ › plus a tap-to-open picker grouped by
// year. Sits directly above a DateChipSlider on every page that has one, so
// a long date-chip row can be narrowed to one month first. Purely
// presentational and controlled: the caller owns `value` ('' = All time) and
// does the filtering. Colours read the `--fx-*` CSS variables, which flip
// with the visitor's Light/Dark/System choice (same as DateChipSlider's
// default `auto` theme), so it works on /fixtures and the admin pages alike.
//
// `months` is a list of 'YYYY-MM' strings, any order. They are shown newest
// first; ‹ moves to an older month, › to a newer one. Both arrows are
// disabled while "All time" is selected (same as /matches/history).

export function monthOfDate(date: string): string {
  return date.slice(0, 7)
}

export function distinctMonths(dates: string[]): string[] {
  return Array.from(new Set(dates.map(monthOfDate))).sort().reverse()
}

function monthChipLabel(month: string): string {
  const [y, m] = month.split('-').map(Number)
  return new Date(Date.UTC(y, m - 1, 1)).toLocaleDateString('en-IN', { month: 'short', year: 'numeric', timeZone: 'UTC' })
}

function monthOnlyLabel(month: string): string {
  const [y, m] = month.split('-').map(Number)
  return new Date(Date.UTC(y, m - 1, 1)).toLocaleDateString('en-IN', { month: 'short', timeZone: 'UTC' })
}

export function MonthStepper({ months, value, onChange }: {
  months: string[]
  value: string
  onChange: (month: string) => void
}) {
  const [pickerOpen, setPickerOpen] = useState(false)
  if (months.length === 0) return null

  const sorted = [...months].sort().reverse() // newest first
  const idx = sorted.indexOf(value)
  const hasMonth = idx !== -1
  const canGoNewer = hasMonth && idx > 0
  const canGoOlder = hasMonth && idx < sorted.length - 1

  const groups: { year: string; months: string[] }[] = []
  for (const m of sorted) {
    const year = m.slice(0, 4)
    const last = groups[groups.length - 1]
    if (last && last.year === year) last.months.push(m)
    else groups.push({ year, months: [m] })
  }

  const arrowStyle = { border: '1px solid var(--fx-accent)', color: 'var(--fx-accent)' }
  const pill = (active: boolean) => active
    ? { background: 'var(--fx-badge-bg)', borderColor: 'var(--fx-badge-border)', color: 'var(--fx-badge-text)' }
    : { background: 'var(--fx-hero-bg)', borderColor: 'var(--fx-border)', color: 'var(--fx-text-muted)' }

  return (
    <div className="mb-3">
      <div className="flex items-center gap-2 rounded-full px-2 py-1.5" style={{ background: 'var(--fx-shell-bg)', border: '1px solid var(--fx-border)' }}>
        <button
          type="button"
          onClick={() => canGoOlder && onChange(sorted[idx + 1])}
          disabled={!canGoOlder}
          aria-label="Older month"
          className="w-7 h-7 flex-shrink-0 flex items-center justify-center rounded-full text-sm transition-colors disabled:opacity-30"
          style={arrowStyle}>
          ‹
        </button>
        <button
          type="button"
          onClick={() => setPickerOpen(v => !v)}
          className="flex-1 flex items-center justify-center gap-1.5 font-rajdhani text-xs font-bold tracking-wide py-1"
          style={{ color: 'var(--fx-accent)' }}>
          {value ? monthChipLabel(value) : 'All time'}
          <span className="text-[10px]" style={{ color: 'var(--fx-text-faint)' }}>{pickerOpen ? '▲' : '▾'}</span>
        </button>
        <button
          type="button"
          onClick={() => canGoNewer && onChange(sorted[idx - 1])}
          disabled={!canGoNewer}
          aria-label="Newer month"
          className="w-7 h-7 flex-shrink-0 flex items-center justify-center rounded-full text-sm transition-colors disabled:opacity-30"
          style={arrowStyle}>
          ›
        </button>
      </div>

      {pickerOpen && (
        <div className="mt-2 rounded-lg p-3 space-y-3" style={{ background: 'var(--fx-shell-bg)', border: '1px solid var(--fx-border)' }}>
          <button
            type="button"
            onClick={() => { onChange(''); setPickerOpen(false) }}
            className="font-rajdhani text-xs font-bold tracking-wide px-3 py-1.5 rounded-full border transition-colors"
            style={pill(!value)}>
            All time
          </button>
          {groups.map(group => (
            <div key={group.year} className="space-y-1.5">
              <span className="font-rajdhani text-[10px] font-bold tracking-widest uppercase" style={{ color: 'var(--fx-text-faint)' }}>
                {group.year}
              </span>
              <div className="flex flex-wrap gap-2">
                {group.months.map(m => (
                  <button
                    key={m}
                    type="button"
                    onClick={() => { onChange(value === m ? '' : m); setPickerOpen(false) }}
                    className="font-rajdhani text-xs font-bold tracking-wide px-3 py-1.5 rounded-full border transition-colors"
                    style={pill(value === m)}>
                    {monthOnlyLabel(m)}
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
