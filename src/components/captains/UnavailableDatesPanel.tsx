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
// glance rather than a set of gaps with no context.
//
// Slot cells are deliberately terse — a booked slot is just a "view match"
// link (what it's for is explained once, in the legend, not repeated
// inline on every card) and a blocked slot reuses the admin schedule
// grid's own directional-arrow convention (src/components/schedule/
// ClashArrow.tsx) rather than inventing a second "here's why it's blocked"
// treatment. Both keep columns narrow enough to stay compact on a phone.

import React, { useEffect, useState } from 'react'
import Link from 'next/link'
import type { SlotTime } from '@/types'
import { getArrowDirection, ArrowIcon } from '@/components/schedule/ClashArrow'

export interface DaySlotInfo {
  time: SlotTime
  kind: 'unscheduled' | 'reserved' | 'booked' | 'blocked'
  bookingId?: string
  tournamentName?: string | null
  opponentName?: string | null
  // Only set for kind: 'blocked' — which other slot on the same day is
  // actually causing the clash, so the cell can point an arrow at it the
  // same way the admin schedule grid does.
  causeSlot?: SlotTime | null
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
  // Admin-only: view another captain's marked dates instead of the signed-in
  // user's own. Undefined/omitted means "my own dates" (the normal captain
  // path) — the API route itself re-checks isAdmin before honouring this,
  // never trusts the client alone. When set, the panel is read-only: an
  // admin browsing someone else's calendar can't accidentally write a mark
  // under their own player_id while looking at someone else's data.
  viewingPlayerId?: string
}

const FONT_UI   = "var(--font-rajdhani), sans-serif"
const FONT_DISP = "var(--font-cinzel), serif"

const SLOT_TIMES: SlotTime[] = ['07:30', '10:30', '12:30', '14:30']

