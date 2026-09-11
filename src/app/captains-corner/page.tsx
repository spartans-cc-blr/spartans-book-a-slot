import { redirect } from 'next/navigation'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { createServiceClient } from '@/lib/supabase'
import { computeSquadVersion } from '@/lib/squadVersion'
import { getRecentForm } from '@/lib/playerStats'
import { SiteNav } from '@/components/ui/SiteNav'
import { CaptainsCornerGrid } from '@/components/captains/CaptainsCornerGrid'
import { getISOWeek, getISOWeekYear, parseISO, startOfISOWeek, addDays, format } from 'date-fns'
import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: "Captain's Corner — Spartans CC",
}

export const revalidate = 0

function weekKey(dateStr: string): string {
  const d = parseISO(dateStr)
  return `${getISOWeekYear(d)}-W${String(getISOWeek(d)).padStart(2, '0')}`
}

function weekLabel(dateStr: string): string {
  const d = parseISO(dateStr)
  const sat = startOfISOWeek(d)
  const sun = addDays(sat, 6) // ISO week starts Mon; weekend is Sat+Sun
  // Find the Saturday of this ISO week (day 5 from Monday)
  const saturday = addDays(startOfISOWeek(d), 5)
  const sunday   = addDays(saturday, 1)
  return `${format(saturday, 'd MMM')} – ${format(sunday, 'd MMM yyyy')}`
}

function getMatchEndTime(gameDate: string, slotTime: string, format: string): Date {
  const end = new Date(`${gameDate}T${slotTime}:00+05:30`)
  const durationHours = format === 'T30' ? 5.5 : 3.5
  end.setTime(end.getTime() + durationHours * 60 * 60 * 1000)
  return end
}

function isMatchExpired(gameDate: string, slotTime: string, format: string): boolean {
  return new Date() >= getMatchEndTime(gameDate, slotTime, format)
}

