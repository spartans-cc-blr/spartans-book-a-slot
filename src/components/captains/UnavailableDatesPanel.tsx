'use client'

// Captain-only: mark dates/slots you already know you can't lead a game,
// before a real booking even exists. This is the sole write path into
// player_future_availability now — 'L' only, no Y/O/E — since nothing has
// ever consumed anything but a captain's own 'L' (see
// getSuggestedOpenDates()'s day-level exclusion and R8's exact-slot warning
// in src/lib/suggestedSlots.ts / src/lib/validation.ts). Reachable from the
// Captains' Corner ▾ nav dropdown, not player-facing.
//
// Layout mirrors the public /schedule page's own table structure (one
// continuous scroll, sticky header, inline month-divider rows) and its
// warm-light theme — see src/app/schedule/page.tsx for the reference this
// was built against. Unlike /schedule, every day passed in here shows all
// four slots, not just open ones: `days` is pre-computed server-side
// (src/app/captains-corner/unavailable-dates/page.tsx) via the same
// computeSlotStatus() engine the admin schedule grid uses, and only
// includes a day at all if it has at least one slot the captain can
// actually mark — but once a day qualifies, its booked/reserved/blocked
// slots are shown too, read-only, so the captain sees the whole day at a
// glance rather than a set of gaps with no context. Booked and blocked
// slots link straight through to the real /fixtures/[id] match card
// (blocked resolves to whichever booking is actually causing the clash,
// via getClashSource() — never a dead end).

import React, { useEffect, useState } from 'react'
import Link from 'next/link'
import { parseISO, format as formatDate } from 'date-fns'
import type { SlotTime } from '@/types'

export interface DaySlotInfo {
  time: SlotTime
  kind: 'unscheduled' | 'reserved' | 'booked' | 'blocked'
  bookingId?: string
  tournamentName?: string | null
  opponentName?: string | null
}

export interface DayInfo {
  date: string
  label: string
  dow: 'Sat' | 'Sun'
  month: string
  slots: DaySlotInfo[]
}

interface Props {
  days: DayInfo[]
}

const FONT_UI   = "var(--font-rajdhani), sans-serif"
const FONT_DISP = "var(--font-cinzel), serif"

const SLOT_TIMES: SlotTime[] = ['07:30', '10:30', '12:30', '14:30']

