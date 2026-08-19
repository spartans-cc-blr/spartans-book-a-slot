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
  const { data: existingBookings } = firstDate && lastDate
    ? await supabase
        .from('bookings')
        .select('game_date, slot_time')
        .neq('status', 'cancelled')
        .gte('game_date', firstDate)
        .lte('game_date', lastDate)
    : { data: [] as { game_date: string; slot_time: string }[] }

  const bookedByDate: Record<string, Set<string>> = {}
  for (const b of existingBookings ?? []) {
    if (!bookedByDate[b.game_date]) bookedByDate[b.game_date] = new Set()
    bookedByDate[b.game_date].add(b.slot_time)
  }

  // Drop a date entirely once every one of its slots already has a booking —
  // only dates with at least one genuinely open slot are ever shown.
  const openDates = dates
    .map(d => ({
      game_date: d.game_date,
      openSlots: SLOT_TIMES.filter(s => !bookedByDate[d.game_date]?.has(s)),
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
