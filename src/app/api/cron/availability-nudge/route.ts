import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase'
import { sendPushToPlayer, notifyGCs } from '@/lib/webpush'
import {
  fetchNextLockWeekendBookings,
  buildPlayerHistories,
  getPriorNudgesThisWeek,
  getWeeklyNudgeHistoryForPlayers,
  pickNudgeCandidate,
  buildNudgeCopy,
  buildDeadlineCopy,
  type NudgeCandidate,
  type DeadlineNudgeCandidate,
  type WeeklyNudgeHistoryEntry,
} from '@/lib/availabilityNudge'

// Runs daily Sun–Wed at 15:15 UTC = 20:45 IST.
// vercel.json entry: { "path": "/api/cron/availability-nudge", "schedule": "15 15 * * 0-3" }
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

  try {
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

    // One batched round-trip for the whole roster's prior-nudge lookups,
    // instead of a query per player inside the loop below.
    const priorNudges = await getPriorNudgesThisWeek(supabase, playerIds, bookingSlotMap, now)

    // Fix 7: one batched round-trip for the whole roster's used-themes and
    // referenced-bookings history, powering the priority list's skip-
    // already-used rule and the soft unreferenced-booking preference.
    const weeklyHistory = await getWeeklyNudgeHistoryForPlayers(supabase, playerIds, now)
    const emptyWeeklyHistory: WeeklyNudgeHistoryEntry = { usedThemes: new Set(), referencedBookingIds: new Set() }

    const candidates: (NudgeCandidate | DeadlineNudgeCandidate)[] = []
    for (const player of players) {
      const gapBookings = bookingList.filter(b => !answeredKey.has(`${player.id}|${b.id}`))
      if (!gapBookings.length) continue

      const history = histories.get(player.id)
      if (!history) continue

      const prior = priorNudges.get(player.id) ?? null
      const { usedThemes, referencedBookingIds } = weeklyHistory.get(player.id) ?? emptyWeeklyHistory
      const status: 'active' | 'inactive' = player.status === 'inactive' ? 'inactive' : 'active'

      const candidate = pickNudgeCandidate(
        dow, player.id, status, gapBookings, history, prior, usedThemes, referencedBookingIds
      )
      if (candidate) candidates.push(candidate)
    }

    if (!candidates.length) {
      return NextResponse.json({ sent: 0, reason: 'no players had a qualifying gap today' })
    }

    const today = now.toISOString().split('T')[0]

    const results = await Promise.allSettled(
      candidates.map(async (candidate) => {
        // Wednesday's 'deadline' theme covers every remaining gap booking, so
        // it carries a representativeBooking purely for the log row's
        // booking_id (the daily idempotency guard) and the push deep-link —
        // the copy itself is built from the full gapBookings list.
        const logBookingId = candidate.theme === 'deadline'
          ? candidate.representativeBooking.id
          : candidate.booking.id

        // Insert the log row first with status 'pending' — the
        // UNIQUE(player_id, nudge_date) constraint is the idempotency guard.
        // If this fails (already nudged today, e.g. a retried invocation),
        // skip the push entirely rather than double-send.
        const { data: logRow, error: logError } = await supabase
          .from('availability_nudge_log')
          .insert({
            player_id:  candidate.playerId,
            booking_id: logBookingId,
            theme:      candidate.theme,
            nudge_date: today,
            status:     'pending',
          })
          .select('id')
          .single()

        if (logError || !logRow) {
          // 23505 = unique_violation — the expected, benign idempotency hit
          // (already nudged this player today, e.g. a retried invocation).
          // Anything else (missing column, connection error, etc.) is a
          // real problem that would otherwise silently look identical to
          // "nobody needed nudging" in the response body.
          const isDuplicate = logError?.code === '23505'
          return {
            outcome: isDuplicate ? 'already_nudged' as const : 'skipped' as const,
            logErrorMessage: logError?.message,
          }
        }

        // Delivery status is tracked separately from the attempt — a push
        // failure must not leave the log row claiming success.
        try {
          const { title, body } = candidate.theme === 'deadline'
            ? buildDeadlineCopy(candidate.gapBookings)
            : buildNudgeCopy(candidate.theme, candidate.booking)
          const pushResults = await sendPushToPlayer(candidate.playerId, {
            title,
            body,
            url: `/fixtures/${logBookingId}`,
          })

          // sendPushToPlayer settles per-subscription via Promise.allSettled
          // and never rethrows individual delivery errors to its caller, so a
          // bare try/catch around it would rarely fire. Inspect the settled
          // results instead: zero subscriptions is a normal opt-in absence
          // (see push-notifications.md — not a failure), but subscriptions
          // that all rejected is a genuine delivery failure.
          if (pushResults?.length && pushResults.every(r => r.status === 'rejected')) {
            const reason = pushResults
              .map(r => (r as PromiseRejectedResult).reason)
              .map(e => (e instanceof Error ? e.message : String(e)))
              .join('; ')
            throw new Error(reason)
          }

          await supabase
            .from('availability_nudge_log')
            .update({ status: 'sent' })
            .eq('id', logRow.id)
          return { outcome: 'sent' as const }
        } catch (pushErr) {
          const errMsg = pushErr instanceof Error ? pushErr.message : String(pushErr)
          await supabase
            .from('availability_nudge_log')
            .update({ status: 'failed', error_message: errMsg })
            .eq('id', logRow.id)
          return { outcome: 'failed' as const }
        }
      })
    )

    const outcomes = results.map(r => (r.status === 'fulfilled' ? r.value.outcome : 'failed'))
    const sentCount          = outcomes.filter(o => o === 'sent').length
    const failedCount        = outcomes.filter(o => o === 'failed').length
    const alreadyNudgedCount = outcomes.filter(o => o === 'already_nudged').length
    const skippedCount       = outcomes.filter(o => o === 'skipped').length

    // skippedCount is the "silent false-success" case this route has already
    // been bitten by once — the log insert itself failing (e.g. a schema
    // mismatch between the code and the live DB) leaves sent/failed both at
    // 0, which reads exactly like "nobody needed nudging today." Nobody
    // actively watches the JSON response of a cron job, so surfacing it in
    // the body alone isn't enough — alert GCs the same way lock-availability
    // alerts on an unexpected zero-locked run. already_nudged is excluded:
    // that's the expected, benign idempotency hit on a retried invocation.
    if (skippedCount > 0) {
      await notifyGCs(
        '⚠️ Availability Nudge — Skipped',
        `${skippedCount} of ${candidates.length} nudge${candidates.length === 1 ? '' : 's'} skipped today — the log write failed for a reason other than the daily idempotency guard. Check availability_nudge_log schema/migrations.`
      )
    }

    return NextResponse.json({
      candidates: candidates.length,
      sent: sentCount,
      failed: failedCount,
      alreadyNudged: alreadyNudgedCount,
      skipped: skippedCount,
      dow,
      weekend: { saturday: bookingList[0]?.game_date, dates: Array.from(new Set(bookingList.map(b => b.game_date))) },
    })
  } catch (err) {
    const errMsg = err instanceof Error ? err.message : String(err)
    await notifyGCs(
      '⚠️ Availability Nudge Failed',
      `Cron error: ${errMsg}`
    )
    return NextResponse.json({ error: errMsg }, { status: 500 })
  }
}
