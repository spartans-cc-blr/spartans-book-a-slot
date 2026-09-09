// Quarterly membership fee — ₹250 debited automatically the moment a
// player's first role-fulfilling match of a calendar quarter syncs. See
// features/wallet-ledger.md §12 for the full design.
//
// "Role-fulfilling" = batted, bowled, or recorded a fielding dismissal —
// deliberately wider than the match-fee eligibility signal in
// /api/fees/apply (batted/bowled only), per product decision: a
// fielding-only contribution still counts as real participation for
// membership purposes even though it doesn't currently earn a match-fee
// share.
//
// Hooked into syncMatchStatsForBooking() alongside milestone/performance
// detection (src/lib/milestones.ts) — covers both the manual "Sync Stats"
// path and the unattended backfill/cron path with one implementation.
// Best-effort: chargeMembershipFeeIfDue() never throws, so a bug here can
// never fail the scorecard sync itself.
//
// Idempotency is DB-enforced (UNIQUE(player_id, year, quarter) on
// membership_fee_charges — migration 073), not just checked in code: the
// charge row is inserted FIRST, a plain INSERT (never upsert), and only a
// successful insert (no unique-violation) proceeds to the wallet debit.
// This mirrors the "claim the slot before doing the work" pattern
// availability_nudge_log uses to stay safe under a concurrent or duplicate
// sync of the same match — see that table's own idempotency note in
// features/availability-nudge.md.
//
// Practice-tournament matches never count toward this — same "real stats
// only" posture as every other aggregate in this app (see
// features/leaderboard.md §10).
//
// The resulting wallet_transactions row deliberately does NOT set
// booking_id, even though the triggering match is known (recorded on
// membership_fee_charges.booking_id instead). /api/fees/apply's "has this
// booking's fee already been applied" guard checks for *any* debit
// carrying that booking_id — a membership-fee debit sharing the same
// booking_id would falsely trip that guard the next time an admin tries
// to apply a genuinely un-applied match fee for that booking.

import { createServiceClient } from '@/lib/supabase'
import { resolveSquadMatch, type SquadRef } from '@/lib/matchTopPerformers'
import { sendPushToPlayer } from '@/lib/webpush'

export const MEMBERSHIP_FEE_AMOUNT = 250

export function quarterOf(dateStr: string): { year: number; quarter: number } {
  const d = new Date(dateStr)
  const year = d.getFullYear()
  const quarter = Math.floor(d.getMonth() / 3) + 1
  return { year, quarter }
}

export async function chargeMembershipFeeIfDue(
  bookingId: string,
  gameDate: string,
  batting: any[],
  bowling: any[],
  fielding: any[],
  squad: SquadRef[],
  isPractice: boolean
): Promise<void> {
  try {
    if (isPractice) return

    const matchDateLabel = new Date(gameDate).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })

    const qualifyingIds = new Set<string>()
    for (const r of batting) {
      if (!r.batted) continue
      const id = resolveSquadMatch(r, r.player_name, squad)?.player_id
      if (id) qualifyingIds.add(id)
    }
    for (const r of bowling) {
      if (!r.did_bowl) continue
      const id = resolveSquadMatch(r, r.player_name, squad)?.player_id
      if (id) qualifyingIds.add(id)
    }
    for (const r of fielding) {
      const dismissals = (Number(r.catches) || 0) + (Number(r.caught_behind) || 0)
        + (Number(r.run_outs) || 0) + (Number(r.stumpings) || 0)
      if (dismissals <= 0) continue
      const id = resolveSquadMatch(r, r.player_name, squad)?.player_id
      if (id) qualifyingIds.add(id)
    }
    if (qualifyingIds.size === 0) return

    const { year, quarter } = quarterOf(gameDate)
    const supabase = createServiceClient()

    await Promise.all(
      Array.from(qualifyingIds).map(playerId =>
        chargeOnePlayer(supabase, playerId, bookingId, year, quarter, matchDateLabel))
    )
  } catch (err) {
    console.error('[membershipFee] detection failed:', err)
  }
}

async function chargeOnePlayer(
  supabase: ReturnType<typeof createServiceClient>,
  playerId: string,
  bookingId: string,
  year: number,
  quarter: number,
  matchDateLabel: string
): Promise<void> {
  // Claim the (player, year, quarter) slot first. 23505 = unique_violation
  // — the expected, benign hit when this player was already charged this
  // quarter (by an earlier match, or a concurrent/duplicate sync of this
  // one) — silently stop, never touch the wallet. Anything else is a real
  // failure, logged, and also abandoned rather than risking a debit with
  // no charge record behind it.
  const { data: charge, error: chargeErr } = await supabase
    .from('membership_fee_charges')
    .insert({ player_id: playerId, booking_id: bookingId, year, quarter, amount: MEMBERSHIP_FEE_AMOUNT })
    .select('id')
    .single()

  if (chargeErr || !charge) {
    if (chargeErr?.code !== '23505') {
      console.error('[membershipFee] charge-claim insert failed:', chargeErr?.message)
    }
    return
  }

  const { data: player, error: playerErr } = await supabase
    .from('players')
    .select('wallet_balance')
    .eq('id', playerId)
    .single()
  if (playerErr || !player) {
    console.error('[membershipFee] player lookup failed:', playerErr?.message)
    return
  }

  const newBalance = Number(player.wallet_balance ?? 0) - MEMBERSHIP_FEE_AMOUNT

  const { data: tx, error: txErr } = await supabase
    .from('wallet_transactions')
    .insert({
      player_id: playerId,
      type: 'debit',
      amount: MEMBERSHIP_FEE_AMOUNT,
      reason: `Membership fee — Q${quarter} ${year}`,
      notes: `Triggered by match on ${matchDateLabel}`,
      // booking_id intentionally omitted — see this file's header comment.
    })
    .select('id')
    .single()
  if (txErr || !tx) {
    console.error('[membershipFee] ledger insert failed:', txErr?.message)
    return
  }

  const { error: balErr } = await supabase
    .from('players')
    .update({ wallet_balance: newBalance })
    .eq('id', playerId)
  if (balErr) {
    console.error('[membershipFee] balance update failed:', balErr.message)
    return
  }

  await supabase
    .from('membership_fee_charges')
    .update({ wallet_transaction_id: tx.id })
    .eq('id', charge.id)

  await sendPushToPlayer(playerId, {
    title: '🎫 Membership Fee Debited',
    body: `-₹${MEMBERSHIP_FEE_AMOUNT} — Q${quarter} ${year} membership fee. New balance: ₹${newBalance}`,
    url: '/wallet',
  }).catch(err => console.error('[membershipFee] push failed:', err))
}
