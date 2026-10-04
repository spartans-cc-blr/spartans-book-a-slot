// GET /api/matches/history/[bookingId]/commentary
// Any signed-in, non-expelled member, same gate as the scorecard route beside
// it: match stats are not sensitive. Returns the ball-by-ball rows (analytics
// DB view `ball_by_ball_linked`) for this booking's CricHeroes match, or
// { available: false } when no commentary has been uploaded for it. The match
// tabs call this lazily and only show Batting/Bowling/Fielding/Commentary when
// `available` is true, so matches without commentary look exactly as before.
// See features/ball-by-ball-tabs.md.

import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { createServiceClient } from '@/lib/supabase'
import { createAnalyticsClient } from '@/lib/playerIdentityResolution'
import { repairDismissedBatters, type BallRow } from '@/lib/ballByBall'

// One match is ~250-500 deliveries; PostgREST caps a response at 1000 rows by default.
const MAX_ROWS = 1000

const COLUMNS = [
  'batting_side', 'seq', 'over_no', 'ball_in_over', 'is_legal', 'bowler', 'batter', 'outcome',
  'runs_bat', 'extras', 'extra_type', 'runs_total', 'is_wicket', 'dismissal_kind', 'dismissal_text',
  'dismissed_batter', 'fielder', 'shot', 'direction', 'score_after', 'wickets_after',
  'bowler_player_id', 'batter_player_id', 'dismissed_player_id', 'fielder_player_id',
].join(', ')

export async function GET(
  _req: NextRequest,
  { params }: { params: { bookingId: string } }
) {
  const session = await getServerSession(authOptions)
  const user = session?.user as any
  if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
  if (user?.playerStatus === 'expelled') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const supabase = createServiceClient()
  const { data: booking } = await supabase
    .from('bookings')
    .select('match_id')
    .eq('id', params.bookingId)
    .maybeSingle()

  const empty = { available: false, balls: [] as unknown[] }
  if (!booking?.match_id) return NextResponse.json(empty)

  const analytics = createAnalyticsClient()
  if (!analytics) return NextResponse.json(empty)

  const { data, error } = await analytics
    .from('ball_by_ball_linked')
    .select(COLUMNS)
    .eq('match_id', String(booking.match_id))
    .order('batting_side', { ascending: true })
    .order('seq', { ascending: true })
    .limit(MAX_ROWS)

  if (error) {
    // Ball-by-ball is an optional extra on top of the scorecard: log it and let
    // the page fall back to the plain scorecard rather than erroring.
    console.error('[matches/commentary] analytics read failed:', error.message)
    return NextResponse.json(empty)
  }

  const balls = repairDismissedBatters((data ?? []) as unknown as BallRow[])
  return NextResponse.json({ available: balls.length > 0, balls })
}
