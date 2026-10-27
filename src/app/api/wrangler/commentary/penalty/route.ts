// PATCH /api/wrangler/commentary/penalty — wrangler/admin only.
// Records penalty runs for one uploaded commentary innings. Penalty runs are on the scorecard total
// but are not a delivery, so the printed commentary never contains them; the analytics view
// ball_by_ball_validation compares commentary runs + penalty_runs with the scorecard.
// vibe-security: role re-checked server-side, match id re-derived from the booking, input Zod-validated.

import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { createServiceClient } from '@/lib/supabase'
import { createAnalyticsClient } from '@/lib/playerIdentityResolution'
import { RATE_LIMITS, rateLimit } from '@/lib/rateLimit'
import { invalidateStatsCache } from '@/lib/statsCache'
import { commentaryPenaltySchema } from '@/lib/schemas'

export async function PATCH(req: NextRequest) {
  const session = await getServerSession(authOptions)
  const user = session?.user as any
  if (!user?.playerId) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
  if (!user?.isWrangler && !user?.isAdmin) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const limited = await rateLimit(req, RATE_LIMITS.adminWrite, user.playerId)
  if (limited) return limited

  const parsed = commentaryPenaltySchema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'Invalid request' }, { status: 400 })
  const { booking_id, side, penalty_runs, note } = parsed.data

  const { data: booking } = await createServiceClient()
    .from('bookings').select('match_id').eq('id', booking_id).eq('status', 'confirmed').maybeSingle()
  if (!booking?.match_id) return NextResponse.json({ error: 'Booking not found or has no match id' }, { status: 404 })

  const analytics = createAnalyticsClient()
  if (!analytics) return NextResponse.json({ error: 'Analytics database is not configured' }, { status: 500 })

  const { data, error } = await analytics
    .from('commentary_uploads')
    .update({ penalty_runs, penalty_note: penalty_runs > 0 ? (note ?? null) : null })
    .eq('match_id', booking.match_id)
    .eq('batting_side', side)
    .select('match_id')
  if (error) {
    console.error('[commentary/penalty]', error.message)
    return NextResponse.json({ error: 'Could not save penalty runs' }, { status: 500 })
  }
  if (!data?.length) return NextResponse.json({ error: 'No commentary uploaded for that innings yet' }, { status: 404 })

  invalidateStatsCache()
  return NextResponse.json({ ok: true })
}
