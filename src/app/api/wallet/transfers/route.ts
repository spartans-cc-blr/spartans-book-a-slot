// POST /api/wallet/transfers — admin-only player-to-player wallet
// sponsorship. See features/wallet-ledger.md §14.
//
// Debits the sponsor's wallet and credits the beneficiary's wallet by the
// same amount — two ordinary wallet_transactions rows, same as every other
// wallet change in this app, never a raw balance edit on either side.
// wallet_transfers just links the two resulting rows together as one
// logical event, for display/reporting; it is never itself read to derive
// a balance.
//
// Admin-only, matching every other wallet-balance-changing action in this
// app — no player can move money themselves, including their own, and
// this route doesn't change that (it's reached from /admin/wallet, with
// the admin picking both the sponsor and the beneficiary).
//
// No balance check on the sponsor — same posture as every other debit in
// this app (match fees, membership fees, admin debits): a debit is never
// blocked by the resulting balance going negative. "Dues outstanding" is
// an existing, normal, tracked state throughout the Hub.
//
// Sequential writes, not a single atomic transaction — same "best-effort,
// report partial failure rather than roll back" posture the rest of this
// app's multi-step wallet writes already use (see PATCH
// /api/wallet/transactions' own balance-sync-failure handling). Order:
// both ledger rows first, then the link row, then both balance updates —
// so a failure partway through always leaves an inspectable ledger trail
// rather than a balance change with nothing behind it.

import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { createServiceClient } from '@/lib/supabase'
import { RATE_LIMITS, rateLimit } from '@/lib/rateLimit'
import { walletTransferSchema } from '@/lib/schemas'
import { sendPushToPlayer } from '@/lib/webpush'

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  const user = session?.user as any
  if (!user?.isAdmin) return NextResponse.json({ error: 'Unauthorised' }, { status: 403 })

  const limited = await rateLimit(req, RATE_LIMITS.adminWrite, user.playerId)
  if (limited) return limited

  const body = await req.json().catch(() => null)
  const parsed = walletTransferSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? 'Invalid request' },
      { status: 400 }
    )
  }
  const { sponsor_player_id, beneficiary_player_id, amount, reason } = parsed.data

  const supabase = createServiceClient()

  const { data: players, error: playersErr } = await supabase
    .from('players')
    .select('id, name, wallet_balance')
    .in('id', [sponsor_player_id, beneficiary_player_id])

  const sponsor = players?.find(p => p.id === sponsor_player_id)
  const beneficiary = players?.find(p => p.id === beneficiary_player_id)
  if (playersErr || !sponsor || !beneficiary) {
    return NextResponse.json({ error: 'Sponsor or beneficiary player not found' }, { status: 404 })
  }

  // Ledger rows written first — they're the source of truth. If a later
  // step fails, both are still on record and the discrepancy is visible/
  // fixable rather than silently lost.
  const { data: sponsorTx, error: sponsorTxErr } = await supabase
    .from('wallet_transactions')
    .insert({
      player_id: sponsor_player_id,
      type: 'debit',
      amount,
      reason: `Sponsorship for ${beneficiary.name} — ${reason}`,
      created_by: user.email ?? null,
    })
    .select()
    .single()
  if (sponsorTxErr) return NextResponse.json({ error: sponsorTxErr.message }, { status: 500 })

  const { data: beneficiaryTx, error: beneficiaryTxErr } = await supabase
    .from('wallet_transactions')
    .insert({
      player_id: beneficiary_player_id,
      type: 'credit',
      amount,
      reason: `Sponsored by ${sponsor.name} — ${reason}`,
      created_by: user.email ?? null,
    })
    .select()
    .single()
  if (beneficiaryTxErr) {
    return NextResponse.json(
      { error: `Sponsor debited on the ledger but the beneficiary credit failed: ${beneficiaryTxErr.message}. Balances not yet changed — correct manually.` },
      { status: 500 }
    )
  }

  const { error: transferErr } = await supabase.from('wallet_transfers').insert({
    sponsor_player_id,
    beneficiary_player_id,
    amount,
    reason,
    sponsor_transaction_id: sponsorTx.id,
    beneficiary_transaction_id: beneficiaryTx.id,
    created_by: user.email ?? '',
  })
  if (transferErr) {
    return NextResponse.json(
      { error: `Both ledger rows recorded but the transfer link failed: ${transferErr.message}. Balances not yet changed — correct manually.` },
      { status: 500 }
    )
  }

  const newSponsorBalance = Number(sponsor.wallet_balance ?? 0) - amount
  const { data: updatedSponsor, error: sponsorBalErr } = await supabase
    .from('players')
    .update({ wallet_balance: newSponsorBalance })
    .eq('id', sponsor_player_id)
    .select()
    .single()
  if (sponsorBalErr) {
    return NextResponse.json(
      { error: `Transfer recorded but sponsor balance sync failed: ${sponsorBalErr.message}` },
      { status: 500 }
    )
  }

  const newBeneficiaryBalance = Number(beneficiary.wallet_balance ?? 0) + amount
  const { data: updatedBeneficiary, error: beneficiaryBalErr } = await supabase
    .from('players')
    .update({ wallet_balance: newBeneficiaryBalance })
    .eq('id', beneficiary_player_id)
    .select()
    .single()
  if (beneficiaryBalErr) {
    return NextResponse.json(
      {
        error: `Transfer recorded and sponsor debited, but beneficiary balance sync failed: ${beneficiaryBalErr.message}`,
        sponsor_player: updatedSponsor,
      },
      { status: 500 }
    )
  }

  await Promise.all([
    sendPushToPlayer(sponsor_player_id, {
      title: '💰 Wallet Debited — Sponsorship',
      body: `-₹${amount} sponsoring ${beneficiary.name} — ${reason}. New balance: ₹${newSponsorBalance}`,
      url: '/wallet',
    }),
    sendPushToPlayer(beneficiary_player_id, {
      title: '🎁 You Were Sponsored!',
      body: `+₹${amount} from ${sponsor.name} — ${reason}. New balance: ₹${newBeneficiaryBalance}`,
      url: '/wallet',
    }),
  ])

  return NextResponse.json({
    sponsor_transaction: sponsorTx,
    beneficiary_transaction: beneficiaryTx,
    sponsor_player: updatedSponsor,
    beneficiary_player: updatedBeneficiary,
  })
}
