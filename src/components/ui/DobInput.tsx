'use client'

// Day + Month + optional Year picker for players.dob — replaces a plain
// <input type="date"> so a player can set their birthday (which drives the
// club-wide birthday wishes modal — see features/birthday-wishes.md)
// without being forced to disclose the year they were born. Still writes
// a real YYYY-MM-DD string into the same `dob` date column (no schema or
// server-side change needed) — when Year is left blank, a sentinel year
// of SENTINEL_YEAR is used instead. Every consumer of dob today
// (src/lib/birthdays.ts's getTodaysBirthdays()) already only ever compares
// month/day, so the sentinel is invisible to it; dob is also never
// displayed anywhere in the app (excluded from the GC select, never
// rendered on any admin page), so there's nothing downstream that would
// show "1900" to anyone.

import { useMemo } from 'react'

const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
]

// A year no real player was born in — used as "year not provided" so the
// underlying column can stay a plain `date` with no nullable year concept.
// Chosen instead of blank/NULL for the year component specifically because
// month/day alone isn't a valid `date` value.
const SENTINEL_YEAR = 1900

function daysInMonth(month: number): number {
  // Always allow 29 for February — the year is optional here, so a
  // specific leap-year check would be meaningless; better to permit the
  // one real calendar day that would otherwise be wrongly blocked.
  return [31, 29, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][month - 1] ?? 31
}

function parseDob(value: string): { day: string; month: string; year: string } {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value)
  if (!match) return { day: '', month: '', year: '' }
  const [, year, month, day] = match
  return { day, month, year: Number(year) === SENTINEL_YEAR ? '' : year }
}

interface DobInputProps {
  value: string
  onChange: (value: string) => void
}

export function DobInput({ value, onChange }: DobInputProps) {
  const { day, month, year } = useMemo(() => parseDob(value), [value])

  function emit(nextDay: string, nextMonth: string, nextYear: string) {
    if (!nextDay || !nextMonth) { onChange(''); return }
    const y = nextYear || String(SENTINEL_YEAR)
    onChange(`${y.padStart(4, '0')}-${nextMonth.padStart(2, '0')}-${nextDay.padStart(2, '0')}`)
  }

  const dayOptions = useMemo(() => {
    const max = month ? daysInMonth(Number(month)) : 31
    return Array.from({ length: max }, (_, i) => String(i + 1).padStart(2, '0'))
  }, [month])

  return (
    <div className="grid grid-cols-3 gap-2">
      <select
        value={day}
        onChange={e => emit(e.target.value, month, year)}
        className="form-input"
        aria-label="Day of birth"
      >
        <option value="">Day</option>
        {dayOptions.map(d => <option key={d} value={d}>{Number(d)}</option>)}
      </select>
      <select
        value={month}
        onChange={e => {
          const nextMonth = e.target.value
          // Clamp the selected day down if the new month has fewer days
          // than the one already picked (e.g. 31 -> Feb).
          const clampedDay = day && nextMonth && Number(day) > daysInMonth(Number(nextMonth))
            ? String(daysInMonth(Number(nextMonth))).padStart(2, '0')
            : day
          emit(clampedDay, nextMonth, year)
        }}
        className="form-input"
        aria-label="Month of birth"
      >
        <option value="">Month</option>
        {MONTHS.map((m, i) => <option key={m} value={String(i + 1).padStart(2, '0')}>{m}</option>)}
      </select>
      <input
        type="number"
        inputMode="numeric"
        placeholder="Year (optional)"
        value={year}
        min={1930}
        max={new Date().getFullYear()}
        onChange={e => emit(day, month, e.target.value)}
        className="form-input"
        aria-label="Year of birth (optional)"
      />
    </div>
  )
}