export function UnavailableDatesPanel({ days, viewingPlayerId }: Props) {
  const readOnly = !!viewingPlayerId
  const [loaded, setLoaded] = useState(false)
  const [marked, setMarked] = useState<Record<string, Set<SlotTime>>>({})
  const [savingKey, setSavingKey] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    setLoaded(false)
    const url = viewingPlayerId
      ? `/api/player/future-availability?player_id=${viewingPlayerId}`
      : '/api/player/future-availability'
    fetch(url)
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
        setError('Could not load unavailable dates.')
        setLoaded(true)
      })
  }, [viewingPlayerId])

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
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '10px 16px', padding: '12px 16px', borderBottom: '1px solid #D4C9B0', background: '#F8F4EE' }}>
        <LegendItem swatchBg="transparent" swatchBorder="#D4C9B0" label={readOnly ? 'Not marked' : 'Tap to mark unavailable'} />
        <LegendItem swatchBg="#F3E8FF" swatchBorder="#C084FC" label={readOnly ? 'Marked unavailable' : 'Marked — tap to clear'} />
        <LegendLink color="#B91C1C" underline="#FCA5A5" sample="View match" label="Booked" />
        <LegendItem swatchBg="#FEF3C7" swatchBorder="#FCD34D" label="Reserved" />
        <LegendLink color="#78716C" underline="#D4C9B0" sample="Play in progress" label="Blocked by another slot that day" />
      </div>

      {error && (
        <p style={{ fontFamily: FONT_UI, fontSize: '12.5px', color: '#DC2626', padding: '10px 16px 0' }}>{error}</p>
      )}

      {!loaded ? (
        <p style={{ fontFamily: FONT_UI, fontSize: '13px', color: '#A8A29E', padding: '32px 20px', textAlign: 'center' }}>
          Loading…
        </p>
      ) : (
        <div style={{ maxHeight: 'calc(100vh - 320px)', minHeight: '360px', overflow: 'auto' }}>
          {/* table-layout: fixed + explicit widths keeps all four slot
              columns equal regardless of how much a given cell's text
              wants — content wraps within its column instead of forcing
              that column (and only that column) wider than its siblings. */}
          <table style={{ borderCollapse: 'separate', borderSpacing: 0, width: '100%', minWidth: '300px', tableLayout: 'fixed' }}>
            <thead style={{ position: 'sticky', top: 0, zIndex: 5 }}>
              <tr>
                <th style={{ background: '#EEEAE2', borderBottom: '2px solid #D4C9B0', borderRight: '1px solid #D4C9B0', padding: '6px 6px', textAlign: 'left', width: '24%' }}>
                  <span style={{ fontFamily: FONT_UI, fontSize: '10px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.1em', color: '#A8A29E' }}>Date</span>
                </th>
                {SLOT_TIMES.map(slot => (
                  <th key={slot} style={{ background: '#EEEAE2', borderBottom: '2px solid #D4C9B0', borderRight: '1px solid #D4C9B0', padding: '6px 2px', textAlign: 'center', width: '19%' }}>
                    <span style={{ display: 'block', fontFamily: FONT_DISP, fontSize: '11px', fontWeight: 700, color: '#B45309', whiteSpace: 'nowrap' }}>{slot}</span>
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
                        <td colSpan={5} style={{ background: '#E2DACE', borderBottom: '1px solid #D4C9B0', borderTop: idx === 0 ? 'none' : '2px solid #D4C9B0', padding: '5px 8px', fontFamily: FONT_UI, fontSize: '10.5px', fontWeight: 700, letterSpacing: '0.14em', textTransform: 'uppercase', color: '#D97706' }}>
                          {day.month}
                        </td>
                      </tr>
                    )}
                    <tr style={{ background: rowBg }}>
                      <td style={{ borderBottom: '1px solid #D4C9B0', borderRight: '1px solid #D4C9B0', padding: '6px', verticalAlign: 'middle' }}>
                        <span style={{
                          display: 'inline-block', fontFamily: FONT_UI,
                          fontSize: '9.5px', fontWeight: 700, letterSpacing: '0.05em',
                          padding: '1px 5px', borderRadius: '3px', marginBottom: '3px',
                          ...(isSat
                            ? { background: '#DBEAFE', color: '#1D4ED8', border: '1px solid #BFDBFE' }
                            : { background: '#FCE7F3', color: '#BE185D', border: '1px solid #FBCFE8' }),
                        }}>
                          {day.dow.toUpperCase()}
                        </span>
                        <span style={{ display: 'block', fontFamily: FONT_DISP, fontSize: '12px', fontWeight: 700, color: '#1C1917', whiteSpace: 'nowrap' }}>
                          {day.label.replace(/^\w+\s/, '')}
                        </span>
                        {!readOnly && unscheduledSlots.length > 1 && (
                          <button
                            type="button"
                            disabled={savingKey === wholeKey}
                            onClick={() => toggleWholeDay(day.date, unscheduledSlots)}
                            style={{
                              marginTop: '4px', fontFamily: FONT_UI, fontSize: '9px', fontWeight: 700, letterSpacing: '0.01em',
                              padding: '2px 6px', borderRadius: '4px', cursor: 'pointer', whiteSpace: 'nowrap',
                              background: allMarkedToday ? '#F3E8FF' : 'transparent',
                              borderWidth: '1px', borderStyle: 'solid',
                              borderColor: allMarkedToday ? '#C084FC' : '#D4C9B0',
                              color: allMarkedToday ? '#7E22CE' : '#A8A29E',
                              opacity: savingKey === wholeKey ? 0.5 : 1,
                            }}
                          >
                            {allMarkedToday ? '🚫 All day' : 'Mark day'}
                          </button>
                        )}
                      </td>
                      {day.slots.map(slot => (
                        <SlotCell
                          key={slot.time}
                          slot={slot}
                          isMarked={marked[day.date]?.has(slot.time) ?? false}
                          saving={savingKey === `${day.date}|${slot.time}`}
                          readOnly={readOnly}
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
    <div style={{ display: 'flex', alignItems: 'center', gap: '5px', fontFamily: FONT_UI, fontSize: '11px', color: '#78716C', whiteSpace: 'nowrap' }}>
      <span style={{ width: '10px', height: '10px', borderRadius: '3px', border: `1px solid ${swatchBorder}`, background: swatchBg, flexShrink: 0 }} />
      {label}
    </div>
  )
}

// For legend rows describing a cell that's plain underlined text now, not a
// coloured pill — shows the actual text sample instead of a colour swatch
// so the legend matches what the table cells really look like.
function LegendLink({ color, underline, sample, label }: { color: string; underline: string; sample: string; label: string }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '5px', fontFamily: FONT_UI, fontSize: '11px', color: '#78716C', whiteSpace: 'nowrap' }}>
      <span style={{ fontWeight: 700, color, textDecoration: 'underline', textDecorationColor: underline, textUnderlineOffset: '2px', fontSize: '10px' }}>
        {sample}
      </span>
      {label}
    </div>
  )
}

const cellStyle: React.CSSProperties = {
  borderBottom: '1px solid #D4C9B0', borderRight: '1px solid #D4C9B0', padding: '3px', verticalAlign: 'middle',
}

function SlotCell({
  slot, isMarked, saving, readOnly, onToggle,
}: {
  slot: DaySlotInfo
  isMarked: boolean
  saving: boolean
  readOnly: boolean
  onToggle: () => void
}) {
  if (slot.kind === 'unscheduled') {
    // A tappable "button" when the signed-in captain is looking at their
    // own dates — embossed so it reads as pressable at a glance, and
    // deliberately single-line/no-wrap since it's ever only one character.
    // An admin browsing someone else's calendar (readOnly) gets the same
    // visual treatment but disabled — it must never write under the
    // admin's own player_id while displaying another captain's marks.
    return (
      <td style={{ ...cellStyle, textAlign: 'center' }}>
        <button
          type="button"
          disabled={saving || readOnly}
          onClick={onToggle}
          title={readOnly ? undefined : (isMarked ? 'Tap to clear' : 'Tap to mark unavailable')}
          style={{
            width: '36px', height: '32px', borderRadius: '7px', borderWidth: '1px', borderStyle: 'solid',
            fontFamily: FONT_DISP, fontSize: '14px', fontWeight: 700, lineHeight: 1, whiteSpace: 'nowrap',
            cursor: readOnly ? 'default' : 'pointer', opacity: saving ? 0.5 : 1,
            ...(isMarked
              ? {
                  background: 'linear-gradient(180deg, #F3E8FF 0%, #E9D5FF 100%)',
                  borderColor: '#C084FC', color: '#7E22CE',
                  boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.6), 0 1px 2px rgba(126,34,206,0.25)',
                }
              : {
                  background: 'linear-gradient(180deg, #FFFFFF 0%, #F1EAD9 100%)',
                  borderColor: '#D4C9B0', color: '#A8A29E',
                  boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.9), 0 1px 2px rgba(28,25,23,0.1)',
                }),
          }}
        >
          L
        </button>
      </td>
    )
  }

  if (slot.kind === 'reserved') {
    return (
      <td style={{ ...cellStyle, textAlign: 'center' }}>
        <div style={{
          height: '32px', borderRadius: '5px', border: '1px solid #FCD34D', background: '#FEF3C7',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontFamily: FONT_UI, fontSize: '10px', fontWeight: 700, color: '#92400E', whiteSpace: 'nowrap',
        }}>
          Reserved
        </div>
      </td>
    )
  }

  if (slot.kind === 'booked') {
    // Deliberately terse — what "booked" means is explained once in the
    // legend, not repeated on every card. Plain link text, no pill —
    // matches the /schedule page's own preference for text-with-link over
    // a bordered/filled tile.
    const text = (
      <span style={{
        display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '32px', padding: '2px 1px',
        fontFamily: FONT_UI, fontSize: '10px', fontWeight: 700, color: '#B91C1C', whiteSpace: 'normal', lineHeight: 1.15, textAlign: 'center',
        textDecoration: 'underline', textDecorationColor: '#FCA5A5', textUnderlineOffset: '2px',
      }}>
        View match
      </span>
    )
    return (
      <td style={{ ...cellStyle, textAlign: 'center' }}>
        {slot.bookingId ? <Link href={`/fixtures/${slot.bookingId}`}>{text}</Link> : text}
      </td>
    )
  }

  // 'blocked' — same directional-arrow convention as the admin schedule
  // grid's clash cell, pointing at whichever slot is actually causing it.
  // Plain link text, no pill, same as the booked cell above.
  const arrowDir = getArrowDirection(slot.time, slot.causeSlot ?? null, false)
  const text = (
    <span style={{
      display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '2px', minHeight: '32px', padding: '2px 1px',
      fontFamily: FONT_UI, fontSize: '9px', fontWeight: 700, color: '#78716C', whiteSpace: 'normal', lineHeight: 1.15, textAlign: 'center',
      textDecoration: slot.bookingId ? 'underline' : 'none', textDecorationColor: '#D4C9B0', textUnderlineOffset: '2px',
    }}>
      {arrowDir && <ArrowIcon direction={arrowDir} />}
      <span>Play in progress</span>
    </span>
  )
  return (
    <td style={{ ...cellStyle, textAlign: 'center' }}>
      {slot.bookingId ? <Link href={`/fixtures/${slot.bookingId}`}>{text}</Link> : text}
    </td>
  )
}
