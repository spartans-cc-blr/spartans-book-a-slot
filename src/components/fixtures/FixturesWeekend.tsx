'use client'
// FixturesWeekend.tsx
// Exports FixturesWeekendGroup — renders all cards + availability rows for one weekend.
// Owns a single shared weekendResponses state so validation is live across all cards.

import { useState } from 'react'
import { FixturesCard } from '@/components/fixtures/FixturesCard'
import { FixturesAvailability } from '@/components/fixtures/FixturesAvailability'

type AvailKey = 'Y' | 'O' | 'E' | 'L'

interface SquadPlayer {
  id: string
  name: string
  is_match_captain: boolean
  is_vc: boolean
  is_wk: boolean
}

interface BookingEntry {
  id:              string
  game_date:       string
  slot_time:       string
  initialResponse: string | null
  matchStatus:     'upcoming' | 'in_progress'   // add this
  squad:           SquadPlayer[] 
  cardData:        any
  hasDues:         boolean
  squadAnnounced:  boolean
  slotLocked:      boolean
}

interface Props {
  isPlayer:                boolean
  isCaptain:               boolean
  bookings:                BookingEntry[]
  initialWeekendResponses: Record<string, string>
}

export function FixturesWeekendGroup({
  isPlayer,
  isCaptain,
  bookings,
  initialWeekendResponses,
}: Props) {
  // Single shared responses map — all cards in this weekend read/write here
  const [weekendResponses, setWeekendResponses] = useState<Record<string, string>>(
    initialWeekendResponses
  )
  const [savingMap, setSavingMap] = useState<Record<string, boolean>>({})
  const [errorMap,  setErrorMap]  = useState<Record<string, string | null>>({})

  // weekendBookings = slim version used for validation context
  const weekendBookings = bookings.map(b => ({
    id:        b.id,
    game_date: b.game_date,
    slot_time: b.slot_time,
  }))

  async function handleSelect(bookingId: string, code: AvailKey | null) {
    if (!isPlayer) return

    const current     = (weekendResponses[bookingId] ?? null) as AvailKey | null
    const newResponse = current === code ? null : code   // tap active = clear

    setErrorMap(prev  => ({ ...prev,  [bookingId]: null  }))
    setSavingMap(prev => ({ ...prev, [bookingId]: true }))

    try {
      if (newResponse === null) {
        const res = await fetch('/api/player-availability', {
          method: 'DELETE',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ booking_id: bookingId }),
        })
        if (res.ok) {
          setWeekendResponses(prev => {
            const n = { ...prev }; delete n[bookingId]; return n
          })
        } else {
          const d = await res.json().catch(() => ({}))
          setErrorMap(prev => ({ ...prev, [bookingId]: d.error ?? `Save failed (${res.status})` }))
        }
      } else {
        const res = await fetch('/api/player-availability', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ booking_id: bookingId, response: newResponse }),
        })
        if (res.ok) {
          setWeekendResponses(prev => ({ ...prev, [bookingId]: newResponse }))
        } else {
          const d = await res.json().catch(() => ({}))
          setErrorMap(prev => ({ ...prev, [bookingId]: d.error ?? `Save failed (${res.status})` }))
        }
      }
    } catch {
      setErrorMap(prev => ({ ...prev, [bookingId]: 'Network error — check connection' }))
    } finally {
      setSavingMap(prev => ({ ...prev, [bookingId]: false }))
    }
  }

  return (
    <>
      {bookings.map(b => (
        <div key={b.id} className="mb-4">
          <FixturesCard booking={{ ...b.cardData, squad: b.squad }} />
                    {b.slotLocked || b.squadAnnounced ? (
            <div style={{
              marginTop: '-6px', padding: '10px 16px',
              background: '#111827', border: '1px solid #2D3748',
              borderTop: 'none', borderRadius: '0 0 12px 12px',
            }}>
              <p style={{ fontSize: '11px', color: '#6B7280', fontFamily: "'DM Sans', sans-serif" }}>
                {b.squadAnnounced
                  ? '✓ Squad announced — availability closed'
                  : '🔒 Slot frozen — 13 players confirmed'}
             </p>
           </div>
          ) : b.hasDues ? (
            <div style={{
              marginTop: '-6px', padding: '10px 16px',
             background: '#111827', border: '1px solid #2D3748',
              borderTop: 'none', borderRadius: '0 0 12px 12px',
            }}>
              <p style={{ fontSize: '11px', color: '#92400e', fontFamily: "'DM Sans', sans-serif" }}>
                ⚠ Outstanding dues — contact admin to update availability
              </p>
            </div>
          ) : (
          <FixturesAvailability
            bookingId={b.id}
            slotDate={b.game_date}
            isPlayer={isPlayer}
            isCaptain={isCaptain}
            response={(weekendResponses[b.id] ?? null) as AvailKey | null}
            saving={savingMap[b.id] ?? false}
            error={errorMap[b.id]  ?? null}
            weekendResponses={weekendResponses}
            weekendBookings={weekendBookings}
            onSelect={handleSelect}
            hasDues={b.hasDues}
            squadAnnounced={b.squadAnnounced}
            slotLocked={b.slotLocked}
          />
)}
        </div>
      ))}
    </>
  )
}
