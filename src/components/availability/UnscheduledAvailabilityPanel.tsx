'use client'

// Lets a signed-in, non-expelled player pre-fill their general availability
// for upcoming Sat/Sun dates that don't have a real booking yet — distinct
// from FixturesAvailability, which only ever operates on a real booking_id.
// See /api/player/future-availability and player_future_availability
// (migration 067). Reachable by every active player from its own nav
// sub-menu item (Matches ▾ → Unscheduled Slots), not gated behind Captains'
// Corner — the underlying data feeds getSuggestedOpenDates()'s
// captain-availability exclusion and R8's slot-precise warning, both of
// which key off ANY player's response, not just a captain's.
//
// `dates` is pre-filtered server-side (src/app/unscheduled-availability/page.tsx)
// to only the (game_date, openSlots) combinations that don't already carry a
// real booking — a date with every slot already booked never reaches this
// component at all, and a date with only some slots booked only ever shows
// the remaining open ones, both in the whole-day quick actions and the
// per-slot expand.

import { useEffect, useState } from 'react'
import { parseISO, format as formatDate } from 'date-fns'
import type { SlotTime } from '@/types'

type RespCode = 'Y' | 'O' | 'E' | 'L'

// Same colours as CaptainsCornerGrid's RESP legend — kept as its own copy
// here rather than importing a non-exported const from that file.
const RESP: Record<RespCode, { bg: string; text: string; border: string; label: string }> = {
  Y: { bg: '#14532d', text: '#86efac', border: '#22c55e', label: 'Available' },
  E: { bg: '#1e3a5f', text: '#93c5fd', border: '#3b82f6', label: 'Either game today — one only' },
  O: { bg: '#431407', text: '#fdba74', border: '#f97316', label: 'One game this weekend only' },
  L: { bg: '#2e1a47', text: '#d8b4fe', border: '#a855f7', label: 'On leave' },
}

type DayResponses = Partial<Record<SlotTime, RespCode>>

export interface OpenDate {
  game_date: string
  openSlots: SlotTime[]
}

interface Props {
  dates: OpenDate[]
}

