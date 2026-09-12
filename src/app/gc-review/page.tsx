import { redirect } from 'next/navigation'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { createServiceClient } from '@/lib/supabase'
import { AdminSidebar } from '@/components/admin/AdminSidebar'
import { SiteNav } from '@/components/ui/SiteNav'
import { GCReviewClient } from '@/components/admin/GCReviewClient'
import { getISOWeek, getISOWeekYear, parseISO, startOfISOWeek, addDays, format } from 'date-fns'
import type { Metadata } from 'next'
import { InviteLinkButton } from '@/components/ui/InviteLinkButton'

export const metadata: Metadata = {
  title: 'GC Review — Spartans CC',
}

export const revalidate = 0

// Same ISO-week bucketing convention as /captains-corner — a midweek game
// (e.g. a Monday fixture) shares a weekKey with the Sat/Sun that follows it
// in the same ISO week, rather than the weekend that just finished.
function weekKey(dateStr: string): string {
  const d = parseISO(dateStr)
  return `${getISOWeekYear(d)}-W${String(getISOWeek(d)).padStart(2, '0')}`
}

function weekLabel(dateStr: string): string {
  const d = parseISO(dateStr)
  const saturday = addDays(startOfISOWeek(d), 5)
  const sunday   = addDays(saturday, 1)
  return `${format(saturday, 'd MMM')} – ${format(sunday, 'd MMM yyyy')}`
}

function getMatchEndTime(gameDate: string, slotTime: string, matchFormat: string): Date {
  const end = new Date(`${gameDate}T${slotTime}:00+05:30`)
  const durationHours = matchFormat === 'T30' ? 5.5 : 3.5
  end.setTime(end.getTime() + durationHours * 60 * 60 * 1000)
  return end
}

function isMatchExpired(gameDate: string, slotTime: string, matchFormat: string): boolean {
  return new Date() >= getMatchEndTime(gameDate, slotTime, matchFormat)
}

