// GET /api/matches/history/filters
// Signed-in members only (same gate as the rest of /api/matches/history) —
// returns the distinct tournaments, venues, months, and match results that
// actually appear among past confirmed matches, so the filter controls on
// /matches/history never offer an option with zero results. Deliberately
// not sourced from the full /api/tournaments or /api/grounds lists: a
// tournament that's since been marked inactive, or a one-off away venue,
// still needs to show up here as long as a historical match references it.

import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { createServiceClient } from '@/lib/supabase'

export async function GET() {
  const session = await getServerSession(authOptions)
  const user = session?.user as any
  if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
  if (user?.playerStatus === 'expelled') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const today = new Date().toISOString().split('T')[0]
  const supabase = createServiceClient()

  const { data, error } = await supabase
    .from('bookings')
    .select('game_date, tournament_id, venue, tournament:tournaments(id, name), match_stats_cache(match_result)')
    .eq('status', 'confirmed')
    .lt('game_date', today)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const tournamentMap = new Map<string, string>()
  const venueSet = new Set<string>()
  const monthSet = new Set<string>()
  const resultSet = new Set<string>()
  for (const b of data ?? []) {
    const tournamentName = (b.tournament as any)?.name
    if (b.tournament_id && tournamentName) tournamentMap.set(b.tournament_id, tournamentName)
    if (b.venue) venueSet.add(b.venue)
    monthSet.add(b.game_date.slice(0, 7)) // 'YYYY-MM-DD' -> 'YYYY-MM'
    const cache = Array.isArray(b.match_stats_cache) ? b.match_stats_cache[0] : b.match_stats_cache
    if ((cache as any)?.match_result) resultSet.add((cache as any).match_result)
  }

  const tournaments = Array.from(tournamentMap, ([id, name]) => ({ id, name }))
    .sort((a, b) => a.name.localeCompare(b.name))
  const venues = Array.from(venueSet).sort()
  // No count per month — it wouldn't reflect whatever role/tournament/venue/
  // format filters are active on the client, and a stale, filter-blind count
  // sitting on the chip label was confusing (see /matches/history feedback).
  // The list itself shows an always-accurate "N matches" total instead.
  const months = Array.from(monthSet).sort((a, b) => b.localeCompare(a)) // most recent first

  // 'WON' before 'LOST' (and anything else alphabetically after) rather than
  // a plain alphabetical sort, which would put LOST first.
  const RESULT_ORDER = ['WON', 'LOST']
  const results = Array.from(resultSet).sort((a, b) => {
    const ia = RESULT_ORDER.indexOf(a), ib = RESULT_ORDER.indexOf(b)
    if (ia !== -1 || ib !== -1) return (ia === -1 ? RESULT_ORDER.length : ia) - (ib === -1 ? RESULT_ORDER.length : ib)
    return a.localeCompare(b)
  })

  return NextResponse.json({ tournaments, venues, months, results, formats: ['T20', 'T30'] })
}