export function UnavailableDatesPanel({ days }: Props) {
  const [loaded, setLoaded] = useState(false)
  const [marked, setMarked] = useState<Record<string, Set<SlotTime>>>({})
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
        setMarked(next)
        setLoaded(true)
      })
      .catch(() => {
        setError('Could not load your unavailable dates.')
        setLoaded(true)
      })
  }, [])

  async function toggleSlot(date: string, slot: SlotTime) {
    const key = `${date}|${slot}`
    const isMarked = marked[date]?.has(slot) ?? false
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
        setMarked(prev => {
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

  async function toggleWholeDay(date: string, unscheduledSlots: SlotTime[]) {
    const key = `${date}|whole`
    const allMarked = unscheduledSlots.every(s => marked[date]?.has(s))
    setSavingKey(key)
    setError(null)
    try {
      const results = await Promise.all(
        unscheduledSlots.map(slot =>
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
        setMarked(prev => ({ ...prev, [date]: allMarked ? new Set() : new Set(unscheduledSlots) }))
      } else {
        setError('Save failed for one or more slots')
      }
    } catch {
      setError('Network error — check connection')
    } finally {
      setSavingKey(null)
    }
  }

  if (days.length === 0) {
    return (
      <p style={{ fontFamily: FONT_UI, fontSize: '14px', color: '#78716C', padding: '48px 20px', textAlign: 'center' }}>
        Every upcoming weekend is already fully scheduled — check back later.
      </p>
    )
  }

  return (
    <div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '16px', padding: '14px 20px', borderBottom: '1px solid #D4C9B0', background: '#F8F4EE' }}>
        <LegendItem swatchBg="transparent" swatchBorder="#D4C9B0" label="Unmarked — tap to mark unavailable" />
        <LegendItem swatchBg="#F3E8FF" swatchBorder="#C084FC" label="Marked — tap to clear" />
        <LegendItem swatchBg="#FEE2E2" swatchBorder="#FCA5A5" label="Booked — tap to view match" />
        <LegendItem swatchBg="#FEF3C7" swatchBorder="#FCD34D" label="Reserved" />
        <LegendItem swatchBg="#E2DACE" swatchBorder="#D4C9B0" label="Blocked — tap to view the match causing it" />
      </div>

      {error && (
        <p style={{ fontFamily: FONT_UI, fontSize: '12.5px', color: '#DC2626', padding: '10px 20px 0' }}>{error}</p>
      )}

      {!loaded ? (
        <p style={{ fontFamily: FONT_UI, fontSize: '13px', color: '#A8A29E', padding: '32px 20px', textAlign: 'center' }}>
          Loading…
        </p>
      ) : (
        <div style={{ maxHeight: 'calc(100vh - 340px)', minHeight: '360px', overflow: 'auto' }}>
          <table style={{ borderCollapse: 'separate', borderSpacing: 0, width: '100%', minWidth: '620px' }}>
            <thead style={{ position: 'sticky', top: 0, zIndex: 5 }}>
              <tr>
                <th style={{ background: '#EEEAE2', borderBottom: '2px solid #D4C9B0', borderRight: '1px solid #D4C9B0', padding: '10px 14px', textAlign: 'left', minWidth: '112px' }}>
                  <span style={{ fontFamily: FONT_UI, fontSize: '11px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.12em', color: '#A8A29E' }}>Date</span>
                </th>
                {SLOT_TIMES.map(slot => (
                  <th key={slot} style={{ background: '#EEEAE2', borderBottom: '2px solid #D4C9B0', borderRight: '1px solid #D4C9B0', padding: '10px 6px', textAlign: 'center', minWidth: '128px' }}>
                    <span style={{ display: 'block', fontFamily: FONT_DISP, fontSize: '12.5px', fontWeight: 700, color: '#B45309' }}>{slot}</span>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {days.map((day, idx) => {
                const isSat     = day.dow === 'Sat'
                const rowBg     = isSat ? '#F8F4EE' : '#EEEAE2'
                const prevMonth = days[idx - 1]?.month ?? null
                const showMonth = day.month !== prevMonth

                const unscheduledSlots = day.slots.filter(s => s.kind === 'unscheduled').map(s => s.time)
                const allMarkedToday   = unscheduledSlots.length > 0 && unscheduledSlots.every(t => marked[day.date]?.has(t))
                const wholeKey         = `${day.date}|whole`

                return (
                  <FragmentRow key={day.date}>
                    {showMonth && (
                      <tr>
                        <td colSpan={5} style={{ background: '#E2DACE', borderBottom: '1px solid #D4C9B0', borderTop: idx === 0 ? 'none' : '2px solid #D4C9B0', padding: '6px 14px', fontFamily: FONT_UI, fontSize: '11px', fontWeight: 700, letterSpacing: '0.15em', textTransform: 'uppercase', color: '#D97706' }}>
                          {day.month}
                        </td>
                      </tr>
                    )}
                    <tr style={{ background: rowBg }}>
                      <td style={{ borderBottom: '1px solid #D4C9B0', borderRight: '1px solid #D4C9B0', padding: '10px 14px', verticalAlign: 'middle' }}>
                        <span style={{
                          display: 'inline-block', fontFamily: FONT_UI,
                          fontSize: '10.5px', fontWeight: 700, letterSpacing: '0.06em',
                          padding: '1px 6px', borderRadius: '3px', marginBottom: '4px',
                          ...(isSat
                            ? { background: '#DBEAFE', color: '#1D4ED8', border: '1px solid #BFDBFE' }
                            : { background: '#FCE7F3', color: '#BE185D', border: '1px solid #FBCFE8' }),
                        }}>
                          {day.dow.toUpperCase()}
                        </span>
                        <span style={{ display: 'block', fontFamily: FONT_DISP, fontSize: '13px', fontWeight: 700, color: '#1C1917' }}>
                          {day.label.replace(/^\w+\s/, '')}
                        </span>
                        {unscheduledSlots.length > 1 && (
                          <button
                            type="button"
                            disabled={savingKey === wholeKey}
                            onClick={() => toggleWholeDay(day.date, unscheduledSlots)}
                            style={{
                              marginTop: '6px', fontFamily: FONT_UI, fontSize: '10px', fontWeight: 700, letterSpacing: '0.02em',
                              padding: '3px 8px', borderRadius: '4px', cursor: 'pointer', whiteSpace: 'nowrap',
                              background: allMarkedToday ? '#F3E8FF' : 'transparent',
                              borderWidth: '1px', borderStyle: 'solid',
                              borderColor: allMarkedToday ? '#C084FC' : '#D4C9B0',
                              color: allMarkedToday ? '#7E22CE' : '#A8A29E',
                              opacity: savingKey === wholeKey ? 0.5 : 1,
                            }}
                          >
                            {allMarkedToday ? '🚫 Unavailable all day' : 'Mark whole day'}
                          </button>
                        )}
                      </td>
                      {day.slots.map(slot => (
                        <SlotCell
                          key={slot.time}
                          slot={slot}
                          isMarked={marked[day.date]?.has(slot.time) ?? false}
                          saving={savingKey === `${day.date}|${slot.time}`}
                          onToggle={() => toggleSlot(day.date, slot.time)}
                        />
                      ))}
                    </tr>
                  </FragmentRow>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

// Plain passthrough — lets each day contribute either one or two <tr>s
// (an optional month divider plus its own row) without an extra wrapper
// element breaking the table's row/cell structure.
function FragmentRow({ children }: { children: React.ReactNode }) {
  return <>{children}</>
}

function LegendItem({ swatchBg, swatchBorder, label }: { swatchBg: string; swatchBorder: string; label: string }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontFamily: FONT_UI, fontSize: '12px', color: '#78716C' }}>
      <span style={{ width: '11px', height: '11px', borderRadius: '3px', border: `1px solid ${swatchBorder}`, background: swatchBg, flexShrink: 0 }} />
      {label}
    </div>
  )
}

function SlotCell({
  slot, isMarked, saving, onToggle,
}: {
  slot: DaySlotInfo
  isMarked: boolean
  saving: boolean
  onToggle: () => void
}) {
  const cellStyle: React.CSSProperties = {
    borderBottom: '1px solid #D4C9B0', borderRight: '1px solid #D4C9B0', padding: '4px', verticalAlign: 'middle',
  }
  const boxBase: React.CSSProperties = {
    minHeight: '48px', borderRadius: '5px', borderWidth: '1px', borderStyle: 'solid',
    display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '1px',
    textAlign: 'center', padding: '6px 4px', fontFamily: FONT_UI, textDecoration: 'none',
  }

  if (slot.kind === 'unscheduled') {
    return (
      <td style={cellStyle}>
        <button
          type="button"
          disabled={saving}
          onClick={onToggle}
          title={isMarked ? 'Tap to clear' : 'Tap to mark unavailable'}
          style={{
            ...boxBase, width: '100%', cursor: 'pointer', opacity: saving ? 0.5 : 1,
            background: isMarked ? '#F3E8FF' : 'transparent',
            borderColor: isMarked ? '#C084FC' : '#D4C9B0',
            color: isMarked ? '#7E22CE' : '#A8A29E',
          }}
        >
          <span style={{ fontFamily: FONT_DISP, fontSize: '15px', fontWeight: 700 }}>L</span>
        </button>
      </td>
    )
  }

  if (slot.kind === 'reserved') {
    return (
      <td style={cellStyle}>
        <div style={{ ...boxBase, background: '#FEF3C7', borderColor: '#FCD34D', color: '#92400E', cursor: 'default' }}>
          <span style={{ fontSize: '11.5px', fontWeight: 700 }}>Reserved</span>
          {slot.tournamentName && (
            <span style={{ fontSize: '9.5px', opacity: 0.85, lineHeight: 1.2 }}>{slot.tournamentName}</span>
          )}
        </div>
      </td>
    )
  }

  if (slot.kind === 'booked') {
    const box = (
      <div style={{ ...boxBase, width: '100%', background: '#FEE2E2', borderColor: '#FCA5A5', color: '#B91C1C', cursor: slot.bookingId ? 'pointer' : 'default' }}>
        <span style={{ fontSize: '11.5px', fontWeight: 700 }}>{slot.tournamentName ?? 'Booked'}</span>
        {slot.opponentName && (
          <span style={{ fontSize: '9.5px', opacity: 0.85 }}>vs {slot.opponentName}</span>
        )}
        {slot.bookingId && <span style={{ fontSize: '9px', opacity: 0.6, marginTop: '1px' }}>↗ view match</span>}
      </div>
    )
    return (
      <td style={cellStyle}>
        {slot.bookingId ? <Link href={`/fixtures/${slot.bookingId}`}>{box}</Link> : box}
      </td>
    )
  }

  // 'blocked' — resolved to the booking actually causing the clash, when known.
  const box = (
    <div style={{ ...boxBase, width: '100%', background: '#E2DACE', borderColor: '#D4C9B0', color: '#78716C', cursor: slot.bookingId ? 'pointer' : 'default' }}>
      <span style={{ fontSize: '11.5px', fontWeight: 700 }}>Play in progress</span>
      {slot.bookingId && <span style={{ fontSize: '9px', opacity: 0.6, marginTop: '1px' }}>↗ view match</span>}
    </div>
  )
  return (
    <td style={cellStyle}>
      {slot.bookingId ? <Link href={`/fixtures/${slot.bookingId}`}>{box}</Link> : box}
    </td>
  )
}
