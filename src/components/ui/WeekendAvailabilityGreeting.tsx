// src/components/ui/WeekendAvailabilityGreeting.tsx
//
// First-open-of-the-day greeting: if the signed-in player hasn't marked
// availability for the upcoming lock weekend yet, prompt them once per
// calendar day. The one-per-day gate is purely client-side (localStorage) —
// deliberately separate from availability_nudge_log, which drives the
// Sun–Wed push cadence (src/lib/availabilityNudge.ts) and its own audit
// trail. This dialog isn't a push/notification and has no server record;
// it's a same-session home-page greeting only.
'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { Dialog } from './Dialog'
import type { NudgeBooking } from '@/lib/availabilityNudge'

const SLOT_LABELS: Record<string, string> = {
  '07:30': '7:15 AM', '10:30': '10:15 AM', '12:30': '12:15 PM', '14:30': '2:15 PM',
}

function formatBookingLine(b: NudgeBooking): string {
  const d = new Date(b.game_date + 'T00:00:00')
  const dateLabel = d.toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short' })
  const slot = SLOT_LABELS[b.slot_time] ?? b.slot_time
  return `${dateLabel}, ${slot}${b.tournament_name ? ` · ${b.tournament_name}` : ''} (${b.format})`
}

function greetingForHour(hour: number): string {
  if (hour < 12) return 'Good morning'
  if (hour < 17) return 'Good afternoon'
  return 'Good evening'
}

interface WeekendAvailabilityGreetingProps {
  playerId: string
  firstName: string
  bookings: NudgeBooking[]
}

export function WeekendAvailabilityGreeting({ playerId, firstName, bookings }: WeekendAvailabilityGreetingProps) {
  const [open, setOpen] = useState(false)

  useEffect(() => {
    if (!bookings.length) return
    const today = new Date().toISOString().split('T')[0]
    const key = `spartans_weekend_greeting_${playerId}_${today}`
    if (window.localStorage.getItem(key)) return
    window.localStorage.setItem(key, '1')
    setOpen(true)
  }, [playerId, bookings])

  if (!bookings.length) return null

  return (
    <Dialog
      open={open}
      onClose={() => setOpen(false)}
      title={`${greetingForHour(new Date().getHours())}, ${firstName}! 👋`}
      actions={
        <>
          <button
            onClick={() => setOpen(false)}
            className="font-rajdhani text-xs font-semibold text-zinc-500 hover:text-parchment px-4 py-2 rounded transition-colors"
          >
            Later
          </button>
          <Link
            href="/fixtures"
            onClick={() => setOpen(false)}
            className="font-rajdhani text-xs font-bold tracking-widest uppercase bg-gold/10 border border-gold-dim text-gold hover:bg-gold/20 px-4 py-2 rounded transition-colors"
          >
            Mark Availability →
          </Link>
        </>
      }
    >
      <p className="font-rajdhani text-sm text-zinc-400 mb-3">
        {bookings.length === 1
          ? "You haven't marked your availability for this weekend's match yet:"
          : "You haven't marked your availability for these weekend matches yet:"}
      </p>
      <ul className="space-y-1.5">
        {bookings.map(b => (
          <li
            key={b.id}
            className="font-rajdhani text-sm text-parchment bg-ink-3 border border-ink-5 rounded px-3 py-2"
          >
            {formatBookingLine(b)}
          </li>
        ))}
      </ul>
    </Dialog>
  )
}
