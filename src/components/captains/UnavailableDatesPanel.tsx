'use client'

// Captain-only: mark dates/slots you already know you can't lead a game,
// before a real booking even exists. This is the sole write path into
// player_future_availability now — 'L' only, no Y/O/E — since nothing has
// ever consumed anything but a captain's own 'L' (see
// getSuggestedOpenDates()'s day-level exclusion and R8's exact-slot warning
// in src/lib/suggestedSlots.ts / src/lib/validation.ts). Reachable from the
// Captains' Corner ▾ nav dropdown, not player-facing.
//
// `dates` is pre-filtered server-side
// (src/app/captains-corner/unavailable-dates/page.tsx) to only the
// (game_date, openSlots) combinations that don't already carry a real
// booking, via the same computeSlotStatus() engine the admin schedule grid
// uses — a date with every slot already booked never reaches this
// component at all.

import { useEffect, useState } from 'react'
import { parseISO, format as formatDate } from 'date-fns'
import type { SlotTime } from '@/types'

const MARKED_BG     = '#2e1a47'
const MARKED_TEXT   = '#d8b4fe'
const MARKED_BORDER = '#a855f7'

export interface OpenDate {
  game_date: string
  openSlots: SlotTime[]
}

interface Props {
  dates: OpenDate[]
}

export function UnavailableDatesPanel({ dates }: Props) {
  const [loaded, setLoaded] = useState(false)
  const [unavailable, setUnavailable] = useState<Record<string, Set<SlotTime>>>({})
  const [savingKey, setSavingKey] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    fetch('/api/player/future-availability')
      .then(r => r.json())
      .then(d => {
        const next: Record<string, Set<SlotTime>> = {}
        for (const row of d.availability ?? []) {
          if (row.response !== 'L') continue
          if (!next[row.game_date]) next[row.game_date] = new Set()
          next[row.game_date].add(row.slot_time as SlotTime)
        }
        setUnavailable(next)
        setLoaded(true)
      })
      .catch(() => setError('Could not load your unavailable dates.'))
  }, [])

  async function toggleSlot(date: string, slot: SlotTime) {
    const key = `${date}|${slot}`
    const isMarked = unavailable[date]?.has(slot) ?? false
    setSavingKey(key)
    setError(null)
    try {
      const res = await fetch('/api/player/future-availability', {
        method: isMarked ? 'DELETE' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(
          isMarked
            ? { game_date: date, slot_time: slot }
            : { game_date: date, slot_time: slot, response: 'L' }
        ),
      })
      if (res.ok) {
        setUnavailable(prev => {
          const set = new Set(prev[date] ?? [])
          if (isMarked) set.delete(slot); else set.add(slot)
          return { ...prev, [date]: set }
        })
      } else {
        const d = await res.json().catch(() => ({}))
        setError(d.error ?? `Save failed (${res.status})`)
      }
    } catch {
      setError('Network error — check connection')
    } finally {
      setSavingKey(null)
    }
  }

  async function toggleWholeDay(date: string, openSlots: SlotTime[]) {
    const key = `${date}|whole`
    const allMarked = openSlots.every(s => unavailable[date]?.has(s))
    setSavingKey(key)
    setError(null)
    try {
      const results = await Promise.all(
        openSlots.map(slot =>
          fetch('/api/player/future-availability', {
            method: allMarked ? 'DELETE' : 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(
              allMarked
                ? { game_date: date, slot_time: slot }
                : { game_date: date, slot_time: slot, response: 'L' }
            ),
          })
        )
      )
      if (results.every(r => r.ok)) {
        setUnavailable(prev => ({ ...prev, [date]: allMarked ? new Set() : new Set(openSlots) }))
      } else {
        setError('Save failed for one or more slots')
      }
    } catch {
      setError('Network error — check connection')
    } finally {
      setSavingKey(null)
    }
  }

  if (dates.length === 0) {
    return (
      <p className="font-rajdhani text-sm text-zinc-500">
        Every upcoming weekend is already fully scheduled — check back later.
      </p>
    )
  }

  return (
    <div className="space-y-3">
      {error && <p className="font-rajdhani text-xs text-red-400">{error}</p>}

      {!loaded ? (
        <p className="font-rajdhani text-xs text-zinc-600">Loading…</p>
      ) : (
        <div className="space-y-2">
          {dates.map(({ game_date, openSlots }) => {
            const marked = unavailable[game_date] ?? new Set<SlotTime>()
            const allMarked = openSlots.length > 1 && openSlots.every(s => marked.has(s))
            const label = formatDate(parseISO(game_date), 'EEE d MMM')
            const wholeKey = `${game_date}|whole`
            return (
              <div key={game_date} className="bg-ink-4 border border-ink-5 rounded px-3 py-2.5">
                <div className="flex items-center justify-between gap-2 flex-wrap">
                  <span className="font-rajdhani text-sm font-semibold text-zinc-300">{label}</span>
                  {openSlots.length > 1 && (
                    <button
                      type="button"
                      disabled={savingKey === wholeKey}
                      onClick={() => toggleWholeDay(game_date, openSlots)}
                      className="font-rajdhani text-[11px] font-bold px-2 py-1 rounded-sm disabled:opacity-50"
                      style={{
                        background: allMarked ? MARKED_BG : 'transparent',
                        color: allMarked ? MARKED_TEXT : '#71717a',
                        border: `1px solid ${allMarked ? MARKED_BORDER : '#3f3f46'}`,
                      }}
                    >
                      {allMarked ? '🚫 Unavailable all day' : 'Mark whole day unavailable'}
                    </button>
                  )}
                </div>

                <div className="mt-2 flex flex-wrap gap-1.5">
                  {openSlots.map(slot => {
                    const isMarked = marked.has(slot)
                    const key = `${game_date}|${slot}`
                    return (
                      <button
                        key={slot}
                        type="button"
                        disabled={savingKey === key}
                        onClick={() => toggleSlot(game_date, slot)}
                        title={isMarked ? 'Tap to clear' : 'Tap to mark unavailable'}
                        className="font-rajdhani text-[11px] font-bold px-2.5 py-1 rounded-sm disabled:opacity-50"
                        style={{
                          background: isMarked ? MARKED_BG : 'transparent',
                          color: isMarked ? MARKED_TEXT : '#a1a1aa',
                          border: `1px solid ${isMarked ? MARKED_BORDER : '#3f3f46'}`,
                        }}
                      >
                        {slot}{isMarked ? ' 🚫' : ''}
                      </button>
                    )
                  })}
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
