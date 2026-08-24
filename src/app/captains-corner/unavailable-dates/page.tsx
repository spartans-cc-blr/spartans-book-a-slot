// app/captains-corner/unavailable-dates/page.tsx
//
// Captain-only for marking. Lets a captain mark dates/slots they already
// know they can't lead a game — before a real booking even exists — so the
// tournament share page's suggestion engines stop offering those dates to
// organisers. See .claude/rules/features/player-future-availability.md.
//
// Admins additionally get a captain picker (?captainId=) so they can look
// up any captain's marked dates read-only — see CaptainPicker.tsx and the
// isOwnView branch below. This was the only way to see someone else's
// marks at all; previously the page (and its API route) only ever
// exposed the signed-in session's own rows.
//
// Layout mirrors the public /schedule page (one continuous sticky-header
// table with inline month dividers, no week pagination) and its warm-light
// theme — this page hangs off Captains' Corner but is meant to feel like
// the same "here's the calendar" surface as the public schedule, not the
// dark ink theme the rest of Captains' Corner uses.
//
// Only dates with at least one slot the captain can actually mark are ever
// shown, but unlike the original cut, a date that qualifies shows ALL 4
// slots — booked/reserved/blocked ones included, read-only, for awareness
// of what else is already happening that day. Booked and blocked slots
// link through to the real /fixtures/[id] match card (blocked resolves to
// whichever booking is actually causing the block, via getClashSource() —
// not a dead end).

import { redirect } from 'next/navigation'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { createServiceClient } from '@/lib/supabase'
import { SiteNav } from '@/components/ui/SiteNav'
import { UnavailableDatesPanel } from '@/components/captains/UnavailableDatesPanel'
import type { DayInfo, DaySlotInfo } from '@/components/captains/UnavailableDatesPanel'
import { CaptainPicker } from '@/components/captains/CaptainPicker'
import { upcomingWeekendDates } from '@/lib/suggestedSlots'
import { computeSlotStatus, getClashSource } from '@/lib/validation'
import { SLOT_TIMES } from '@/types'
import type { SlotTime } from '@/types'
import { parseISO, format as formatDate } from 'date-fns'
import type { Metadata } from 'next'

export const dynamic = 'force-dynamic'

export const metadata: Metadata = {
  title: "Unavailable Dates — Captain's Corner",
}

interface BookingRow {
  id: string
  game_date: string
  slot_time: SlotTime
  format: string | null
  status: string
  opponent_name: string | null
  tournament: { name: string | null } | null
}

