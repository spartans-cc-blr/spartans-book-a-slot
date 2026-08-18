// GET /api/birthdays/today
// Any signed-in, non-expelled member — club-wide broadcast, same posture as
// GET /api/milestones/unseen. Returns every player whose dob falls on
// today's IST date, but only if the signed-in viewer hasn't already
// dismissed today's modal (players.birthday_wishes_seen_date != today) —
// once dismissed, an empty list is returned for the rest of the day so the
// modal doesn't reopen on the next page load.

import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { createServiceClient } from '@/lib/supabase'
import { RATE_LIMITS, rateLimit } from '@/lib/rateLimit'
import { getTodaysBirthdays, istDateString } from '@/lib/birthdays'

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions)
  const user = session?.user as any
  if (!session || !user?.playerId) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
  if (user.playerStatus === 'expelled') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const limited = await rateLimit(req, RATE_LIMITS.publicRead, user.playerId)
  if (limited) return limited

  const supabase = createServiceClient()
  const { data: me, error: meErr } = await supabase
    .from('players').select('birthday_wishes_seen_date').eq('id', user.playerId).single()
  if (meErr) return NextResponse.json({ error: meErr.message }, { status: 500 })

  const today = istDateString()
  if (me?.birthday_wishes_seen_date === today) {
    return NextResponse.json({ birthdays: [] })
  }

  const birthdays = await getTodaysBirthdays()
  return NextResponse.json({ birthdays })
}