export function UnscheduledAvailabilityPanel({ dates }: Props) {
  const [loaded, setLoaded] = useState(false)
  const [responses, setResponses] = useState<Record<string, DayResponses>>({})
  const [expanded, setExpanded] = useState<Set<string>>(new Set())
  const [savingKey, setSavingKey] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    fetch('/api/player/future-availability')
      .then(r => r.json())
      .then(d => {
        const next: Record<string, DayResponses> = {}
        for (const row of d.availability ?? []) {
          if (!next[row.game_date]) next[row.game_date] = {}
          next[row.game_date][row.slot_time as SlotTime] = row.response as RespCode
        }
        setResponses(next)
        setLoaded(true)
      })
      .catch(() => setError('Could not load your availability.'))
  }, [])

  function toggleExpand(date: string) {
    setExpanded(prev => {
      const next = new Set(prev)
      if (next.has(date)) next.delete(date)
      else next.add(date)
      return next
    })
  }

  // Applies to only this date's own open slots (from props) — never the
  // fixed 4, since a slot that's already booked shouldn't get a
  // future-availability write at all (that's what real availability on the
  // booking itself is for).
  async function setWholeDay(date: string, openSlots: SlotTime[], response: RespCode) {
    const key = `${date}|whole`
    setSavingKey(key)
    setError(null)
    try {
      const results = await Promise.all(
        openSlots.map(slot =>
          fetch('/api/player/future-availability', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ game_date: date, slot_time: slot, response }),
          })
        )
      )
      if (results.every(r => r.ok)) {
        setResponses(prev => ({
          ...prev,
          [date]: { ...(prev[date] ?? {}), ...Object.fromEntries(openSlots.map(s => [s, response])) },
        }))
      } else {
        setError(`Save failed for one or more slots`)
      }
    } catch {
      setError('Network error — check connection')
    } finally {
      setSavingKey(null)
    }
  }

  async function setSlot(date: string, slot: SlotTime, response: RespCode) {
    const key = `${date}|${slot}`
    const current = responses[date]?.[slot]
    const clearing = current === response // tap active = clear, same convention as FixturesAvailability
    setSavingKey(key)
    setError(null)
    try {
      if (clearing) {
        const res = await fetch('/api/player/future-availability', {
          method: 'DELETE',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ game_date: date, slot_time: slot }),
        })
        if (res.ok) {
          setResponses(prev => {
            const day = { ...(prev[date] ?? {}) }
            delete day[slot]
            return { ...prev, [date]: day }
          })
        } else {
          const d = await res.json().catch(() => ({}))
          setError(d.error ?? `Save failed (${res.status})`)
        }
      } else {
        const res = await fetch('/api/player/future-availability', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ game_date: date, slot_time: slot, response }),
        })
        if (res.ok) {
          setResponses(prev => ({
            ...prev,
            [date]: { ...(prev[date] ?? {}), [slot]: response },
          }))
        } else {
          const d = await res.json().catch(() => ({}))
          setError(d.error ?? `Save failed (${res.status})`)
        }
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
            const dayResp = responses[game_date] ?? {}
            const isExpanded = expanded.has(game_date)
            const label = formatDate(parseISO(game_date), 'EEE d MMM')
            return (
              <div key={game_date} className="bg-ink-4 border border-ink-5 rounded px-3 py-2.5">
                <div className="flex items-center justify-between gap-2 flex-wrap">
                  <span className="font-rajdhani text-sm font-semibold text-zinc-300">{label}</span>
                  <div className="flex items-center gap-1.5">
                    {(['Y', 'L'] as RespCode[]).map(code => {
                      const wholeKey = `${game_date}|whole`
                      const allMatch = openSlots.every(s => dayResp[s] === code)
                      return (
                        <button
                          key={code}
                          type="button"
                          disabled={savingKey === wholeKey}
                          onClick={() => setWholeDay(game_date, openSlots, code)}
                          className="font-rajdhani text-[11px] font-bold px-2 py-1 rounded-sm disabled:opacity-50"
                          style={{
                            background: allMatch ? RESP[code].bg : 'transparent',
                            color: allMatch ? RESP[code].text : '#71717a',
                            border: `1px solid ${allMatch ? RESP[code].border : '#3f3f46'}`,
                          }}
                        >
                          {code === 'Y' ? 'Available' : 'Unavailable'}
                        </button>
                      )
                    })}
                    {openSlots.length > 1 && (
                      <button
                        type="button"
                        onClick={() => toggleExpand(game_date)}
                        className="font-rajdhani text-[11px] text-zinc-500 hover:text-zinc-300 px-1.5"
                      >
                        {isExpanded ? '▲ per-slot' : '▸ per-slot'}
                      </button>
                    )}
                  </div>
                </div>

                {openSlots.length === 1 && (
                  <p className="font-rajdhani text-[11px] text-zinc-600 mt-1">
                    Only {openSlots[0]} is unbooked this day — the rest already have a game.
                  </p>
                )}

                {isExpanded && openSlots.length > 1 && (
                  <div className="mt-2 pt-2 border-t border-ink-5 space-y-1.5">
                    {openSlots.map(slot => (
                      <div key={slot} className="flex items-center justify-between gap-2">
                        <span className="font-rajdhani text-xs text-zinc-500 w-12">{slot}</span>
                        <div className="flex items-center gap-1.5">
                          {(['Y', 'O', 'E', 'L'] as RespCode[]).map(code => {
                            const active = dayResp[slot] === code
                            const key = `${game_date}|${slot}`
                            return (
                              <button
                                key={code}
                                type="button"
                                disabled={savingKey === key}
                                onClick={() => setSlot(game_date, slot, code)}
                                title={RESP[code].label}
                                className="font-rajdhani text-[11px] font-bold w-6 h-5 flex items-center justify-center rounded-sm disabled:opacity-50"
                                style={{
                                  background: active ? RESP[code].bg : 'transparent',
                                  color: active ? RESP[code].text : '#52525b',
                                  border: `1px solid ${active ? RESP[code].border : '#3f3f46'}`,
                                }}
                              >
                                {code}
                              </button>
                            )
                          })}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
