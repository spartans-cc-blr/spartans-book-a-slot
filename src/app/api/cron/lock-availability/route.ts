import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase'

// Runs every Thursday at 00:30 UTC = 06:00 IST
// vercel.json entry: { "path": "/api/cron/lock-availability", "schedule": "30 0 * * 4" }
export async function GET(req: NextRequest) {
  const authHeader = req.headers.get('authorization')
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })
  }

  const supabase = createServiceClient()

  // Find the upcoming Saturday (days until Saturday from today Thursday)
  const now = new Date()
  // Thursday=4, Saturday=6 → +2 days
  const saturday = new Date(now)
  saturday.setDate(now.getDate() + 2)
  const sunday = new Date(saturday)
  sunday.setDate(saturday.getDate() + 1)

  const dates = [
    saturday.toISOString().split('T')[0],
    sunday.toISOString().split('T')[0],
  ]

  // Find all confirmed booking IDs for the weekend
  const { data: bookings, error: bErr } = await supabase
    .from('bookings')
    .select('id')
    .in('game_date', dates)
    .eq('status', 'confirmed')

  if (bErr || !bookings?.length) {
    return NextResponse.json({ locked: 0 })
  }

  const bookingIds = bookings.map((b) => b.id)

  // Count Y responses per booking
  const { data: counts, error: cErr } = await supabase
    .from('availability')
    .select('booking_id, response')
    .in('booking_id', bookingIds)
    .eq('response', 'Y')

  if (cErr) {
    return NextResponse.json({ error: cErr.message }, { status: 500 })
  }

  const yCountByBooking: Record<string, number> = {}
  for (const row of counts ?? []) {
    yCountByBooking[row.booking_id] = (yCountByBooking[row.booking_id] ?? 0) + 1
  }

  const toLock = bookingIds.filter((id) => (yCountByBooking[id] ?? 0) >= 13)

  if (toLock.length === 0) {
    return NextResponse.json({ locked: 0 })
  }

  const { error: uErr } = await supabase
    .from('bookings')
    .update({ availability_locked: true })
    .in('id', toLock)

  if (uErr) {
    return NextResponse.json({ error: uErr.message }, { status: 500 })
  }

  return NextResponse.json({ locked: toLock.length, booking_ids: toLock })
}