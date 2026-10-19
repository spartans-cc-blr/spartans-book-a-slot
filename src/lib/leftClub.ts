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
