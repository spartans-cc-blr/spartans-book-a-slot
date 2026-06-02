import { redirect } from 'next/navigation'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { createServiceClient } from '@/lib/supabase'
import { AdminSidebar } from '@/components/admin/AdminSidebar'
import { SiteNav } from '@/components/ui/SiteNav'
import { GCReviewClient } from '@/components/admin/GCReviewClient'
import { startOfISOWeek, addDays, format, parseISO } from 'date-fns'
import type { Metadata } from 'next'
import { InviteLinkButton } from '@/components/ui/InviteLinkButton'

export const metadata: Metadata = {
  title: 'GC Review — Spartans CC',
}

export const revalidate = 0

export default async function GCReviewPage() {
  const session = await getServerSession(authOptions)
  const user    = session?.user as any

  if (!session) redirect('/login')
  if (!user?.isAdmin && !user?.isGC) redirect('/fixtures')

  const supabase  = createServiceClient()
  const today     = new Date()
  const monday    = startOfISOWeek(today)
  const saturday  = addDays(monday, 5)
  const sunday    = addDays(monday, 6)
  const weekStart = format(monday, 'yyyy-MM-dd')
  const weekEnd   = format(addDays(monday, 7), 'yyyy-MM-dd')
  const weekLabel = `${format(monday, 'd MMM')} – ${format(sunday, 'd MMM yyyy')}`

  // ── Fetch this weekend's confirmed bookings ────────────────
  const { data: bookings } = await supabase
    .from('bookings')
		.select('id, game_date, slot_time, format, opponent_name, tournament:tournaments(name, ball_type, ground:grounds(name, maps_url, hospital_url))')
		.eq('status', 'confirmed')
    .gte('game_date', weekStart)
    .lt('game_date', weekEnd)
    .order('game_date', { ascending: true })
    .order('slot_time', { ascending: true })

  const bookingIds = (bookings ?? []).map(b => b.id)

  // ADD — after const bookingIds = ...
  const { data: captains } = bookingIds.length > 0
    ? await supabase
        .from('bookings')
        .select('id, captain:players!bookings_captain_id_fkey(name, whatsapp)')
        .in('id', bookingIds)
    : { data: [] }
  
  // Build captainMap: bookingId → { name, whatsapp }
  const captainMap: Record<string, { name: string; whatsapp: string | null }> = {}
  for (const row of captains ?? []) {
    if (row.captain) captainMap[row.id] = row.captain as any
  }
  
  // ── Fetch Y/O/E availability (all three, not just O/E) ────
  // Y included so the matrix can show all available players and
  // flag anyone who responded Y but was not selected in any squad.
  const { data: avail } = bookingIds.length > 0
    ? await supabase
        .from('availability')
        .select('player_id, booking_id, response, players!availability_player_id_fkey(id, name, cricheroes_url)')
        .in('response', ['Y', 'O', 'E'])
        .in('booking_id', bookingIds)
    : { data: [] }

  // ── Fetch all squads for these bookings ────────────────────
  // match_role included for role composition display in the matrix and approval panels.
  const { data: squads } = bookingIds.length > 0
    ? await supabase
        .from('squad')
        .select('player_id, booking_id, status, is_captain, is_vc, is_wk, match_role, players(id, name, primary_skill, is_captain)')
        .in('booking_id', bookingIds)
        .in('status', ['pending_approval', 'approved', 'announced'])
    : { data: [] }

  // ── Fetch draft squad player IDs (read-only, for matrix context) ──
  // GC cannot approve/return draft squads — this data is used only to show
  // whether an available player is already in the captain's draft selection.
  const { data: draftSquads } = bookingIds.length > 0
    ? await supabase
        .from('squad')
        .select('player_id, booking_id')
        .in('booking_id', bookingIds)
        .eq('status', 'draft')
    : { data: [] }
 
  // Build draftSquadMap: bookingId → player_id[]
  const draftSquadMap: Record<string, string[]> = {}
  for (const row of draftSquads ?? []) {
    if (!draftSquadMap[row.booking_id]) draftSquadMap[row.booking_id] = []
    draftSquadMap[row.booking_id].push(row.player_id)
  }

  return (
    <div className="min-h-screen bg-ink flex flex-col">
      <SiteNav activePage="gc" />
      <div className="flex flex-1">
        <AdminSidebar />
        <main className="flex-1 px-5 md:px-8 lg:px-10 py-8 max-w-5xl">
          <div className="mb-6">
            <h1 className="font-cinzel text-xl font-bold text-gold">GC Review</h1>
            <p className="font-rajdhani text-sm text-zinc-500 mt-1">
              {weekLabel} · Review squad fairness and approve or return each slot before captains announce.
            </p>
          </div>
          <InviteLinkButton />
          <GCReviewClient
            weekLabel={weekLabel}
            bookings={(bookings ?? []) as any}
            avail={(avail ?? []) as any}
            squads={(squads ?? []) as any}
            draftSquadMap={draftSquadMap}
            captainMap={captainMap}
          />
        </main>
      </div>
    </div>
  )
}
