// POST /api/admin/booking-backfill
// Creates a Hub `bookings` row for a match that happened but was never
// entered into Hub at all — see src/lib/bookingBackfill.ts for how this
// differs from scorecardBackfill.ts (which assumes the booking exists).
//
// Admin-only, not wrangler — unlike sync-match-stats/upload, this route
// creates real booking rows and bypasses R1-R6 scheduling validation, and
// the page it serves lives under /admin (layout already redirects any
// non-admin away), so gating any wider than that here would be a route
// nobody but an admin could ever actually reach.
//
// dry_run: true  → preview only from CricHeroes, no writes, safe to repeat
// dry_run: false → creates the booking, then chains parse+sync

import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { RATE_LIMITS, rateLimit } from '@/lib/rateLimit'
import { bookingBackfillRequestSchema } from '@/lib/schemas'
import { previewBackfillMatch, createBackfillBooking } from '@/lib/bookingBackfill'

export const maxDuration = 60

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  const user = session?.user as any
  if (!user?.isAdmin) {
    return NextResponse.json({ error: 'Unauthorised' }, { status: 403 })
  }

  const limited = await rateLimit(req, RATE_LIMITS.adminWrite, user.playerId)
  if (limited) return limited

  const body = await req.json().catch(() => null)
  const parsedBody = bookingBackfillRequestSchema.safeParse(body)
  if (!parsedBody.success) {
    return NextResponse.json(
      { error: parsedBody.error.issues[0]?.message ?? 'Invalid request' },
      { status: 400 }
    )
  }
  const input = parsedBody.data

  if (input.dry_run) {
    try {
      const preview = await previewBackfillMatch(input.match_id)
      return NextResponse.json({ preview })
    } catch (err: any) {
      return NextResponse.json({ error: err?.message ?? 'Preview failed' }, { status: 502 })
    }
  }

  const result = await createBackfillBooking({
    match_id:      input.match_id,
    tournament_id: input.tournament_id,
    format:        input.format,
    slot_time:     input.slot_time,
  })

  if (!result.ok && !result.booking_id) {
    return NextResponse.json({ error: result.error }, { status: 400 })
  }

  return NextResponse.json(result)
}
