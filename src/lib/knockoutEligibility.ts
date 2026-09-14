// Knockout-only availability eligibility.
//
// A knockout game (bookings.stage_type === 'knockout') can only be marked
// available/unavailable by a player who actually represented the
// tournament during its league stage — named in an *announced* squad for
// at least one of the tournament's confirmed, already-played, non-knockout
// bookings. Batting, bowling, or effecting a dismissal is not required —
// being in the announced XI for one league game is enough.
//
// Shared by the API guard (src/app/api/player-availability/route.ts), the
// two fixtures pages that render the availability panel
// (src/app/fixtures/page.tsx, src/app/fixtures/[id]/page.tsx), and the
// client-side button UI (FixturesAvailability.tsx) — a plain module with
// no server-only imports, so it's safe to import from a 'use client' file
// too (same "client-safe module" convention documented in
// features/team-stats.md §2). See features/knockout-day-protection.md §6.

import type { SupabaseClient } from '@supabase/supabase-js'

export const KNOCKOUT_INELIGIBLE_MESSAGE =
  "Only players who represented this tournament's league stage can mark availability for this knockout game"

/**
 * Which of `tournamentIds` has `playerId` represented in — i.e. named in
 * an announced squad for at least one of that tournament's confirmed,
 * already-played, non-knockout (league) bookings. `stage_type` NULL is
 * treated as league, same convention Team Record already uses
 * (features/team-stats.md §4). Batched across every tournament id passed
 * in, rather than one query per tournament — matches this codebase's
 * established "batch, don't loop" convention for a page-level fetch.
 */
export async function getEligibleTournamentIdsForPlayer(
  supabase: SupabaseClient,
  tournamentIds: string[],
  playerId: string | null | undefined
): Promise<Set<string>> {
  const uniqueIds = Array.from(new Set(tournamentIds.filter(Boolean)))
  if (uniqueIds.length === 0 || !playerId) return new Set()

  const today = new Date().toISOString().split('T')[0]

  const { data: bookings } = await supabase
    .from('bookings')
    .select('id, tournament_id, stage_type, game_date')
    .in('tournament_id', uniqueIds)
    .eq('status', 'confirmed')
    .lt('game_date', today)

  const leagueBookings = (bookings ?? []).filter(b => b.stage_type !== 'knockout')
  const leagueBookingIds = leagueBookings.map(b => b.id)
  if (leagueBookingIds.length === 0) return new Set()

  const { data: squadRows } = await supabase
    .from('squad')
    .select('booking_id')
    .eq('player_id', playerId)
    .eq('status', 'announced')
    .in('booking_id', leagueBookingIds)

  const tournamentByBooking = new Map(leagueBookings.map(b => [b.id, b.tournament_id as string]))
  const eligible = new Set<string>()
  for (const row of squadRows ?? []) {
    const tid = tournamentByBooking.get(row.booking_id)
    if (tid) eligible.add(tid)
  }
  return eligible
}

/**
 * Single-tournament convenience wrapper — used by the API route, which
 * only ever needs to check one booking's own tournament at a time.
 */
export async function isEligibleForKnockoutTournament(
  supabase: SupabaseClient,
  tournamentId: string,
  playerId: string | null | undefined
): Promise<boolean> {
  const eligible = await getEligibleTournamentIdsForPlayer(supabase, [tournamentId], playerId)
  return eligible.has(tournamentId)
}
