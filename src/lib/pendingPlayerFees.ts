// Player-facing "match fees pending" — see features/fee-reminders.md §9.
//
// Fee application stays a manual admin action (post-match-scorecard.md §6).
// Between "scorecard synced" and "admin applies the fee" a player used to
// have no warning at all. This module derives, read-only, each player's
// estimated share of every fee-pending match played on/after 1 Nov 2026,
// using the same eligibility (resolvePendingFee) and the same split
// (computeMatchFeeSplit) the admin apply flow uses, so the estimate and the
// eventual debit can't drift. Never writes anything.
//
// The amount is an ESTIMATE: an admin can still change units or the base
// fee before applying. Players with 0 units (exempt, or no recorded
// batting/bowling role) are not listed.

import { createServiceClient } from '@/lib/supabase'
import { resolvePendingFee } from '@/lib/feeReminders'
import { computeMatchFeeSplit } from '@/lib/matchFeeSplit'
import { isBeforePlayerPendingFeeStart } from '@/lib/repullCutoff'
import { sendPushToPlayer } from '@/lib/webpush'

type Supabase = ReturnType<typeof createServiceClient>

export interface PlayerPendingFee {
  booking_id:      string
  game_date:       string
  slot_time:       string
  opponent_name:   string | null
  tournament_name: string | null
  share:           number
}

// playerId → that player's pending shares (oldest match first).
async function computePendingShares(
  supabase: Supabase,
  bookingIds?: string[]
): Promise<Map<string, PlayerPendingFee[]>> {
  const pending = (await resolvePendingFee(supabase, bookingIds))
    .filter(b => !isBeforePlayerPendingFeeStart(b.game_date))

  const byPlayer = new Map<string, PlayerPendingFee[]>()
  const splits = await Promise.all(
    pending.map(async b => ({ b, split: await computeMatchFeeSplit(supabase, b.booking_id, {}) }))
  )
  for (const { b, split } of splits) {
    if ('error' in split) continue
    for (const row of split.squad) {
      if (row.fee <= 0) continue
      const list = byPlayer.get(row.player_id) ?? []
      list.push({
        booking_id: b.booking_id, game_date: b.game_date, slot_time: b.slot_time,
        opponent_name: b.opponent_name, tournament_name: b.tournament_name, share: row.fee,
      })
      byPlayer.set(row.player_id, list)
    }
  }
  byPlayer.forEach(list => list.sort((a, b) => a.game_date.localeCompare(b.game_date)))
  return byPlayer
}

// Own pending fees. Never throws — a failure just means nothing is shown.
export async function getPendingFeesForPlayer(playerId: string): Promise<PlayerPendingFee[]> {
  try {
    const supabase = createServiceClient()
    const shares = await computePendingShares(supabase)
    return shares.get(playerId) ?? []
  } catch (err) {
    console.error('[pending-fees] player lookup failed', err)
    return []
  }
}

// Called from syncMatchStatsForBooking() when a sync leaves the booking
// fee-pending. Pushes each charged player ONLY when their balance after all
// their pending fees would go below zero (everyone gets the normal
// "Wallet Debited" push once the fee is applied, so notifying all would be
// noise). Wallet alerts are a locked-on group — no preference check.
// Best-effort, never throws. The `tag` makes a re-sync replace, not stack.
export async function notifyPlayersOfPendingFee(bookingId: string): Promise<void> {
  const supabase = createServiceClient()
  const forBooking = await computePendingShares(supabase, [bookingId])
  if (!forBooking.size) return

  const playerIds = Array.from(forBooking.keys())
  const [allShares, { data: players }] = await Promise.all([
    computePendingShares(supabase),
    supabase.from('players').select('id, wallet_balance, status').in('id', playerIds),
  ])

  for (const p of players ?? []) {
    if (p.status === 'expelled') continue
    const mine = forBooking.get(p.id)?.[0]
    if (!mine) continue
    const totalPending = (allShares.get(p.id) ?? [mine]).reduce((s, f) => s + f.share, 0)
    const balance = Number(p.wallet_balance ?? 0)
    if (balance - totalPending >= 0) continue

    const dateLabel = new Date(mine.game_date).toLocaleDateString('en-IN', {
      weekday: 'short', day: 'numeric', month: 'short',
    })
    const oppLabel = mine.opponent_name ? `vs ${mine.opponent_name}` : 'your recent match'
    const bal = `${balance < 0 ? '-' : ''}₹${Math.abs(balance).toLocaleString('en-IN')}`
    await sendPushToPlayer(p.id, {
      title: '💰 Match Fee Coming Up',
      body: `About ₹${mine.share.toLocaleString('en-IN')} for ${oppLabel} · ${dateLabel} will be debited from your wallet. Balance ${bal} — top up to avoid dues.`,
      url: '/wallet',
      tag: `pending-fee-${bookingId}`,
    }).catch(err => console.error('[pending-fees] push failed', p.id, err))
  }
}