export default async function CaptainsCornerPage() {
  const session = await getServerSession(authOptions)
  const user    = session?.user as any

  // Must be a captain or admin
  if (!session) redirect('/login')
  if (!user?.isCaptain && !user?.isAdmin) redirect('/fixtures')

  const supabase = createServiceClient()
  const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString().split('T')[0]

  // ── Fetch upcoming confirmed bookings + all non-expelled players ──
  // Neither query depends on the other, so both are issued together.
  const [{ data: bookings }, { data: players }] = await Promise.all([
    supabase
      .from('bookings')
      .select(`
        id, game_date, slot_time, format, opponent_name,
        match_time, cricheroes_url, gc_return_note,
        tournament:tournaments(name, ball_type, is_practice, ground:grounds(name, maps_url, hospital_url)),
        ground:grounds(name, maps_url, hospital_url)
      `)
      .eq('status', 'confirmed')
      .gte('game_date', yesterday)
      .order('game_date', { ascending: true })
      .order('slot_time', { ascending: true })
      .limit(20), // cap to reasonable window

    supabase
      .from('players')
      .select('id, name, jersey_name, jersey_number, wallet_balance, dues_override, primary_skill, is_captain, priority_pick, cricheroes_url, status, fee_exemptions(start_date, end_date)')
      .neq('status', 'expelled')
      .order('name', { ascending: true }),
  ])

  const activeBookings = (bookings ?? []).filter(b =>
    !isMatchExpired(b.game_date, b.slot_time, b.format ?? 'T20')
  )

  // ── Restrict to the next two rolling weekends only ───────────────
  // Squad selection for a given weekend can't even start until that
  // weekend's own Thu 8am lock window opens (see getActiveLockWeekend()
  // in /api/squad/route.ts) — so there's nothing a captain can actually
  // do for any weekend beyond the immediate next one, and showing more
  // is just clutter. weekKey() (below) buckets a midweek game into the
  // same ISO week as the Sat/Sun that follows it, so capping at the
  // first two distinct weekKeys naturally keeps a weekday game grouped
  // with its own weekend rather than showing it in isolation.
  const seenWeekKeys: string[] = []
  for (const b of activeBookings) {
    const wk = weekKey(b.game_date)
    if (!seenWeekKeys.includes(wk)) seenWeekKeys.push(wk)
    if (seenWeekKeys.length >= 2) break
  }
  const allowedWeekKeys = new Set(seenWeekKeys)
  const scopedBookings = activeBookings.filter(b => allowedWeekKeys.has(weekKey(b.game_date)))

  const today = new Date().toISOString().split('T')[0]

  // ── Fetch availability, existing squad rows, and recent-form data ──
  // All three depend on `bookings`/`players` above (already resolved) but
  // not on each other, so they're issued together rather than in sequence.
  type ExistingSquadRow = {
    booking_id: string
    player_id:  string
    status:     string
    is_captain: boolean
    is_vc:      boolean
    is_wk:      boolean
    match_role: 'bat' | 'bowl' | 'bat_ar' | 'bowl_ar' | null  // ADD

  }

  const bookingIds = scopedBookings.map(b => b.id)

  const [{ data: avail }, { data: squads }, recentFormByPlayer] = await Promise.all([
    bookingIds.length > 0
      ? supabase.from('availability').select('player_id, booking_id, response').in('booking_id', bookingIds)
      : Promise.resolve({ data: [] as { player_id: string; booking_id: string; response: string }[] }),

    bookingIds.length > 0
      ? supabase
          .from('squad')
          .select('booking_id, player_id, status, is_captain, is_vc, is_wk, match_role')
          .in('booking_id', bookingIds)
          .in('status', ['draft', 'pending_approval', 'approved', 'announced'])
      : Promise.resolve({ data: [] as ExistingSquadRow[] }),

    // Batched — one round trip for the whole candidate pool, not per player.
    // Only used to decide whether a player gets a "Form" toggle at all — a
    // player with `null` here has no reconciled matches anywhere, so showing
    // a toggle that always opens to "no data" would just be clutter. The
    // actual tournament/ground/format breakdown behind the toggle is fetched
    // lazily per player on tap (GET /api/captains-corner/context-stats), not
    // computed here — see src/lib/playerStats.ts getPlayerBookingContextStats().
    getRecentForm((players ?? []).map(p => p.id)),
  ])

  const availability: { player_id: string; booking_id: string; response: string }[] = avail ?? []
  const existingSquads: ExistingSquadRow[] = (squads ?? []) as ExistingSquadRow[]

  const playersWithExempt = (players ?? []).map(p => ({
   ...p,
   is_fee_exempt: (p.fee_exemptions ?? []).some(
     (e: { start_date: string; end_date: string | null }) =>
       e.start_date <= today && (e.end_date === null || e.end_date >= today)
   ),
   recent_form: recentFormByPlayer[p.id] ?? null,
 }))

  // Build initialSquadMap: bookingId → hydration data for SlotCard.
  // One entry per active booking (not just ones with existing squad rows) —
  // every booking needs a definite version fingerprint so the client can
  // always send a valid expected_version on save, including a first-ever
  // save for a booking with no squad rows yet.
  type InitialSquad = {
    status:   'draft' | 'pending' | 'approved' | 'announced'
    selected: string[]
    captain:  string | null
    vc:       string | null
    wk:       string[]
    matchRoles:  Record<string, 'bat' | 'bowl' | 'bat_ar' | 'bowl_ar'>  // ADD
    gcReturnNote: string | null
    version:  string
  }
  const rowsByBooking: Record<string, ExistingSquadRow[]> = {}
  for (const row of existingSquads) {
    (rowsByBooking[row.booking_id] ??= []).push(row)
  }

  const initialSquadMap: Record<string, InitialSquad> = {}
  for (const b of scopedBookings) {
    const rows      = rowsByBooking[b.id] ?? []
    const rawStatus = rows[0]?.status ?? 'draft'
    const mapped    = rawStatus === 'pending_approval' ? 'pending'
                     : rawStatus === 'announced'        ? 'announced'
                     : rawStatus === 'approved'         ? 'approved'
                     : 'draft'
    const entry: InitialSquad = {
      status: mapped,
      selected: [],
      captain: null,
      vc: null,
      wk: [],
      matchRoles: {},
      gcReturnNote: b.gc_return_note ?? null,
      // Fingerprint must be computed from raw DB status values — the same
      // shape POST /api/squad computes server-side — not the display-mapped status.
      version: computeSquadVersion(rows.map(r => ({
        player_id: r.player_id, status: r.status, is_captain: r.is_captain,
        is_vc: r.is_vc, is_wk: r.is_wk, match_role: r.match_role ?? null,
      }))),
    }
    for (const row of rows) {
      entry.selected.push(row.player_id)
      if (row.is_captain) entry.captain = row.player_id
      if (row.is_vc)      entry.vc      = row.player_id
      if (row.is_wk)      entry.wk.push(row.player_id)
      if (row.match_role) entry.matchRoles[row.player_id] = row.match_role
    }
    initialSquadMap[b.id] = entry
  }

  // ── Group bookings into weekends ───────────────────────────
  const weekendMap: Record<string, {
    label: string
    bookings: typeof bookings
  }> = {}

  for (const b of scopedBookings) {
    const wk = weekKey(b.game_date)
    if (!weekendMap[wk]) {
      weekendMap[wk] = { label: weekLabel(b.game_date), bookings: [] }
    }
    weekendMap[wk].bookings!.push(b)
  }

  // ── Build availability lookup: bookingId → playerId → response
  const availMap: Record<string, Record<string, string>> = {}
  for (const a of availability) {
    if (!availMap[a.booking_id]) availMap[a.booking_id] = {}
    availMap[a.booking_id][a.player_id] = a.response
  }

  const weekendEntries = Object.entries(weekendMap)

  return (
    <div className="min-h-screen grain" style={{ background: 'var(--captains-shell-bg)' }}>
      <SiteNav activePage="captains" />

      {/* Hero */}
      <div className="px-5 md:px-8 lg:px-10 py-7 md:py-9 relative overflow-hidden"
        style={{ background: 'var(--captains-hero-bg)', borderBottom: '1px solid var(--captains-border)' }}>
        <div className="absolute -top-8 -right-8 w-48 h-48 rounded-full pointer-events-none"
          style={{ background: 'radial-gradient(circle, rgba(201,168,76,0.1) 0%, transparent 70%)' }} />
        <p className="text-xs font-rajdhani font-semibold tracking-[3px] uppercase mb-2 flex items-center gap-2" style={{ color: 'var(--captains-accent)' }}>
          <span className="w-4 h-px inline-block" style={{ background: 'var(--captains-accent)' }} />
          Captains Corner
        </p>
        <h1 className="font-cinzel text-2xl md:text-3xl font-bold mb-2 tracking-wide" style={{ color: 'var(--captains-text)' }}>
          Player Availability
        </h1>
        <p className="text-sm max-w-xl leading-relaxed font-rajdhani" style={{ color: 'var(--captains-text-muted)' }}>
          Showing Y / O / E responses. N and L are hidden. Amber names have outstanding dues.
        </p>
      </div>

      {/* Legend */}
      <div className="px-5 md:px-8 lg:px-10 py-2.5 flex gap-5 flex-wrap"
        style={{ background: 'var(--captains-hero-bg)', borderBottom: '1px solid var(--captains-border)' }}>
        {/* Same --captains-resp-* chip tokens the grid's own RESP set reads,
            so this legend and the per-row chips can't disagree on a colour
            (E used to be yellow here while the grid rendered it blue). */}
        {[
          { code: 'Y', token: 'y', label: 'Available' },
          { code: 'O', token: 'o', label: 'One game this weekend' },
          { code: 'E', token: 'e', label: 'Either game same day' },
        ].map(item => (
          <div key={item.code} className="flex items-center gap-1.5">
            <span className="w-5 h-5 rounded flex items-center justify-center font-rajdhani text-xs font-bold"
              style={{ background: `var(--captains-resp-${item.token}-bg)`, color: `var(--captains-resp-${item.token}-text)`, border: `1px solid var(--captains-resp-${item.token}-border)` }}>
              {item.code}
            </span>
            <span className="font-rajdhani text-xs" style={{ color: 'var(--captains-text-muted)' }}>{item.label}</span>
          </div>
        ))}
        <div className="flex items-center gap-1.5">
          <span className="w-5 h-5 rounded flex items-center justify-center font-rajdhani text-xs font-bold bg-amber-50 dark:bg-amber-950 text-amber-700 dark:text-amber-400 border border-amber-300 dark:border-amber-800">
            ₹
          </span>
          <span className="font-rajdhani text-xs" style={{ color: 'var(--captains-text-muted)' }}>Has outstanding dues</span>
        </div>
      </div>

      <div className="px-5 md:px-8 lg:px-10 py-6 max-w-full overflow-x-auto">
        {weekendEntries.length === 0 ? (
          <p className="font-rajdhani text-sm" style={{ color: 'var(--captains-text-muted)' }}>No upcoming fixtures found.</p>
        ) : (
          <div className="flex flex-col gap-10">
            {weekendEntries.map(([wk, weekend]) => (
              <CaptainsCornerGrid
                key={wk}
                weekLabel={weekend.label}
                bookings={(weekend.bookings ?? []) as any}
                players={playersWithExempt as any}
                availMap={availMap}
                initialSquadMap={initialSquadMap}
              />
            ))}
          </div>
        )}
      </div>

      <footer className="py-5 text-center font-rajdhani text-xs mt-8" style={{ borderTop: '1px solid var(--captains-border)', color: 'var(--captains-text-faint)' }}>
        © 2026 <span style={{ color: 'var(--captains-accent-dim)' }}>Spartans Cricket Club</span> · Bengaluru · Est. 2014
      </footer>
    </div>
  )
}
