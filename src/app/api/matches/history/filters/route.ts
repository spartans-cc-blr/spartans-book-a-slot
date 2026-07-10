// GET /api/matches/history/filters
// Signed-in members only (same gate as the rest of /api/matches/history) —
// returns the distinct tournaments and venues that actually appear among
// past confirmed matches, so the filter dropdowns on /matches/history never
// offer an option with zero results. Deliberately not sourced from the full
// /api/tournaments or /api/grounds lists: a tournament that's since been
// marked inactive, or a one-off away venue, still needs to show up here as
// long as a historical match references it.

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
    .select('tournament_id, venue, tournament:tournaments(id, name)')
    .eq('status', 'confirmed')
    .lt('game_date', today)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const tournamentMap = new Map<string, string>()
  const venueSet = new Set<string>()
  for (const b of data ?? []) {
    const tournamentName = (b.tournament as any)?.name
    if (b.tournament_id && tournamentName) tournamentMap.set(b.tournament_id, tournamentName)
    if (b.venue) venueSet.add(b.venue)
  }

  const tournaments = Array.from(tournamentMap, ([id, name]) => ({ id, name }))
    .sort((a, b) => a.name.localeCompare(b.name))
  const venues = Array.from(venueSet).sort()

  return NextResponse.json({ tournaments, venues, formats: ['T20', 'T30'] })
}
