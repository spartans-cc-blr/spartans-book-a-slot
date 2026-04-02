import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { createServiceClient } from '@/lib/supabase'

// GET /api/gc/weekend-review?week_start=YYYY-MM-DD
export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions)
  const user = session?.user as any
  if (!user?.isAdmin && !user?.isGC) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  
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
  if (!user?.isAdmin && !user?.isGC) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { booking_id, decision } = await req.json()
  if (!booking_id || !['approved', 'returned'].includes(decision))
    return NextResponse.json({ error: 'Invalid body' }, { status: 400 })

  const supabase = createServiceClient()

  const newStatus = decision === 'approved' ? 'approved' : 'draft'
  let error: any = null

  if (decision === 'approved') {
    // Approve: flip pending_approval → approved
    const { error: e } = await supabase
      .from('squad')
      .update({ status: 'approved' })
      .eq('booking_id', booking_id)
      .eq('status', 'pending_approval')
    error = e
  } else {
    // Return: delete all rows so the captain starts from a clean slate.
    // The captain's last submitted selection is gone — they must re-select.
    // This prevents stale player IDs hydrating into selected state on next load.
    const { error: e } = await supabase
      .from('squad')
      .delete()
      .eq('booking_id', booking_id)
      .eq('status', 'pending_approval')
    error = e
  }

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}