// Match fee payment reminders — see features/fee-reminders.md.
//
// A booking is "fee-pending" when its scorecard has synced but the fee
// hasn't been applied yet, AND there's actually something to apply:
//   - scorecard_uploads.status === 'synced' (not yet 'fees_applied')
//   - fees_reconciled_externally is false (a legacy pre-8-Aug-2026 match
//     reconciled outside the Hub is never eligible for POST /api/fees/apply
//     — see migration 062 and that route's own guard)
//   - an effective fee is configured (bookings.match_fee_override, else
//     tournaments.match_fee) and is > 0
//   - an announced squad exists — POST /api/fees/apply itself 400s with
//     "No announced squad for this booking" otherwise, so a booking with no
//     squad yet has nothing an admin could actually apply
//
// This never touches wallet_transactions or scorecard_uploads.status
// itself — purely a read-derived reminder, same "fees stay a fully
// separate, manual, explicit action" posture as everywhere else in this
// feature (see post-match-scorecard.md §6). One shared resolver
// (resolvePendingFee) backs both the full-list API route and the
// single-booking push trigger, so "fee-pending" can't drift into two
// different definitions.

import { createServiceClient } from '@/lib/supabase'
import { notifyAdmins } from '@/lib/webpush'

export interface PendingFeeBooking {
  booking_id:      string
  game_date:       string
  slot_time:       string
  opponent_name:   string | null
  tournament_name: string | null
  fee:             number
  squad_count:     number
}

async function resolvePendingFee(
  supabase: ReturnType<typeof createServiceClient>,
  bookingIdFilter?: string[]
): Promise<PendingFeeBooking[]> {
  if (bookingIdFilter && bookingIdFilter.length === 0) return []

  let uploadsQuery = supabase
    .from('scorecard_uploads')
    .select('booking_id')
    .eq('status', 'synced')
    .eq('fees_reconciled_externally', false)
  if (bookingIdFilter) uploadsQuery = uploadsQuery.in('booking_id', bookingIdFilter)

  const { data: uploads } = await uploadsQuery
  const eligibleIds = (uploads ?? []).map(u => u.booking_id)
  if (!eligibleIds.length) return []

  const { data: bookings } = await supabase
    .from('bookings')
    .select('id, game_date, slot_time, opponent_name, match_fee_override, tournament:tournaments(name, match_fee)')
    .in('id', eligibleIds)

  if (!bookings?.length) return []

  const { data: squadRows } = await supabase
    .from('squad')
    .select('booking_id')
    .in('booking_id', eligibleIds)
    .eq('status', 'announced')

  const squadCounts = new Map<string, number>()
  for (const r of squadRows ?? []) {
    squadCounts.set(r.booking_id, (squadCounts.get(r.booking_id) ?? 0) + 1)
  }

  const results: PendingFeeBooking[] = []
  for (const b of bookings as any[]) {
    const fee: number | null = b.match_fee_override ?? b.tournament?.match_fee ?? null
    const squadCount = squadCounts.get(b.id) ?? 0
    if (!fee || squadCount === 0) continue
    results.push({
      booking_id:      b.id,
      game_date:       b.game_date,
      slot_time:       b.slot_time,
      opponent_name:   b.opponent_name ?? null,
      tournament_name: b.tournament?.name ?? null,
      fee,
      squad_count:     squadCount,
    })
  }

  return results.sort((a, b) => a.game_date.localeCompare(b.game_date))
}

// Feeds GET /api/admin/fee-reminders — every currently fee-pending booking,
// for the admin-facing reminder modal.
export async function getPendingFeeBookings(): Promise<PendingFeeBooking[]> {
  return resolvePendingFee(createServiceClient())
}

// Called from syncMatchStatsForBooking() right after a scorecard syncs.
// Best-effort — never throws, so a push hiccup can never fail the sync
// itself (same posture as detectAndLogMilestones()). Pushes immediately,
// "as soon as the scorecard is fetched", to every admin — the in-app modal
// (GET /api/admin/fee-reminders) is the fallback for an admin who isn't
// subscribed to push, or who was away when it fired.
export async function notifyFeeReminderIfPending(bookingId: string): Promise<void> {
  const [pending] = await resolvePendingFee(createServiceClient(), [bookingId])
  if (!pending) return

  const dateLabel = new Date(pending.game_date).toLocaleDateString('en-IN', {
    weekday: 'short', day: 'numeric', month: 'short',
  })
  const oppLabel = pending.opponent_name ? `vs ${pending.opponent_name}` : 'this match'
  await notifyAdmins(
    '💰 Match Fees Pending',
    `Scorecard synced for ${oppLabel} · ${dateLabel} — ₹${pending.fee} not yet applied.`,
    `/admin/bookings/${bookingId}`
  )
}
