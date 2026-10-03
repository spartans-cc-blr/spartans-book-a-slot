// Mirrors canonical opponents into the analytics DB (opponents_ref + match_dimensions.opponent_id)
// so SQL can group by opponent without a cross-project join. The Hub DB stays the source of
// truth. Everything here is best-effort and never throws: a failure is logged and the Hub write
// that triggered it still succeeds. See .claude/rules/features/opponent-identity.md.
//
// Server-only.

import type { SupabaseClient } from '@supabase/supabase-js'

// Upserts the opponent into opponents_ref and points match_dimensions.opponent_id at it for every
// synced booking that carries it. Call after create / edit / link / merge (for the surviving id).
export async function mirrorOpponent(
  hub: SupabaseClient,
  analytics: SupabaseClient | null,
  opponentId: string | null | undefined
): Promise<void> {
  if (!analytics || !opponentId) return
  try {
    const { data: opp } = await hub
      .from('opponents').select('id, name, is_marquee, auto_created').eq('id', opponentId).maybeSingle()
    if (!opp) return
    const { error: refErr } = await analytics.from('opponents_ref').upsert({
      opponent_id: opp.id,
      name: opp.name,
      is_marquee: opp.is_marquee,
      auto_created: opp.auto_created,
      synced_at: new Date().toISOString(),
    }, { onConflict: 'opponent_id' })
    if (refErr) console.error('[opponentMirror] opponents_ref upsert failed:', refErr.message)

    const { data: bookings } = await hub
      .from('bookings').select('match_id').eq('opponent_id', opponentId).not('match_id', 'is', null)
    const matchIds = Array.from(new Set((bookings ?? []).map(b => String(b.match_id))))
    if (matchIds.length > 0) {
      const { error: dimErr } = await analytics
        .from('match_dimensions').update({ opponent_id: opponentId }).in('match_id', matchIds)
      if (dimErr) console.error('[opponentMirror] match_dimensions repoint failed:', dimErr.message)
    }
  } catch (e) {
    console.error('[opponentMirror] mirrorOpponent threw:', e)
  }
}

// After a merge: the absorbed opponent no longer exists in the Hub.
export async function dropOpponentRef(analytics: SupabaseClient | null, opponentId: string): Promise<void> {
  if (!analytics) return
  try {
    const { error } = await analytics.from('opponents_ref').delete().eq('opponent_id', opponentId)
    if (error) console.error('[opponentMirror] opponents_ref delete failed:', error.message)
  } catch (e) {
    console.error('[opponentMirror] dropOpponentRef threw:', e)
  }
}
