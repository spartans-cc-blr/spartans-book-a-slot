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

  // 1. All confirmed bookings with tournament + captain joins (via tournament)
  const { data: rawBookings } = await supabase
    .from('bookings')
    .select(`
      id, game_date, slot_time, format, cricheroes_url, match_id,
      tournament:tournaments!bookings_tournament_id_fkey(
        id, name, organiser_name, organiser_contact,
        total_league_games, cricheroes_points_table_url,
        captain_id,
        captains!tournaments_captain_id_fkey(id, name)
      )
    `)
    .eq('status', 'confirmed')
    .not('tournament_id', 'is', null)
    .order('game_date', { ascending: true })

  // Match result for any finished games with a synced scorecard — read-through
  // cache table, same source matches/history and the tournament share page
  // use. Not every past game has one yet (scorecard sync is a separate
  // manual/cron step), so this is a best-effort attach, not a requirement.
  const matchIds = (rawBookings ?? []).map(b => b.match_id).filter((id): id is string => !!id)
  const { data: statsRows } = matchIds.length
    ? await supabase.from('match_stats_cache').select('match_id, match_result').in('match_id', matchIds)
    : { data: [] }
  const resultByMatchId = new Map((statsRows ?? []).map(r => [r.match_id, r.match_result]))

  // Supabase returns FK joins as arrays — cast to single objects to match Booking type
  const bookings = (rawBookings ?? []).map(b => ({
    ...b,
    match_result: b.match_id ? resultByMatchId.get(b.match_id) ?? null : null,
    tournament: Array.isArray(b.tournament) ? b.tournament[0] ?? null : b.tournament,
  })) as unknown as Array<{
    id: string
    game_date: string
    slot_time: string
    format: string | null
    cricheroes_url: string | null
    match_result: string | null
    tournament: {
      id: string
      name: string
      organiser_name: string | null
      organiser_contact: string | null
      total_league_games: number | null
      cricheroes_points_table_url: string | null
      captain_id: string | null
      captains: { id: string; name: string } | null
    } | null
  }>

  const today = new Date().toISOString().split('T')[0]

  // 2. Squad status per booking — only need announced rows to determine "completed"
  //    A game is "completed" when game_date < today AND squad status = announced.
  //    Cap at 100 booking IDs (vibe-security: uncapped .in() is S-4 risk)
  const bookingIds = bookings.map(b => b.id).slice(0, 100)
  const { data: squads } = bookingIds.length
    ? await supabase
        .from('squad')
        .select('booking_id, status, is_captain, players(id, name, cricheroes_url)')
        .in('booking_id', bookingIds)
        .eq('status', 'announced')
    : { data: [] }

  // Players represented per tournament + per-booking squad captain — dedupe + sort,
  // sourced from announced squads only. "Players represented" is specifically a
  // history of who has actually played, so it's restricted to past bookings
  // (game_date < today) — bookingCaptainMap stays unrestricted since it also
  // feeds the captain badge on upcoming/today's fixtures, not just past ones.
  const bookingToTournamentId = new Map(bookings.map(b => [b.id, b.tournament?.id ?? null]))
  const pastBookingIds = new Set(bookings.filter(b => b.game_date < today).map(b => b.id))
  const tournamentPlayersMap: Record<string, { id: string; name: string; cricheroes_url: string | null }[]> = {}
  const bookingCaptainMap: Record<string, { name: string; cricheroes_url: string | null }> = {}
  for (const row of (squads ?? []) as any[]) {
    const player = Array.isArray(row.players) ? row.players[0] : row.players
    if (!player) continue
    const tournamentId = bookingToTournamentId.get(row.booking_id)
    if (tournamentId && pastBookingIds.has(row.booking_id)) {
      const list = tournamentPlayersMap[tournamentId] ?? (tournamentPlayersMap[tournamentId] = [])
      if (!list.some(p => p.id === player.id)) list.push(player)
    }
    if (row.is_captain) {
      bookingCaptainMap[row.booking_id] = { name: player.name, cricheroes_url: player.cricheroes_url }
    }
  }
  for (const list of Object.values(tournamentPlayersMap)) {
    list.sort((a, b) => a.name.localeCompare(b.name))
  }

  // 3. All active captains
  const { data: captains } = await supabase
    .from('captains')
    .select('id, name, player_id')
    .eq('active', true)
    .order('name')

  // 4. Resolve captainId for the current viewer if they are a captain
  //    Use player_id FK — no fragile name matching
  let viewerCaptainId: string | null = null

  if (user?.isCaptain && user?.playerId) {
    const myRecord = (captains ?? []).find(c => c.player_id === user.playerId)
    if (myRecord) {
      // Only show personal bandwidth view if they have at least one upcoming booking
      // (via tournament.captain_id, not booking.captain_id)
      const hasActiveBooking = bookings.some(
        b => b.tournament?.captain_id === myRecord.id && b.game_date >= today
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
      <main className="min-h-screen bg-parchment px-4 md:px-8 py-8 max-w-4xl mx-auto">
        <TournamentPlannerClient
          bookings={bookings}
          announcedBookingIds={announcedBookingIds}
          captains={captains ?? []}
          today={today}
          tournamentPlayersMap={tournamentPlayersMap}
          bookingCaptainMap={bookingCaptainMap}
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
