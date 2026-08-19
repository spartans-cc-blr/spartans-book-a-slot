// app/unscheduled-availability/page.tsx
//
// Dedicated page (not a buried section on /fixtures) for pre-filling
// general availability ahead of scheduling — see
// .claude/rules/features/player-future-availability.md. Reachable via the
// "Matches ▾" nav sub-menu (SiteNav.tsx) alongside Upcoming/Past Matches.
//
// Only dates/slots with NO existing booking (any status other than
// 'cancelled') are ever shown — a date where every slot is already booked
// never appears at all, and a partially-booked date only shows its
// remaining open slots.

import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { createServiceClient } from '@/lib/supabase'
import { SiteNav } from '@/components/ui/SiteNav'
import { UnscheduledAvailabilityPanel } from '@/components/availability/UnscheduledAvailabilityPanel'
import { upcomingWeekendDates } from '@/lib/suggestedSlots'
import { computeSlotStatus } from '@/lib/validation'
import { SLOT_TIMES } from '@/types'
import type { Metadata } from 'next'

export const dynamic = 'force-dynamic'

export const metadata: Metadata = {
  title: 'Unscheduled Slots — Spartans Cricket Club',
}

export default async function UnscheduledAvailabilityPage() {
  const session = await getServerSession(authOptions)
  const player  = session?.user as any
  const isPlayer = !!player?.playerId && player?.playerStatus !== 'expelled'

  const dates = upcomingWeekendDates()
  const firstDate = dates[0]?.game_date
  const lastDate  = dates[dates.length - 1]?.game_date

  const supabase = createServiceClient()
  // format + status (not just game_date/slot_time) are both needed by
  // computeSlotStatus() below — it reasons about *other* slots on the same
  // day (a T20 at 10:30 blocks the whole day, a T30 at 07:30 blocks
  // 10:30/12:30, etc.), not just a direct match on this exact slot_time.
  const { data: existingBookings } = firstDate && lastDate
    ? await supabase
        .from('bookings')
        .select('game_date, slot_time, format, status')
        .neq('status', 'cancelled')
        .gte('game_date', firstDate)
        .lte('game_date', lastDate)
    : { data: [] as { game_date: string; slot_time: string; format: string | null; status: string }[] }

  // Same slot-status engine the admin schedule grid uses (/api/availability)
  // — reused rather than re-implemented so "open" here means exactly what it
  // means there. A slot counts as open for future-availability purposes if
  // it's genuinely 'open', or 't20only' (still bookable, just format-
  // constrained — future availability doesn't care about format, only
  // whether the player could conceivably play). 'booked'/'soft_block'/
  // 'clash' — including a slot blocked by an adjacent game running over,
  // not just a direct booking on that exact slot_time — are all excluded.
  const openDates = dates
    .map(d => ({
      game_date: d.game_date,
      openSlots: SLOT_TIMES.filter(s => {
        const status = computeSlotStatus(d.game_date, s, (existingBookings ?? []) as any)
        return status === 'open' || status === 't20only'
      }),
    }))
    .filter(d => d.openSlots.length > 0)

  return (
    <div className="min-h-screen bg-ink grain">
      <SiteNav activePage="unscheduled" />

      {/* Hero */}
      <div className="bg-ink-2 border-b border-ink-4 px-5 md:px-8 lg:px-10 py-7 md:py-9 relative overflow-hidden">
        <div className="absolute -top-8 -right-8 w-48 h-48 rounded-full pointer-events-none"
          style={{ background: 'radial-gradient(circle, rgba(201,168,76,0.1) 0%, transparent 70%)' }} />
        <p className="text-gold text-xs font-rajdhani font-semibold tracking-[3px] uppercase mb-2 flex items-center gap-2">
          <span className="w-4 h-px bg-gold inline-block" />
          Spartans Cricket Club · Bengaluru
        </p>
        <h1 className="font-cinzel text-2xl md:text-3xl font-bold text-parchment mb-2 tracking-wide">
          🗓️ Unscheduled Slots
        </h1>
        <p className="text-muted text-sm md:text-base max-w-xl leading-relaxed font-rajdhani">
          Let captains know when you're free before a match is even scheduled. Only dates and
          slots with no existing booking are shown here — once a real fixture is confirmed, mark
          your availability on that match's own card on Fixtures instead.
        </p>
      </div>

      {/* Signed out */}
      {!session && (
        <div className="px-5 md:px-8 lg:px-10 py-3 bg-ink-2 border-b border-ink-4">
          <p className="font-rajdhani text-sm text-zinc-500">
            <a href="/api/auth/signin" className="text-gold underline">Sign in</a> to mark your availability.
          </p>
        </div>
      )}

      {/* Not registered */}
      {session && !player?.playerId && player?.playerStatus !== 'expelled' && (
        <div className="px-5 md:px-8 lg:px-10 py-3 bg-amber-950/30 border-b border-amber-800/40">
          <p className="font-rajdhani text-sm text-amber-300">
            You're signed in but not yet registered as a Spartans player.{' '}
            <a href="/join" className="text-gold underline">Complete your registration →</a>
          </p>
        </div>
      )}

      {/* Expelled */}
      {player?.playerStatus === 'expelled' && (
        <div className="px-5 md:px-8 lg:px-10 py-3 bg-red-950/30 border-b border-red-800/40">
          <p className="font-rajdhani text-sm text-red-400">
            Your account has been suspended. Contact the club admin for more information.
          </p>
        </div>
      )}

      {isPlayer && (
        <div className="px-5 md:px-8 lg:px-10 py-6 max-w-2xl">
          <UnscheduledAvailabilityPanel dates={openDates} />
        </div>
      )}

      <footer className="border-t border-ink-4 py-5 text-center font-rajdhani text-xs text-zinc-600 mt-8">
        © 2026 <span className="text-gold-dim">Spartans Cricket Club</span> · Bengaluru · Est. 2014
      </footer>
    </div>
  )
}
