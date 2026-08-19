// app/captains-corner/unavailable-dates/page.tsx
//
// Captain-only. Lets a captain mark dates/slots they already know they
// can't lead a game — before a real booking even exists — so the
// tournament share page's suggestion engines stop offering those dates to
// organisers. See .claude/rules/features/player-future-availability.md.
//
// Only dates/slots with NO existing booking are ever shown (same
// computeSlotStatus()-based filtering as the admin schedule grid) — a date
// where every slot is already booked never appears at all, and a
// partially-booked date only shows its remaining open slots.

import { redirect } from 'next/navigation'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { createServiceClient } from '@/lib/supabase'
import { SiteNav } from '@/components/ui/SiteNav'
import { UnavailableDatesPanel } from '@/components/captains/UnavailableDatesPanel'
import { upcomingWeekendDates } from '@/lib/suggestedSlots'
import { computeSlotStatus } from '@/lib/validation'
import { SLOT_TIMES } from '@/types'
import type { Metadata } from 'next'

export const dynamic = 'force-dynamic'

export const metadata: Metadata = {
  title: "Unavailable Dates — Captain's Corner",
}

export default async function UnavailableDatesPage() {
  const session = await getServerSession(authOptions)
  const user    = session?.user as any

  if (!session) redirect('/login')
  if (!user?.isCaptain && !user?.isAdmin) redirect('/fixtures')

  const dates = upcomingWeekendDates()
  const firstDate = dates[0]?.game_date
  const lastDate  = dates[dates.length - 1]?.game_date

  const supabase = createServiceClient()
  // format + status are both needed by computeSlotStatus() below — it
  // reasons about *other* slots on the same day (a T20 at 10:30 blocks the
  // whole day, a T30 at 07:30 blocks 10:30/12:30, etc.), not just a direct
  // match on this exact slot_time.
  const { data: existingBookings } = firstDate && lastDate
    ? await supabase
        .from('bookings')
        .select('game_date, slot_time, format, status')
        .neq('status', 'cancelled')
        .gte('game_date', firstDate)
        .lte('game_date', lastDate)
    : { data: [] as { game_date: string; slot_time: string; format: string | null; status: string }[] }

  // Same slot-status engine the admin schedule grid uses (/api/availability)
  // — a slot counts as open when it's genuinely 'open', or 't20only' (still
  // bookable, just format-constrained — this feature doesn't ask for a
  // format, only whether the captain could conceivably be needed).
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
      <SiteNav activePage="captains-unavailable" />

      {/* Hero */}
      <div className="bg-ink-2 border-b border-ink-4 px-5 md:px-8 lg:px-10 py-7 md:py-9 relative overflow-hidden">
        <div className="absolute -top-8 -right-8 w-48 h-48 rounded-full pointer-events-none"
          style={{ background: 'radial-gradient(circle, rgba(201,168,76,0.1) 0%, transparent 70%)' }} />
        <p className="text-gold text-xs font-rajdhani font-semibold tracking-[3px] uppercase mb-2 flex items-center gap-2">
          <span className="w-4 h-px bg-gold inline-block" />
          Spartans Cricket Club · Bengaluru
        </p>
        <h1 className="font-cinzel text-2xl md:text-3xl font-bold text-parchment mb-2 tracking-wide">
          🚫 Unavailable Dates
        </h1>
        <p className="text-muted text-sm md:text-base max-w-xl leading-relaxed font-rajdhani">
          Mark dates and times you already know you can't lead a game. This keeps the tournament
          share page from suggesting those slots to organisers.
        </p>
      </div>

      <div className="px-5 md:px-8 lg:px-10 py-6 max-w-2xl">
        <UnavailableDatesPanel dates={openDates} />
      </div>

      <footer className="border-t border-ink-4 py-5 text-center font-rajdhani text-xs text-zinc-600 mt-8">
        © 2026 <span className="text-gold-dim">Spartans Cricket Club</span> · Bengaluru · Est. 2014
      </footer>
    </div>
  )
}
