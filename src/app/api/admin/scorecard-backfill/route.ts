// GET  /api/admin/scorecard-backfill — list past confirmed bookings that
//      have a CricHeroes match_id but no synced scorecard yet.
// POST /api/admin/scorecard-backfill — process exactly one booking (fetch
//      from CricHeroes, parse, persist). Called once per row by the admin
//      backfill page's client-side loop — never loops server-side itself,
//      since a Vercel function has a hard ceiling well under what a full
//      historical backlog could take.

import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { createServiceClient } from '@/lib/supabase'
import { RATE_LIMITS, rateLimit } from '@/lib/rateLimit'
import { backfillOneBooking } from '@/lib/scorecardBackfill'

export const maxDuration = 60

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions)
  const user = session?.user as any
  if (!user?.isAdmin) return NextResponse.json({ error: 'Unauthorised' }, { status: 403 })

  const supabase = createServiceClient()
  const today = new Date().toISOString().split('T')[0]

  const { data: bookings, error } = await supabase
    .from('bookings')
    .select('id, game_date, slot_time, opponent_name, match_id, scorecard_uploads(status, error_message)')
    .eq('status', 'confirmed')
    .lt('game_date', today)
    .not('match_id', 'is', null)
    .order('game_date', { ascending: false })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const eligible = (bookings ?? [])
    .map((b: any) => ({
      ...b,
      // scorecard_uploads.booking_id is UNIQUE, so PostgREST should embed
      // this as a single object — but a defensive array check costs
      // nothing and avoids a footgun if that ever changes.
      su: Array.isArray(b.scorecard_uploads) ? b.scorecard_uploads[0] : b.scorecard_uploads,
    }))
    .filter(b => !b.su || !['synced', 'fees_applied'].includes(b.su.status))

  return NextResponse.json({
    bookings: eligible.map(b => ({
      booking_id:      b.id,
      game_date:       b.game_date,
      slot_time:       b.slot_time,
      opponent_name:   b.opponent_name,
      match_id:        b.match_id,
      current_status:  b.su?.status ?? null,
      error_message:   b.su?.error_message ?? null,
    })),
  })
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  const user = session?.user as any
  if (!user?.isAdmin) return NextResponse.json({ error: 'Unauthorised' }, { status: 403 })

  const limited = await rateLimit(req, RATE_LIMITS.adminWrite, user.playerId)
  if (limited) return limited

  const body = await req.json().catch(() => null)
  const bookingId = body?.booking_id
  if (!bookingId || typeof bookingId !== 'string') {
    return NextResponse.json({ error: 'booking_id required' }, { status: 400 })
  }

  const result = await backfillOneBooking(bookingId)
  return NextResponse.json(result)
}
