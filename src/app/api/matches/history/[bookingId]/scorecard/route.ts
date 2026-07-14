// GET /api/matches/history/[bookingId]/scorecard
// Any signed-in, non-expelled member — match stats are not sensitive.
// Returns the full batting/bowling/fielding/team_list breakdown cached in
// match_stats_cache for this booking's match_id.

import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { createServiceClient } from '@/lib/supabase'

export async function GET(
  req: NextRequest,
  { params }: { params: { bookingId: string } }
) {
  const session = await getServerSession(authOptions)
  const user = session?.user as any
  if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
  if (user?.playerStatus === 'expelled') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const supabase = createServiceClient()

  const { data: booking, error: bookingErr } = await supabase
    .from('bookings')
    .select('match_id')
    .eq('id', params.bookingId)
    .single()

  if (bookingErr || !booking?.match_id) {
    return NextResponse.json({ error: 'No stats available for this match' }, { status: 404 })
  }

  const { data: stats, error: statsErr } = await supabase
    .from('match_stats_cache')
    .select('batting, bowling, fielding, team_list')
    .eq('match_id', booking.match_id)
    .maybeSingle()

  if (statsErr) return NextResponse.json({ error: statsErr.message }, { status: 500 })
  if (!stats) return NextResponse.json({ error: 'Stats not synced yet' }, { status: 404 })

  return NextResponse.json({
    batting:   stats.batting ?? [],
    bowling:   stats.bowling ?? [],
    fielding:  stats.fielding ?? [],
    team_list: stats.team_list ?? [],
  })
}
