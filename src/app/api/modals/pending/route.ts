// GET /api/modals/pending
// One request for everything the global modals need on load — milestone
// recognition, birthday wishes and (admin only) pending match fees — instead
// of three separate fetches on every page load. Each part has the same
// auth posture as its individual route (signed-in, non-expelled; fees admin
// only — an admin without a player row still gets the fee part). A failure in one part yields an empty list for it, never an error
// for the others.

import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { createServiceClient } from '@/lib/supabase'
import { RATE_LIMITS, rateLimit } from '@/lib/rateLimit'
import { getUnseenAchievements, getUnseenBirthdays, getUnmarkedFixtureCount } from '@/lib/modalFeed'
import { getPendingFeeBookings } from '@/lib/feeReminders'

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions)
  const user = session?.user as any
  if (!session || (!user?.playerId && !user?.isAdmin)) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
  if (user.playerStatus === 'expelled') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const limited = await rateLimit(req, RATE_LIMITS.publicRead, user.playerId ?? user.email)
  if (limited) return limited

  const supabase = createServiceClient()
  const [achievements, birthdays, bookings, unmarked] = await Promise.all([
    user.playerId ? getUnseenAchievements(supabase, user.playerId).catch(() => []) : Promise.resolve([]),
    user.playerId ? getUnseenBirthdays(supabase, user.playerId).catch(() => []) : Promise.resolve([]),
    user.isAdmin ? getPendingFeeBookings().catch(() => []) : Promise.resolve([]),
    user.playerId ? getUnmarkedFixtureCount(supabase, user.playerId).catch(() => null) : Promise.resolve(null),
  ])
  return NextResponse.json({ achievements, birthdays, bookings, unmarked })
}
