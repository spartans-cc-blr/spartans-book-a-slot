// A player whose newest player_absences row is reason = 'left_club' has left the
// club: they cannot sign in until an admin changes that row (see
// features/player-directory.md §8.1). Fails open on a DB error so an outage can
// never lock everyone out.
import type { SupabaseClient } from '@supabase/supabase-js'

export async function hasLeftClub(supabase: SupabaseClient, playerId: string): Promise<boolean> {
  const { data, error } = await supabase
    .from('player_absences')
    .select('reason')
    .eq('player_id', playerId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()
  if (error) {
    console.error('[leftClub] lookup error:', error.message)
    return false
  }
  return data?.reason === 'left_club'
}

// Newest player_absences reason per player, for a batch of players (one query,
// not one per player). A player with no rows, or whose newest row is a cleared
// (NULL) reason, is absent from the map. Fails open (empty map) on a DB error,
// so callers fall back to treating everyone as having no reason recorded.
export async function getLatestAbsenceReasons(
  supabase: SupabaseClient,
  playerIds: string[],
): Promise<Map<string, string>> {
  const out = new Map<string, string>()
  if (!playerIds.length) return out
  const seen = new Set<string>()
  for (let i = 0; i < playerIds.length; i += 200) {
    const { data, error } = await supabase
      .from('player_absences')
      .select('player_id, reason, created_at')
      .in('player_id', playerIds.slice(i, i + 200))
      .order('created_at', { ascending: false })
    if (error) {
      console.error('[leftClub] batch lookup error:', error.message)
      return new Map()
    }
    for (const row of data ?? []) {
      if (seen.has(row.player_id)) continue // rows are newest-first; first one wins
      seen.add(row.player_id)
      if (row.reason) out.set(row.player_id, row.reason)
    }
  }
  return out
}
