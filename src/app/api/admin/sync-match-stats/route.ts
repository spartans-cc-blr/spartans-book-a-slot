// POST /api/admin/sync-match-stats
// Same audience as the scorecard upload route: wrangler/admin can sync any
// booking, everyone else must be captain or VC for THIS specific booking —
// re-derived server-side via a squad lookup, never trusted from the client
// or from the UI gate that decided to show the button.
// Reads parsed stats from the separate analytics Supabase project and
// caches them into this project's match_stats_cache table. Source of truth
// remains the analytics DB — this is a read-through cache used for display
// only.

import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { createServiceClient } from '@/lib/supabase'
import { RATE_LIMITS, rateLimit } from '@/lib/rateLimit'
import { syncMatchStatsForBooking } from '@/lib/matchStatsSync'

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  const user = session?.user as any
  if (!user?.playerId) return NextResponse.json({ error: 'Unauthorised' }, { status: 403 })

  const limited = await rateLimit(req, RATE_LIMITS.adminWrite, user.playerId)
  if (limited) return limited

  const body = await req.json().catch(() => null)
  const booking_id = body?.booking_id
  if (!booking_id || typeof booking_id !== 'string') {
    return NextResponse.json({ error: 'booking_id required' }, { status: 400 })
  }

  if (!user.isWrangler && !user.isAdmin) {
    const supabase = createServiceClient()
    const { data: squadRow } = await supabase
      .from('squad')
      .select('is_captain, is_vc')
      .eq('booking_id', booking_id)
      .eq('player_id', user.playerId)
      .maybeSingle()

    if (!squadRow?.is_captain && !squadRow?.is_vc) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }
  }

  const result = await syncMatchStatsForBooking(booking_id, user.playerId ?? null)
  if (!result.ok) {
    const status = result.error === 'No stats found in analytics DB for this match_id' ? 404
      : result.error === 'No match_id on this booking' ? 400
      : 500
    return NextResponse.json({ error: result.error }, { status })
  }

  return NextResponse.json({ ok: true })
}
