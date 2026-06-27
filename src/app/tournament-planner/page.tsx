import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { redirect } from 'next/navigation'
import { createServiceClient } from '@/lib/supabase'
import { SiteNav } from '@/components/ui/SiteNav'
import { TournamentPlannerClient } from '@/components/tournament-planner/TournamentPlannerClient'
import type { Metadata } from 'next'

export const metadata: Metadata = { title: 'Tournament Planner — Spartans CC' }
export const revalidate = 0

export default async function TournamentPlannerPage() {
   const session = await getServerSession(authOptions)
   const user    = session?.user as any
 
   // vibe-security: role check before any data fetch
   if (!session) redirect('/login')
   if (!user?.isCaptain && !user?.isGC && !user?.isAdmin) redirect('/fixtures')
 
  const supabase = createServiceClient()

  // 1. All confirmed bookings with tournament + captain joins
  const { data: rawBookings } = await supabase
    .from('bookings')
    .select(`
      id, game_date, slot_time, format, captain_id,
      tournament:tournaments!bookings_tournament_id_fkey(id, name, organiser_name, organiser_contact, total_league_games, cricheroes_points_table_url),
      captain:captains!bookings_captain_id_fkey(id, name)
    `)
    .eq('status', 'confirmed')
    .not('tournament_id', 'is', null)
    .order('game_date', { ascending: true })

     // Supabase returns FK joins as arrays — cast to single objects to match Booking type
   const bookings = (rawBookings ?? []).map(b => ({
     ...b,
     tournament: Array.isArray(b.tournament) ? b.tournament[0] ?? null : b.tournament,
     captain:    Array.isArray(b.captain)    ? b.captain[0]    ?? null : b.captain,
    })) as unknown as Array<{
     id: string
     game_date: string
     slot_time: string
     format: string | null
     captain_id: string | null
     tournament: {
       id: string
       name: string
       organiser_name: string | null
       organiser_contact: string | null
       total_league_games: number | null
       cricheroes_points_table_url: string | null
     } | null
     captain: { id: string; name: string } | null
   }>

  // 2. Squad status per booking — only need announced rows to determine "completed"
  //    A game is "completed" when game_date < today AND squad status = announced.
  //    Cap at 100 booking IDs (vibe-security: uncapped .in() is S-4 risk)
  const bookingIds = bookings.map(b => b.id).slice(0, 100)
  const { data: squads } = bookingIds.length
    ? await supabase
        .from('squad')
        .select('booking_id, status')
        .in('booking_id', bookingIds)
        .eq('status', 'announced')
    : { data: [] }

  // 3. All active captains
  const { data: captains } = await supabase
    .from('captains')
    .select('id, name, player_id')
    .eq('active', true)
    .order('name')

  const today = new Date().toISOString().split('T')[0]

  // 4. Resolve captainId for the current viewer if they are a captain
  //    Use player_id FK — no fragile name matching
  let viewerCaptainId: string | null = null

  if (user?.isCaptain && user?.playerId) {
    const myRecord = (captains ?? []).find(c => c.player_id === user.playerId)
    if (myRecord) {
      // Only show personal bandwidth view if they have at least one upcoming booking
      const hasActiveBooking = (bookings ?? []).some(
        b => b.captain_id === myRecord.id && b.game_date >= today
      )
      if (hasActiveBooking) {
        viewerCaptainId = myRecord.id
      }
    }
  }

  const announcedBookingIds: string[] = []

  return (
    <>
      <SiteNav activePage="planner" isAdmin={!!user?.isAdmin} />
      <main className="min-h-screen bg-ink-1 px-4 md:px-8 py-8 max-w-4xl mx-auto">
        <TournamentPlannerClient
          bookings={bookings}
          announcedBookingIds={announcedBookingIds}
          captains={captains ?? []}
          today={today}
          viewerRole={{
            isCaptain: !!user?.isCaptain,
            isGC:      !!user?.isGC,
            isAdmin:   !!user?.isAdmin,
            captainId: viewerCaptainId,
          }}
        />
      </main>
    </>
  )
}