// Shared per-booking authorization for scorecard verify/reconciliation
// actions. Three independent ways in, any one is sufficient:
//   1. wrangler/admin — any booking
//   2. captain/VC — but only for THEIR OWN booking (squad row lookup, never
//      just "is this player a captain anywhere")
//   3. this match's own resolved top performer (batting or bowling, see
//      matchTopPerformers.ts) — but only for THAT ONE booking. Scoped
//      access, not a role: a player who topped one match's scorecard gets
//      no standing permission on any other match.
//
// vibe-security: never a role-only check. Used by both
// /api/matches/[id]/verify-scorecard and /api/matches/[id]/flag-reconciliation
// so the two routes can't drift out of sync on who's allowed to act.

import { createServiceClient } from '@/lib/supabase'
import { resolveMatchTopPerformers, topPerformerPlayerIds } from '@/lib/matchTopPerformers'

export async function canActOnScorecard(
  supabase: ReturnType<typeof createServiceClient>,
  bookingId: string,
  user: any
): Promise<boolean> {
  if (user.isWrangler || user.isAdmin) return true

  const { data: squadRow } = await supabase
    .from('squad')
    .select('is_captain, is_vc')
    .eq('booking_id', bookingId)
    .eq('player_id', user.playerId)
    .maybeSingle()
  if (squadRow?.is_captain || squadRow?.is_vc) return true

  const performers = await resolveMatchTopPerformers(supabase, bookingId)
  return topPerformerPlayerIds(performers).has(user.playerId)
}
