// PATCH /api/wallet/opening-balance — admin-only.
//
// Overrides (or clears, with amount: null) the "Brought Forward" line
// GET /api/wallet/transactions computes for a player's statement once
// their transaction history is exhausted. See features/wallet-ledger.md
// for why this defaults to a computed value (wallet_balance minus the sum
// of the player's own ledger) rather than needing to be set for every
// player — this route exists for the case where that computed default
// doesn't match an admin's own paper/spreadsheet reconciliation, or where
// a human-readable note ("carried over from the legacy Google Sheet as of
// Mar 2026") is worth attaching.
//
// Never touches players.wallet_balance itself — that's the live current
// balance, always correct on its own; this is purely a display anchor for
// the statement's oldest visible line.

import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { createServiceClient } from '@/lib/supabase'
import { RATE_LIMITS, rateLimit } from '@/lib/rateLimit'
import { walletOpeningBalanceSchema } from '@/lib/schemas'

export async function PATCH(req: NextRequest) {
  const session = await getServerSession(authOptions)
  const user = session?.user as any
  if (!user?.isAdmin) return NextResponse.json({ error: 'Unauthorised' }, { status: 403 })

  const limited = await rateLimit(req, RATE_LIMITS.adminWrite, user.playerId)
  if (limited) return limited

  const body = await req.json().catch(() => null)
  const parsed = walletOpeningBalanceSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? 'Invalid request' },
      { status: 400 }
    )
  }
  const { player_id, amount, note } = parsed.data

  const supabase = createServiceClient()
  const { data, error } = await supabase
    .from('players')
    .update({
      wallet_opening_balance: amount,
      wallet_opening_balance_note: amount === null ? null : (note ?? null),
      wallet_opening_balance_set_by: amount === null ? null : (user.email ?? null),
      wallet_opening_balance_set_at: amount === null ? null : new Date().toISOString(),
    })
    .eq('id', player_id)
    .select('id, wallet_opening_balance, wallet_opening_balance_note, wallet_opening_balance_set_by, wallet_opening_balance_set_at')
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ player: data })
}
