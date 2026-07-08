import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase'
import { sendPushToPlayer } from '@/lib/webpush'
import {
  fetchNextLockWeekendBookings,
  buildPlayerHistories,
  getPriorNudgeThisWeek,
  pickNudgeCandidate,
  buildNudgeCopy,
  type NudgeCandidate,
} from '@/lib/availabilityNudge'

// Runs daily Sun–Wed at 14:30 UTC = 20:00 IST.
// vercel.json entry: { "path": "/api/cron/availability-nudge", "schedule": "30 14 * * 0-3" }
//
// Reminds players who haven't yet responded to a confirmed booking in
// `nextLockWeekend` (the Sat/Sun the upcoming Thursday 08:00 IST lock will
// freeze). Personalised entirely from each player's own response history —
// never compares players to each other, never states counts. See
// .claude/rules/features/push-notifications.md and the availability-nudge
// spec for the full trigger table and copy rules.

export async function GET(req: NextRequest) {
  const authHeader = req.headers.get('authorization')
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })
  }

  const supabase = createServiceClient()
  const now = new Date()
  const dow = now.getDay()

  // Cadence is Sun(0)–Wed(3) only. A stray/manual trigger outside that
  // window is a no-op rather than an error.
  if (dow > 3) {
    return NextResponse.json({ sent: 0, skipped: 'outside Sun-Wed nudge window' })
  }

  const bookingList = await fetchNextLockWeekendBookings(supabase, now)
  if (!bookingList.length) {
    return NextResponse.json({ sent: 0, reason: 'no qualifying bookings for nextLockWeekend' })
  }
  const bookingIds = bookingList.map(b => b.id)
  const bookingSlotMap = new Map(bookingList.map(b => [b.id, b.slot_time]))

  const { data: players } = await supabase
    .from('players')
    .select('id, status')
    .in('status', ['active', 'inactive'])

  if (!players?.length) {
    return NextResponse.json({ sent: 0, reason: 'no eligible players' })
  }
  const playerIds = players.map(p => p.id)

  // Any existing response (Y/O/E/L) counts as a complete answer.
  const { data: existingResponses } = await supabase
    .from('availability')
    .select('player_id, booking_id')
    .in('booking_id', bookingIds)
    .in('player_id', playerIds)

  const answeredKey = new Set((existingResponses ?? []).map(r => `${r.player_id}|${r.booking_id}`))

  const histories = await buildPlayerHistories(supabase, playerIds)

  const candidates: NudgeCandidate[] = []
  for (const player of players) {
    const gapBookings = bookingList.filter(b => !answeredKey.has(`${player.id}|${b.id}`))
    if (!gapBookings.length) continue

    const history = histories.get(player.id)
    if (!history) continue

    const prior = await getPriorNudgeThisWeek(supabase, player.id, bookingSlotMap, now)
    const status: 'active' | 'inactive' = player.status === 'inactive' ? 'inactive' : 'active'

    const candidate = pickNudgeCandidate(dow, player.id, status, gapBookings, history, prior)
    if (candidate) candidates.push(candidate)
  }

  if (!candidates.length) {
    return NextResponse.json({ sent: 0, reason: 'no players had a qualifying gap today' })
  }

  const today = now.toISOString().split('T')[0]

  const results = await Promise.allSettled(
    candidates.map(async (candidate) => {
      // Insert the log row first — the UNIQUE(player_id, nudge_date) constraint
      // is the idempotency guard. If this fails (already nudged today, e.g. a
      // retried invocation), skip the push entirely rather than double-send.
      const { error: logError } = await supabase
        .from('availability_nudge_log')
        .insert({
          player_id:  candidate.playerId,
          booking_id: candidate.booking.id,
          theme:      candidate.theme,
          nudge_date: today,
        })

      if (logError) return { sent: false, skipped: true }

      const { title, body } = buildNudgeCopy(candidate.theme, candidate.booking)
      await sendPushToPlayer(candidate.playerId, {
        title,
        body,
        url: `/fixtures/${candidate.booking.id}`,
      })
      return { sent: true }
    })
  )

  const sentCount = results.filter(
    r => r.status === 'fulfilled' && (r.value as { sent: boolean }).sent
  ).length

  return NextResponse.json({
    candidates: candidates.length,
    sent: sentCount,
    dow,
    weekend: { saturday: bookingList[0]?.game_date, dates: Array.from(new Set(bookingList.map(b => b.game_date))) },
  })
}
