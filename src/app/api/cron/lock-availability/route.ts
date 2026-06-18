import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase'

// Runs every Thursday at 02:30 UTC = 08:00 IST
// Blanket-locks ALL confirmed Sat/Sun slots for the upcoming weekend.
// No Y-count condition — captains manage their own pool from this point.
// vercel.json entry: { "path": "/api/cron/lock-availability", "schedule": "30 2 * * 4" }

export async function GET(req: NextRequest) {
  const authHeader = req.headers.get('authorization')
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })
  }

  const supabase = createServiceClient()

  // Thursday → Saturday is +2 days, Sunday is +3 days
  const now      = new Date()
  const saturday = new Date(now)
  saturday.setDate(now.getDate() + 2)
  const sunday = new Date(saturday)
  sunday.setDate(saturday.getDate() + 1)

  const dates = [
    saturday.toISOString().split('T')[0],
    sunday.toISOString().split('T')[0],
  ]

  // Lock ALL confirmed bookings for the weekend — no Y-count filter
  const { data: result, error } = await supabase
    .from('bookings')
    .update({ availability_locked: true })
    .in('game_date', dates)
    .eq('status', 'confirmed')
    .eq('availability_locked', false)   // idempotent — skip already-locked rows
    .select('id')

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ locked: result?.length ?? 0, dates })
}
