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
      id, game_date, slot_time, format, captain_id,vc_captain_id,
      tournament:tournaments!bookings_tournament_id_fkey(id, name, organiser_name, organiser_contact, total_league_games),
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
   }))

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
    .select('id, name')
    .eq('active', true)
    .order('name')

  // 4. Resolve captainId for the current viewer if they are a captain
  //    Match by name since captains table has no player_id FK yet
  // Clean version — replace the entire block above with this:
  let viewerCaptainId: string | null = null
  let viewerIsVC = false

 // Resolution logic — clean and simple:
  if (user?.isCaptain && user?.playerName) {
    const viewerName = (user.playerName as string).toLowerCase()
    const myRecord   = (captains ?? []).find(c => c.name.toLowerCase() === viewerName)

    if (myRecord) {
      // Are they a primary captain on any tournament?
      const asPrimary = bookings.find(b => b.captain_id === myRecord.id)

      // Are they a VC on any tournament?
      const asVC = bookings.find(
        b => b.tournament?.vc_captain_id === myRecord.id
      )

      if (asPrimary && !asVC) {
        viewerCaptainId = myRecord.id        // pure captain
      } else if (asVC && !asPrimary) {
        viewerCaptainId = asVC.captain_id    // pure VC — show primary captain's view
        viewerIsVC      = true
      } else if (asPrimary && asVC) {
        viewerCaptainId = myRecord.id        // captain on some, VC on others — own id takes precedence
        // follow-up sprint: support both simultaneously via captainIds[]
      }
    }
  }

  const announcedBookingIds: string[] = []
  const today = new Date().toISOString().split('T')[0]

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
            isVC: viewerIsVC,
          }}
        />
      </main>
    </>
  )
}