// GET /api/captains-corner/context-stats?player_id=&booking_id=
// Powers the tap-to-expand "Form" panel in Captains' Corner's per-slot
// player list — a player's record scoped independently to this booking's
// tournament, ground, and format. See src/lib/playerStats.ts
// getPlayerBookingContextStats() for the query logic.
//
// Read-only, captain/admin gated (same audience as every other
// Captains' Corner data route, e.g. /api/availability/weekend) — not
// scoped to "your own slot" since any active captain can select any slot
// in this feature, matching the existing pattern.

import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { RATE_LIMITS, rateLimit } from '@/lib/rateLimit'
import { getPlayerBookingContextStats } from '@/lib/playerStats'

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions)
  const user = session?.user as any

  if (!user?.isCaptain && !user?.isAdmin) {
    return NextResponse.json({ error: 'Unauthorised' }, { status: 403 })
  }

  const limited = await rateLimit(req, RATE_LIMITS.publicRead, user.playerId)
  if (limited) return limited

  const { searchParams } = new URL(req.url)
  const playerId  = searchParams.get('player_id')
  const bookingId = searchParams.get('booking_id')

  if (!playerId || !UUID_RE.test(playerId) || !bookingId || !UUID_RE.test(bookingId)) {
    return NextResponse.json({ error: 'player_id and booking_id must be valid UUIDs' }, { status: 400 })
  }

  try {
    const stats = await getPlayerBookingContextStats(playerId, bookingId)
    return NextResponse.json(stats)
  } catch (err: any) {
    return NextResponse.json({ error: err.message ?? 'Failed to load context stats' }, { status: 500 })
  }
}
