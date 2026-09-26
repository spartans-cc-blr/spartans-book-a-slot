// Reservation expiry reminders — see features/reservation-expiry-reminders.md.
//
// Alerts every admin before a soft_block reservation (an organiser-held
// slot pending confirmation, bookings.reserved_until — see the
// /api/cron/expire-reservations cron that eventually deletes these) is due
// to expire, at three fixed lead times: 24h, 12h, and 1h before the
// deadline. The push links to /admin/bookings/[id], which already renders
// a "📲 Notify via WhatsApp" panel with a pre-filled "please confirm within
// 48 hours" message for the organiser — this feature is purely the alert;
// nudging the organiser itself reuses that existing button.
//
// Only a genuine reservation counts — bookings.reserved_until is NULL for
// every internal-reason soft_block (Club Event / Knockout / Practice /
// Other, see /api/soft-blocks/route.ts), which are admin-placed and
// admin-released, never auto-expired. Filtering on reserved_until IS NOT
// NULL is the same scoping /api/cron/expire-reservations already uses.

import { createServiceClient } from '@/lib/supabase'
import { notifyAdmins } from '@/lib/webpush'

type ReminderType = '24h' | '12h' | '1h'

interface ReminderThreshold {
  type: ReminderType
  hours: number
  title: string
  remainingLabel: string
}

// Checked in this order (most lead time first) so a cron run that catches
// up after a gap (Vercel Hobby's own scheduler is unreliable — see
// limitations.md — or a genuinely long interval between runs) sends every
// threshold the reservation has already crossed, oldest first, rather than
// jumping straight to the most urgent one and silently skipping the
// earlier warnings.
const REMINDER_THRESHOLDS: ReminderThreshold[] = [
  { type: '24h', hours: 24, title: '⏰ Reservation Expiring in 24h', remainingLabel: 'in about 24 hours' },
  { type: '12h', hours: 12, title: '⏰ Reservation Expiring in 12h', remainingLabel: 'in about 12 hours' },
  { type: '1h', hours: 1, title: '🚨 Reservation Expiring in 1h', remainingLabel: 'in under 1 hour' },
]

export interface ReservationReminderRunResult {
  checked: number
  sent: number
  already_sent: number
  failed: number
}

function dateLabel(gameDate: string): string {
  return new Date(gameDate).toLocaleDateString('en-IN', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
  })
}

// Runs on every cron fire (see the route for the schedule). Best-effort —
// a DB or push failure for one reservation never stops the rest from being
// checked, and the whole function never throws (same posture as every
// other cron-triggered notifier in this app, e.g. detectAndLogMilestones).
export async function checkAndSendReservationExpiryReminders(): Promise<ReservationReminderRunResult> {
  const supabase = createServiceClient()
  const now = new Date()
  const windowEnd = new Date(now.getTime() + 24 * 60 * 60 * 1000)

  const { data: reservations, error } = await supabase
    .from('bookings')
    .select('id, game_date, slot_time, organiser_name, reserved_until, tournament:tournaments(name)')
    .eq('status', 'soft_block')
    .not('reserved_until', 'is', null)
    .gt('reserved_until', now.toISOString())
    .lte('reserved_until', windowEnd.toISOString())

  if (error) {
    console.error('[reservation-expiry-reminders] failed to fetch reservations:', error.message)
    return { checked: 0, sent: 0, already_sent: 0, failed: 0 }
  }
  if (!reservations?.length) {
    return { checked: 0, sent: 0, already_sent: 0, failed: 0 }
  }

  let sent = 0
  let alreadySent = 0
  let failed = 0

  for (const booking of reservations as any[]) {
    const reservedUntilMs = new Date(booking.reserved_until).getTime()
    const hoursRemaining = (reservedUntilMs - now.getTime()) / (1000 * 60 * 60)

    for (const threshold of REMINDER_THRESHOLDS) {
      if (hoursRemaining > threshold.hours) continue

      // Claim this (booking, reminder_type, reserved_until) slot before
      // sending — the UNIQUE constraint means a 23505 here is the benign
      // "already sent this one" case, not a real failure. See the
      // migration's own header comment for why reserved_until is part of
      // the key (an edited/extended reservation gets a fresh set).
      const { error: claimError } = await supabase.from('reservation_expiry_reminders').insert({
        booking_id: booking.id,
        reminder_type: threshold.type,
        reserved_until: booking.reserved_until,
        status: 'pending',
      })

      if (claimError) {
        if (claimError.code === '23505') {
          alreadySent++
        } else {
          console.error(
            `[reservation-expiry-reminders] log-insert failed for booking ${booking.id} (${threshold.type}):`,
            claimError.message
          )
          failed++
        }
        continue
      }

      const tournament = Array.isArray(booking.tournament) ? booking.tournament[0] : booking.tournament
      const matchLabel = tournament?.name ?? 'Slot reservation'
      const organiser = booking.organiser_name || 'the organiser'

      try {
        await notifyAdmins(
          threshold.title,
          `${matchLabel} · ${dateLabel(booking.game_date)}, ${booking.slot_time} — held by ${organiser} — releases ${threshold.remainingLabel}. Nudge them before the slot expires!`,
          `/admin/bookings/${booking.id}`
        )
        await supabase
          .from('reservation_expiry_reminders')
          .update({ status: 'sent' })
          .eq('booking_id', booking.id)
          .eq('reminder_type', threshold.type)
          .eq('reserved_until', booking.reserved_until)
        sent++
      } catch (err: any) {
        await supabase
          .from('reservation_expiry_reminders')
          .update({ status: 'failed', error_message: String(err?.message ?? err) })
          .eq('booking_id', booking.id)
          .eq('reminder_type', threshold.type)
          .eq('reserved_until', booking.reserved_until)
        failed++
      }
    }
  }

  return { checked: reservations.length, sent, already_sent: alreadySent, failed }
}
