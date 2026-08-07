// GET /api/milestones/unseen
// Any signed-in, non-expelled member — this is a club-wide broadcast, not
// scoped to whoever achieved the milestone or whoever triggered the sync
// that detected it (see features/milestone-recognition.md). Returns every
// milestone logged since this player's own `players.milestones_seen_at`
// cursor, so a player sees each achievement exactly once no matter which
// page they open next — including one detected by the unattended
// twice-daily scorecard cron, which has no user present to show anything to
// at detection time.

import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { createServiceClient } from '@/lib/supabase'
import { RATE_LIMITS, rateLimit } from '@/lib/rateLimit'

const MAX_RESULTS = 20

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions)
  const user = session?.user as any
  if (!session || !user?.playerId) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
  if (user.playerStatus === 'expelled') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const limited = await rateLimit(req, RATE_LIMITS.publicRead, user.playerId)
  if (limited) return limited

  const supabase = createServiceClient()

  const { data: me, error: meErr } = await supabase
    .from('players').select('milestones_seen_at').eq('id', user.playerId).single()
  if (meErr) return NextResponse.json({ error: meErr.message }, { status: 500 })

  const { data, error } = await supabase
    .from('milestone_achievements')
    .select(`
      id, milestone_type, milestone_value, year, achieved_at,
      player:players(id, name, photo_url, cricheroes_url),
      booking:bookings(game_date, opponent_name)
    `)
    .gt('achieved_at', me?.milestones_seen_at ?? '1970-01-01')
    .order('achieved_at', { ascending: true })
    .limit(MAX_RESULTS)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ achievements: data ?? [] })
}
