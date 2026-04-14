import { redirect } from 'next/navigation'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { createServiceClient } from '@/lib/supabase'
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

  // ── Fetch upcoming confirmed bookings ──────────────────────
  const { data: bookings } = await supabase
    .from('bookings')
    .select(`
      id, game_date, slot_time, format, opponent_name,
      match_time, cricheroes_url,
      tournament:tournaments(name, ball_type, ground:grounds(name, maps_url, hospital_url))
    `)
    .eq('status', 'confirmed')
    .gte('game_date', yesterday)
    .order('game_date', { ascending: true })
    .order('slot_time', { ascending: true })
    .limit(20) // cap to reasonable window
  const activeBookings = (bookings ?? []).filter(b =>
    !isMatchExpired(b.game_date, b.slot_time, b.format ?? 'T20')
  )    

  // ── Fetch all active players ───────────────────────────────
  const { data: players } = await supabase
    .from('players')
    .select('id, name, jersey_name, jersey_number, wallet_balance, dues_override, primary_skill, is_captain, priority_pick, cricheroes_url')
    .eq('active', true)
    .order('name', { ascending: true })

  // ── Fetch availability for all upcoming bookings ───────────
  const bookingIds = (activeBookings ?? []).map(b => b.id)
  let availability: { player_id: string; booking_id: string; response: string }[] = []
  if (bookingIds.length > 0) {
    const { data: avail } = await supabase
      .from('availability')
      .select('player_id, booking_id, response')
      .in('booking_id', bookingIds)
    availability = avail ?? []
  }

  // ── Fetch existing squad rows ──────────────────────────────
  type ExistingSquadRow = {
    booking_id: string
    player_id:  string
    status:     string
    is_captain: boolean
    is_vc:      boolean
    is_wk:      boolean
  }
  let existingSquads: ExistingSquadRow[] = []
  if (bookingIds.length > 0) {
    const { data: squads } = await supabase
      .from('squad')
      .select('booking_id, player_id, status, is_captain, is_vc, is_wk')
      .in('booking_id', bookingIds)
      .in('status', ['draft', 'pending_approval', 'approved', 'announced'])
    existingSquads = (squads ?? []) as ExistingSquadRow[]
  }

  // Build initialSquadMap: bookingId → hydration data for SlotCard
  type InitialSquad = {
    status:   'draft' | 'pending' | 'approved' | 'announced'
    selected: string[]
    captain:  string | null
    vc:       string | null
    wk:       string[]
  }
  const initialSquadMap: Record<string, InitialSquad> = {}
  for (const row of existingSquads) {
    if (!initialSquadMap[row.booking_id]) {
      const mapped = row.status === 'pending_approval' ? 'pending'
                   : row.status === 'announced'        ? 'announced'
                   : row.status === 'approved'         ? 'approved'
                   : 'draft'
      initialSquadMap[row.booking_id] = { status: mapped, selected: [], captain: null, vc: null, wk: [] }
    }
    const entry = initialSquadMap[row.booking_id]
    entry.selected.push(row.player_id)
    if (row.is_captain) entry.captain = row.player_id
    if (row.is_vc)      entry.vc      = row.player_id
    if (row.is_wk)      entry.wk.push(row.player_id)
  }

  // ── Group bookings into weekends ───────────────────────────
  const weekendMap: Record<string, {
    label: string
    bookings: typeof bookings
  }> = {}

  for (const b of activeBookings ?? []) {
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
    <div className="min-h-screen bg-ink grain">
      <SiteNav activePage="fixtures" />

      {/* Hero */}
      <div className="bg-ink-2 border-b border-ink-4 px-5 md:px-8 lg:px-10 py-7 md:py-9 relative overflow-hidden">
        <div className="absolute -top-8 -right-8 w-48 h-48 rounded-full pointer-events-none"
          style={{ background: 'radial-gradient(circle, rgba(201,168,76,0.1) 0%, transparent 70%)' }} />
        <p className="text-gold text-xs font-rajdhani font-semibold tracking-[3px] uppercase mb-2 flex items-center gap-2">
          <span className="w-4 h-px bg-gold inline-block" />
          Captains Corner
        </p>
        <h1 className="font-cinzel text-2xl md:text-3xl font-bold text-parchment mb-2 tracking-wide">
          Player Availability
        </h1>
        <p className="text-muted text-sm max-w-xl leading-relaxed font-rajdhani">
          Showing Y / O / E responses. N and L are hidden. Amber names have outstanding dues.
        </p>
        <a href="/fixtures"
          className="mt-3 inline-flex items-center gap-1.5 font-rajdhani text-xs text-zinc-500 hover:text-gold transition-colors">
          ← Back to Fixtures
        </a>
      </div>

      {/* Legend */}
      <div className="px-5 md:px-8 lg:px-10 py-2.5 bg-ink-2 border-b border-ink-4 flex gap-5 flex-wrap">
        {[
          { code: 'Y', color: '#4ade80', label: 'Available' },
          { code: 'O', color: '#fb923c', label: 'One game this weekend' },
          { code: 'E', color: '#fbbf24', label: 'Either game same day' },
        ].map(item => (
          <div key={item.code} className="flex items-center gap-1.5">
            <span className="w-5 h-5 rounded flex items-center justify-center font-rajdhani text-xs font-bold"
              style={{ background: `${item.color}20`, color: item.color, border: `1px solid ${item.color}40` }}>
              {item.code}
            </span>
            <span className="font-rajdhani text-xs text-zinc-500">{item.label}</span>
          </div>
        ))}
        <div className="flex items-center gap-1.5">
          <span className="w-5 h-5 rounded flex items-center justify-center font-rajdhani text-xs font-bold bg-amber-950 text-amber-400 border border-amber-800">
            ₹
          </span>
          <span className="font-rajdhani text-xs text-zinc-500">Has outstanding dues</span>
        </div>
      </div>

      <div className="px-5 md:px-8 lg:px-10 py-6 max-w-full overflow-x-auto">
        {weekendEntries.length === 0 ? (
          <p className="font-rajdhani text-zinc-500 text-sm">No upcoming fixtures found.</p>
        ) : (
          <div className="flex flex-col gap-10">
            {weekendEntries.map(([wk, weekend]) => (
              <CaptainsCornerGrid
                key={wk}
                weekLabel={weekend.label}
                bookings={(weekend.bookings ?? []) as any}
                players={players ?? []}
                availMap={availMap}
                initialSquadMap={initialSquadMap}
              />
            ))}
          </div>
        )}
      </div>

      <footer className="border-t border-ink-4 py-5 text-center font-rajdhani text-xs text-zinc-600 mt-8">
        © 2026 <span className="text-gold-dim">Spartans Cricket Club</span> · Bengaluru · Est. 2014
      </footer>
    </div>
  )
}
