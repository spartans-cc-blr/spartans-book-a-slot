import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase'
import { notifyGCs } from '@/lib/webpush'

export const dynamic = 'force-dynamic'
export const revalidate = 0

// Runs daily at 02:30 UTC = 08:00 IST (Vercel Hobby only supports daily cron
// granularity — the route itself guards to only act on Thursday IST).
// Blanket-locks ALL confirmed Sat/Sun slots for the upcoming weekend.
// No Y-count condition — captains manage their own pool from this point.
// vercel.json entry: { "path": "/api/cron/lock-availability", "schedule": "30 2 * * *" }

export async function GET(req: NextRequest) {
  const authHeader = req.headers.get('authorization')
  if (authHeader?.trim() !== `Bearer ${process.env.CRON_SECRET?.trim()}`) {
    return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })
  }

  const nowIST = new Date(new Date().getTime() + 5.5 * 60 * 60 * 1000)
  if (nowIST.getDay() !== 4) {
    return NextResponse.json({ skipped: true, reason: 'Not Thursday IST' })
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
      `Cron error: ${errMsg}`,
      '/admin',
      true
    )
    return NextResponse.json({ error: errMsg }, { status: 500 })
  }

  if (!result || result.length === 0) {
    // Nothing left to lock — but that's the expected, harmless outcome
    // whenever another trigger (Vercel's own cron, or a captain's squad
    // draft save) already locked these bookings first. Only alert when
    // there are genuinely no confirmed slots for the weekend at all
    // (e.g. a club-level event weekend with no games) — that's the one
    // case that actually needs a human to check bookings.
    const { count: existingCount } = await supabase
      .from('bookings')
      .select('id', { count: 'exact', head: true })
      .in('game_date', dates)
      .eq('status', 'confirmed')

    if (!existingCount) {
      await notifyGCs(
        '⚠️ Availability Lock — Nothing Locked',
        `No confirmed slots found for ${dates.join(' & ')} — check bookings`,
        '/admin',
        true
      )
    }
    return NextResponse.json({ locked: 0, dates })
  }

  await notifyGCs(
    '🔒 Availability Locked',
    `${result.length} slot${result.length > 1 ? 's' : ''} locked for ${dates.join(' & ')} — captains can start drafting`,
    '/admin',
    true
  )
  return NextResponse.json({ locked: result.length, dates })

}
