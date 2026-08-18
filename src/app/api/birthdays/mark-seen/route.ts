// POST /api/birthdays/mark-seen
// Advances the signed-in player's own players.birthday_wishes_seen_date to
// today's IST date. player_id and the date are both always server-derived,
// never taken from the request body — same "never trust the client"
// posture as every other player-scoped write in this app (push subscribe,
// player-availability, milestones/mark-seen).

import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { createServiceClient } from '@/lib/supabase'
import { RATE_LIMITS, rateLimit } from '@/lib/rateLimit'
import { istDateString } from '@/lib/birthdays'

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  const user = session?.user as any
  if (!session || !user?.playerId) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })

  const limited = await rateLimit(req, RATE_LIMITS.playerWrite, user.playerId)
  if (limited) return limited

  const supabase = createServiceClient()
  const { error } = await supabase
    .from('players')
    .update({ birthday_wishes_seen_date: istDateString() })
    .eq('id', user.playerId)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
