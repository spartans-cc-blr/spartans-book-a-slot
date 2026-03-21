'use client'
// FixturesWeekend.tsx
// Exports FixturesWeekendGroup — renders all cards + availability rows for one weekend.
// Owns a single shared weekendResponses state so validation is live across all cards.

import { useState } from 'react'
import { FixturesCard } from '@/components/fixtures/FixturesCard'
import { FixturesAvailability } from '@/components/fixtures/FixturesAvailability'

type AvailKey = 'Y' | 'O' | 'E' | 'L'

interface BookingEntry {
  id:              string
  game_date:       string
  slot_time:       string
  initialResponse: string | null
  cardData:        any  // full booking object for FixturesCard
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
          <FixturesCard booking={b.cardData} />
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
          />
        </div>
      ))}
    </>
  )
}
