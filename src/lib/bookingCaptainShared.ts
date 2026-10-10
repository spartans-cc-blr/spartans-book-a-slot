// Client-safe bits of the booking-captain logic (no server imports).
// Server-side resolution lives in src/lib/bookingCaptain.ts.

export const CAPTAIN_PLAYER_PREFIX = 'player:'

/** Form value -> request fields. 'player:<id>' means "this player, not in the captains list". */
export function captainRequestFields(value: string): { captain_id?: string | null; captain_player_id?: string } {
  if (value.startsWith(CAPTAIN_PLAYER_PREFIX)) {
    return { captain_player_id: value.slice(CAPTAIN_PLAYER_PREFIX.length) }
  }
  return { captain_id: value || null }
}
