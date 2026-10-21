// GET /api/milestones/unseen
// Any signed-in, non-expelled member — this is a club-wide broadcast, not
// scoped to whoever achieved the milestone or whoever triggered the sync
// that detected it (see features/milestone-recognition.md). Returns every
// achievement logged since this player's own `players.milestones_seen_at`
// cursor, merged from two sources — season milestones
// (`milestone_achievements`) and single-match performance highlights
// (`match_performance_achievements`) — so a player sees each achievement
// exactly once no matter which page they open next, including one detected
// by the unattended twice-daily scorecard cron, which has no user present
// to show anything to at detection time. Both sources share one cursor:
// dismissing the modal advances milestones_seen_at regardless of which
// source(s) it was showing.

import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { createServiceClient } from '@/lib/supabase'
import { RATE_LIMITS, rateLimit } from '@/lib/rateLimit'
import { getUnseenAchievements } from '@/lib/modalFeed'

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions)
  const user = session?.user as any
  if (!session || !user?.playerId) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
  if (user.playerStatus === 'expelled') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const limited = await rateLimit(req, RATE_LIMITS.publicRead, user.playerId)
  if (limited) return limited

  try {
    const achievements = await getUnseenAchievements(createServiceClient(), user.playerId)
    return NextResponse.json({ achievements })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
