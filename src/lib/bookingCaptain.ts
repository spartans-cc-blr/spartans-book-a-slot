// Resolves the captain for a booking create/edit.
//
// Normal rule: a booking can only be assigned a currently-active captain.
// Past matches are the exception — the person who actually led a game that
// has already been played may since have gone inactive, or may never have
// been a "captain" in the master list at all (a stand-in). So for a past
// game_date the admin can pick any captain (active or not) or any player.
// A player with no captains row gets an inactive one created, because
// bookings.captain_id is an FK to captains(id).

import type { SupabaseClient } from '@supabase/supabase-js'
import { istDateString } from '@/lib/birthdays'

export function isPastGameDate(gameDate: string): boolean {
  return !!gameDate && gameDate < istDateString()
}

export type CaptainResolution = { id: string | null } | { error: string }

export async function resolveBookingCaptain(
  supabase: SupabaseClient,
  opts: {
    captainId?: string | null
    captainPlayerId?: string | null
    gameDate: string
    /** The booking's already-stored captain_id (edit only) — re-saving it is always allowed. */
    currentCaptainId?: string | null
  },
): Promise<CaptainResolution> {
  const past = isPastGameDate(opts.gameDate)

  if (opts.captainPlayerId) {
    if (!past) {
      return { error: 'A player who is not an active captain can only be assigned to a past match' }
    }
    // Prefer any existing captains row for this player (active first).
    const { data: rows } = await supabase
      .from('captains')
      .select('id, active')
      .eq('player_id', opts.captainPlayerId)
      .order('active', { ascending: false })
      .limit(1)
    if (rows && rows.length > 0) return { id: rows[0].id }

    const { data: player } = await supabase
      .from('players')
      .select('id, name')
      .eq('id', opts.captainPlayerId)
      .single()
    if (!player) return { error: 'Player not found' }

    const { data: created, error } = await supabase
      .from('captains')
      .insert({ name: player.name, player_id: player.id, active: false })
      .select('id')
      .single()
    if (error || !created) return { error: error?.message ?? 'Could not create captain record' }
    return { id: created.id }
  }

  if (opts.captainId) {
    const { data: cap } = await supabase
      .from('captains')
      .select('id, active')
      .eq('id', opts.captainId)
      .single()
    if (!cap) return { error: 'Captain not found' }
    if (!cap.active && !past && opts.captainId !== opts.currentCaptainId) {
      return { error: 'Captain is not active' }
    }
    return { id: cap.id }
  }

  return { id: null }
}