export default async function GCReviewPage() {
  const session = await getServerSession(authOptions)
  const user    = session?.user as any

  if (!session) redirect('/login')
  if (!user?.isAdmin && !user?.isGC) redirect('/fixtures')

  const supabase  = createServiceClient()
  const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString().split('T')[0]

  // ── Fetch upcoming confirmed bookings ──────────────────────
  // Previously this queried a fixed "today's calendar Mon–Sun" window,
  // which meant a booking dated exactly the following Monday (the start of
  // the *next* ISO week) was invisible here until match day itself — see
  // features/squad-selection.md for the incident this fixes.
  const { data: bookings } = await supabase
    .from('bookings')
    .select('id, game_date, slot_time, match_time, format, opponent_name, tournament:tournaments(name, ball_type, ground:grounds(name, maps_url, hospital_url))')
    .eq('status', 'confirmed')
    .gte('game_date', yesterday)
    .order('game_date', { ascending: true })
    .order('slot_time', { ascending: true })
    .limit(20) // cap to a reasonable window, mirrors /captains-corner

  const activeBookings = (bookings ?? []).filter(b =>
    !isMatchExpired(b.game_date, b.slot_time, b.format ?? 'T20')
  )

  // ── Restrict to the next two rolling weekends only ─────────────
  // Mirrors /captains-corner's own scoping exactly (same rationale, same
  // weekKey() grouping) so the two pages can never disagree on which
  // weekend a given booking belongs to. A squad can be drafted and
  // submitted for a weekday game well ahead of its own weekend — GC needs
  // to be able to see and act on it before match day, not just on it.
  const seenWeekKeys: string[] = []
  for (const b of activeBookings) {
    const wk = weekKey(b.game_date)
    if (!seenWeekKeys.includes(wk)) seenWeekKeys.push(wk)
    if (seenWeekKeys.length >= 2) break
  }
  const allowedWeekKeys = new Set(seenWeekKeys)
  const scopedBookings  = activeBookings.filter(b => allowedWeekKeys.has(weekKey(b.game_date)))

  const bookingIds = scopedBookings.map(b => b.id)

  // The four queries below all depend only on `bookingIds` (already
  // resolved above), never on each other — issued together instead of
  // one-after-another.
  const [
    { data: captains },
    { data: avail },
    { data: squads },
    { data: draftSquads },
  ] = bookingIds.length > 0
    ? await Promise.all([
        // This booking's own captain (migration 066) — was previously
        // attempted with a nonexistent bookings_captain_id_fkey pointed at
        // players (see the incident note in tournament-planner/share/[id]),
        // which failed silently. The FK now genuinely exists and resolves
        // to captains, same as tournaments.captain_id everywhere else.
        supabase
          .from('bookings')
          .select('id, captain:captains!bookings_captain_id_fkey(name, players(whatsapp))')
          .in('id', bookingIds),

        // Y/O/E availability (all three, not just O/E) — Y included so the
        // matrix can show all available players and flag anyone who
        // responded Y but was not selected in any squad.
        supabase
          .from('availability')
          .select('player_id, booking_id, response, players!availability_player_id_fkey(id, name, cricheroes_url)')
          .in('response', ['Y', 'O', 'E'])
          .in('booking_id', bookingIds),

        // All squads for these bookings — match_role included for role
        // composition display in the matrix and approval panels.
        supabase
          .from('squad')
          .select('player_id, booking_id, status, is_captain, is_vc, is_wk, match_role, players(id, name, primary_skill, is_captain, fee_exemptions(start_date, end_date))')
          .in('booking_id', bookingIds)
          .in('status', ['pending_approval', 'approved', 'announced']),

        // Draft squad player IDs (read-only, for matrix context) — GC
        // cannot approve/return draft squads; this only shows whether an
        // available player is already in the captain's draft selection.
        supabase
          .from('squad')
          .select('player_id, booking_id')
          .in('booking_id', bookingIds)
          .eq('status', 'draft'),
      ])
    : [{ data: [] }, { data: [] }, { data: [] }, { data: [] }]

  // Build captainMap: bookingId → { name, whatsapp }
  const captainMap: Record<string, { name: string; whatsapp: string | null }> = {}
  for (const row of captains ?? []) {
    const raw = row.captain as any
    const c = Array.isArray(raw) ? raw[0] ?? null : raw
    if (!c) continue
    const playerRow = Array.isArray(c.players) ? c.players[0] ?? null : c.players
    captainMap[row.id] = { name: c.name, whatsapp: playerRow?.whatsapp ?? null }
  }

  // Build draftSquadMap: bookingId → player_id[]
  const draftSquadMap: Record<string, string[]> = {}
  for (const row of draftSquads ?? []) {
    if (!draftSquadMap[row.booking_id]) draftSquadMap[row.booking_id] = []
    draftSquadMap[row.booking_id].push(row.player_id)
  }

  // ── Group into per-weekend blocks, chronological order ─────────
  // A weekKey group always corresponds to one weekLabel (its own Sat/Sun),
  // even when it only contains a midweek fixture that hasn't reached its
  // own weekend yet.
  const weekendMap: Record<string, { label: string; bookings: typeof scopedBookings }> = {}
  for (const b of scopedBookings) {
    const wk = weekKey(b.game_date)
    if (!weekendMap[wk]) weekendMap[wk] = { label: weekLabel(b.game_date), bookings: [] }
    weekendMap[wk].bookings.push(b)
  }
  const weekendOrder = Object.keys(weekendMap).sort()

  return (
    <div className="min-h-screen bg-ink flex flex-col">
      <SiteNav activePage="gc" />
      <div className="flex flex-1">
        <AdminSidebar />
        <main className="flex-1 px-5 md:px-8 lg:px-10 py-8 max-w-5xl">
          <div className="mb-6">
            <h1 className="font-cinzel text-xl font-bold text-gold">GC Review</h1>
            <p className="font-rajdhani text-sm text-zinc-500 mt-1">
              Review squad fairness and approve or return each slot before captains announce.
            </p>
          </div>
          <InviteLinkButton />
          {weekendOrder.length === 0 ? (
            <p className="font-rajdhani text-zinc-500 text-sm mt-4">No confirmed upcoming fixtures found.</p>
          ) : (
            <div className="flex flex-col gap-10 mt-4">
              {weekendOrder.map(wk => {
                const group       = weekendMap[wk]
                const idsInGroup  = new Set(group.bookings.map(b => b.id))
                return (
                  <GCReviewClient
                    key={wk}
                    weekLabel={group.label}
                    bookings={group.bookings as any}
                    avail={(avail ?? []).filter((a: any) => idsInGroup.has(a.booking_id)) as any}
                    squads={(squads ?? []).filter((s: any) => idsInGroup.has(s.booking_id)) as any}
                    draftSquadMap={Object.fromEntries(
                      Object.entries(draftSquadMap).filter(([bookingId]) => idsInGroup.has(bookingId))
                    )}
                    captainMap={captainMap}
                  />
                )
              })}
            </div>
          )}
        </main>
      </div>
    </div>
  )
}
