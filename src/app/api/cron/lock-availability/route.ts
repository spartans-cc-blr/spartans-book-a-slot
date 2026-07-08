import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase'
import { notifyGCs } from '@/lib/webpush'


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
    const errMsg = (error as { message: string }).message
    await notifyGCs(
      '⚠️ Availability Lock Failed',
      `Cron error: ${errMsg}`
    )
    return NextResponse.json({ error: errMsg }, { status: 500 })
  }

  if (!result || result.length === 0) {
    await notifyGCs(
      '⚠️ Availability Lock — Nothing Locked',
      `No confirmed slots found for ${dates.join(' & ')} — check bookings`
    )
    return NextResponse.json({ locked: 0, dates })
  }

  await notifyGCs(
    '🔒 Availability Locked',
    `${result.length} slot${result.length > 1 ? 's' : ''} locked for ${dates.join(' & ')}`
  )
  return NextResponse.json({ locked: result.length, dates })

}
