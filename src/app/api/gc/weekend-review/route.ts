import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { createServiceClient } from '@/lib/supabase'

// GET /api/gc/weekend-review?week_start=YYYY-MM-DD
export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions)
  const user = session?.user as any
  if (!user?.isAdmin && !user?.isCaptain) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const weekStart = req.nextUrl.searchParams.get('week_start')
  if (!weekStart) return NextResponse.json({ error: 'week_start required' }, { status: 400 })

  const weekEnd = new Date(new Date(weekStart).getTime() + 7 * 86400000)
    .toISOString().slice(0, 10)

  const supabase = createServiceClient()

  const { data: bookings } = await supabase
    .from('bookings')
    .select('id, slot_time, format, game_date')
    .gte('game_date', weekStart)
    .lt('game_date', weekEnd)
    .eq('status', 'confirmed')

  const bookingIds = (bookings ?? []).map(b => b.id)
  if (!bookingIds.length) return NextResponse.json({ bookings: [], avail: [], squads: [] })

  const { data: avail } = await supabase
    .from('availability')
    .select('player_id, booking_id, response, players(name)')
    .in('response', ['O', 'E'])
    .in('booking_id', bookingIds)

  const { data: squads } = await supabase
    .from('squad')
    .select('player_id, booking_id, status')
    .in('booking_id', bookingIds)
    .in('status', ['pending_approval', 'approved', 'announced'])

  return NextResponse.json({ bookings, avail, squads })
}

// PATCH /api/gc/weekend-review — approve or return a squad
export async function PATCH(req: NextRequest) {
  const session = await getServerSession(authOptions)
  const user = session?.user as any
  if (!user?.isAdmin) return NextResponse.json({ error: 'Forbidden — admin only' }, { status: 403 })

  const { booking_id, decision } = await req.json()
  if (!booking_id || !['approved', 'returned'].includes(decision))
    return NextResponse.json({ error: 'Invalid body' }, { status: 400 })

  const supabase = createServiceClient()

  const newStatus = decision === 'approved' ? 'approved' : 'draft'
  const { error } = await supabase
    .from('squad')
    .update({ status: newStatus })
    .eq('booking_id', booking_id)
    .eq('status', 'pending_approval')

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}