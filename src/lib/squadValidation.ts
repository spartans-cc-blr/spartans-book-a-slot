import { createServiceClient } from '@/lib/supabase'

const ELIGIBLE_RESPONSES = new Set(['Y', 'O', 'E'])

/**
 * Given a booking and a list of player IDs, returns the subset of those
 * player IDs whose availability response for that booking is NOT in
 * (Y, O, E) — i.e. they are on leave (L) or have not responded at all.
 */
export async function findIneligiblePlayers(
  supabase: ReturnType<typeof createServiceClient>,
  bookingId: string,
  playerIds: string[]
): Promise<string[]> {
  if (playerIds.length === 0) return []

  const { data, error } = await supabase
    .from('availability')
    .select('player_id, response')
    .eq('booking_id', bookingId)
    .in('player_id', playerIds)

  if (error) throw error

  const responseByPlayer = new Map<string, string>(
    (data ?? []).map(row => [row.player_id, row.response])
  )

  return playerIds.filter(pid => {
    const response = responseByPlayer.get(pid)
    return !response || !ELIGIBLE_RESPONSES.has(response)
  })
}
