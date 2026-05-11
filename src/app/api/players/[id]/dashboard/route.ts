import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { createServiceClient } from '@/lib/supabase'

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions)
  const user = session?.user as any

  // vibe-security: IDOR guard — player can only fetch their own dashboard
  if (!user?.playerId) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })
  if (!user.isAdmin && user.playerId !== params.id)
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const supabase = createServiceClient()
  const today = new Date().toISOString().split('T')[0]

  const [{ data: upcomingBookings }, { data: myResponses }] = await Promise.all([
    supabase
      .from('bookings')
      .select('id, game_date, slot_time, format, opponent_name, tournament:tournaments(name, ball_type)')
      .eq('status', 'confirmed')
      .gte('game_date', today)
      .order('game_date', { ascending: true })
      .order('slot_time', { ascending: true })
      .limit(20),
    supabase
      .from('availability')
      .select('booking_id, response')
      .eq('player_id', params.id),
  ])

  const respondedIds = new Set((myResponses ?? []).map(r => r.booking_id))
  const allUpcomingIds = (upcomingBookings ?? []).map(b => b.id)
  const pendingCount = allUpcomingIds.filter(id => !respondedIds.has(id)).length
  const nextMatch = (upcomingBookings ?? [])[0] ?? null
  const nextMatchResponse = nextMatch
    ? (myResponses ?? []).find(r => r.booking_id === nextMatch.id)?.response ?? null
    : null

  return NextResponse.json({
    pendingCount,
    upcomingCount: allUpcomingIds.length,
    nextMatch,
    nextMatchResponse,
  })
}