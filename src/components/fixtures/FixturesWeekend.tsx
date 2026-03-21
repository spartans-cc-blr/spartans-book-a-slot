'use client'
// FixturesWeekend.tsx
// Client wrapper that owns the shared weekendResponses state for one booking.
// Each card has its own instance, but they all initialise from the same
// server-fetched data — so validation is correct on load.
// Cross-card reactivity (card A seeing card B's live change) would require
// a context provider lifted above all cards; for now each card validates
// against the server-loaded state of its siblings, which is correct on load
// and stays accurate after the player changes this card.

import { useState } from 'react'
import { FixturesAvailability } from '@/components/fixtures/FixturesAvailability'

interface Props {
  bookingId:                string
  slotDate:                 string
  isPlayer:                 boolean
  isCaptain:                boolean
  initialResponse:          string | null
  weekendBookings:          { id: string; game_date: string; slot_time: string }[]
  initialWeekendResponses:  Record<string, string>
}

export function FixturesWeekend({
  bookingId,
  slotDate,
  isPlayer,
  isCaptain,
  initialResponse,
  weekendBookings,
  initialWeekendResponses,
}: Props) {
  // This state is local to this card but initialised from server data.
  // It reflects what THIS card knows about the weekend — sufficient for
  // validating changes made on this card against siblings' server state.
  const [weekendResponses] = useState<Record<string, string>>(initialWeekendResponses)

  return (
    <FixturesAvailability
      bookingId={bookingId}
      slotDate={slotDate}
      isPlayer={isPlayer}
      isCaptain={isCaptain}
      initialResponse={initialResponse}
      weekendResponses={weekendResponses}
      weekendBookings={weekendBookings}
    />
  )
}