export default async function UnavailableDatesPage({
  searchParams,
}: {
  searchParams: Promise<{ captainId?: string }>
}) {
  const session = await getServerSession(authOptions)
  const user    = session?.user as any

  if (!session) redirect('/login')
  if (!user?.isCaptain && !user?.isAdmin) redirect('/fixtures')

  const supabase = createServiceClient()

  // Admin-only captain picker. The write gate for this whole feature is
  // players.is_captain (see the API route), so that's the same list used
  // here — not the separate captains master-data table, which tracks
  // tournament-level captain assignment and can diverge from it.
  let captainOptions: { id: string; name: string }[] = []
  let viewingPlayerId: string | null = null
  let viewingName: string | null = null
  let isOwnView = true

  if (user.isAdmin) {
    const { data: captainRows } = await supabase
      .from('players')
      .select('id, name')
      .eq('is_captain', true)
      .order('name')
    captainOptions = captainRows ?? []

    if (captainOptions.length > 0) {
      const requested = (await searchParams).captainId
      const requestedValid = requested && captainOptions.some(c => c.id === requested)
      viewingPlayerId = requestedValid
        ? requested!
        : (user.isCaptain && captainOptions.some(c => c.id === user.playerId))
          ? user.playerId
          : captainOptions[0].id

      viewingName = captainOptions.find(c => c.id === viewingPlayerId)?.name ?? null
      isOwnView = viewingPlayerId === user.playerId
    }
  }

  const dates = upcomingWeekendDates()
  const firstDate = dates[0]?.game_date
  const lastDate  = dates[dates.length - 1]?.game_date

  const { data: existingRaw } = firstDate && lastDate
    ? await supabase
        .from('bookings')
        .select('id, game_date, slot_time, format, status, opponent_name, tournament:tournaments!bookings_tournament_id_fkey(name)')
        .neq('status', 'cancelled')
        .gte('game_date', firstDate)
        .lte('game_date', lastDate)
    : { data: [] as any[] }

  const existingBookings: BookingRow[] = (existingRaw ?? []).map((b: any) => ({
    ...b,
    tournament: Array.isArray(b.tournament) ? b.tournament[0] ?? null : b.tournament,
  }))

  function findBooking(date: string, slot: SlotTime): BookingRow | undefined {
    return existingBookings.find(b => b.game_date === date && b.slot_time === slot)
  }

  const days: DayInfo[] = dates
    .map(d => {
      // Same slot-status engine the admin schedule grid uses
      // (/api/availability) — a slot is genuinely open when it's 'open' or
      // 't20only' (still bookable, just format-constrained; this feature
      // doesn't ask for a format so that's close enough to "open").
      const statuses: Record<SlotTime, string> = {} as any
      for (const t of SLOT_TIMES) statuses[t] = computeSlotStatus(d.game_date, t, existingBookings as any)

      const slots: DaySlotInfo[] = SLOT_TIMES.map(t => {
        const status = statuses[t]
        if (status === 'open' || status === 't20only') {
          return { time: t, kind: 'unscheduled' }
        }
        if (status === 'soft_block') {
          const b = findBooking(d.game_date, t)
          return { time: t, kind: 'reserved', tournamentName: b?.tournament?.name ?? null }
        }
        if (status === 'booked') {
          const b = findBooking(d.game_date, t)
          return {
            time: t, kind: 'booked',
            bookingId: b?.id,
            tournamentName: b?.tournament?.name ?? null,
            opponentName: b?.opponent_name ?? null,
          }
        }
        // 'clash' — blocked by another slot on the same day; resolve to the
        // booking actually causing it, not just a dead "blocked" label.
        // causeSlot is also handed to the UI so it can point the same
        // directional arrow the admin schedule grid uses (see
        // src/components/schedule/ClashArrow.tsx).
        const causeSlot = getClashSource(t, SLOT_TIMES.map(s => ({ time: s, status: statuses[s], format: findBooking(d.game_date, s)?.format ?? null })))
        const causeBooking = causeSlot ? findBooking(d.game_date, causeSlot) : undefined
        return { time: t, kind: 'blocked', bookingId: causeBooking?.id, causeSlot }
      })

      if (!slots.some(s => s.kind === 'unscheduled')) return null

      const parsed = parseISO(d.game_date)
      return {
        date: d.game_date,
        label: formatDate(parsed, 'EEE d MMM'),
        dow: d.day,
        month: formatDate(parsed, 'MMMM yyyy'),
        slots,
      }
    })
    .filter((d): d is DayInfo => d !== null)

  return (
    <div className="min-h-screen" style={{ background: '#F8F4EE' }}>
      <SiteNav activePage="captains-unavailable" />

      {/* Hero — same visual language as /schedule's own hero */}
      <div style={{ background: '#EEEAE2', borderBottom: '1px solid #D4C9B0', padding: '28px 20px 24px', position: 'relative', overflow: 'hidden' }}>
        <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: '3px', background: 'linear-gradient(90deg, #D97706 0%, #F59E0B 60%, transparent 100%)' }} />
        <p style={{ fontFamily: 'var(--font-rajdhani), sans-serif', fontSize: '11px', fontWeight: 700, letterSpacing: '0.18em', textTransform: 'uppercase', color: '#D97706', marginBottom: '6px', display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span style={{ display: 'inline-block', width: '20px', height: '1.5px', background: '#D97706' }} />
          Spartans Cricket Club · Bengaluru
        </p>
        <p style={{ fontFamily: 'var(--font-rajdhani), sans-serif', fontSize: '12px', color: '#A8A29E', marginBottom: '4px' }}>
          <b style={{ color: '#78716C', fontWeight: 600 }}>Captains&rsquo; Corner</b> › Unavailable Dates
        </p>
        <h1 style={{ fontFamily: 'var(--font-cinzel), serif', fontSize: 'clamp(20px, 5vw, 28px)', fontWeight: 700, color: '#1C1917', letterSpacing: '0.03em', marginBottom: '6px', lineHeight: 1.2 }}>
          🚫 Unavailable Dates
        </h1>
        <p style={{ fontFamily: 'var(--font-rajdhani), sans-serif', fontSize: '14px', color: '#78716C', maxWidth: '520px', lineHeight: 1.5 }}>
          {isOwnView
            ? <>Mark dates and times you already know you can&rsquo;t lead a game. This keeps the tournament
                share page from suggesting those slots to organisers — booked and reserved slots are shown
                too, just so you can see the full day at a glance.</>
            : <>Read-only — showing <b style={{ color: '#1C1917' }}>{viewingName}</b>&rsquo;s marked-unavailable dates. Only they can add or clear a mark.</>}
        </p>
        {user.isAdmin && captainOptions.length > 0 && (
          <CaptainPicker captains={captainOptions} selectedId={viewingPlayerId ?? ''} ownPlayerId={user.playerId ?? null} />
        )}
      </div>

      <UnavailableDatesPanel days={days} viewingPlayerId={isOwnView ? undefined : (viewingPlayerId ?? undefined)} />

      <footer style={{ textAlign: 'center', color: '#A8A29E', fontFamily: 'var(--font-rajdhani), sans-serif', fontSize: '12px', padding: '20px', borderTop: '1px solid #D4C9B0' }}>
        © 2026 Spartans Cricket Club · Bengaluru · Est. 2014
      </footer>
    </div>
  )
}
