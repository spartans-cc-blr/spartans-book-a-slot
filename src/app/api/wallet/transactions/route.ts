// POST /api/wallet/transactions — admin-only wallet adjustment.
// Writes an immutable ledger row to wallet_transactions, derives the new
// players.wallet_balance from it, and pushes the player a notification.
// This is the S-1 route from .claude/rules/security.md §10 — wallet_balance
// is removed from the general /api/players PATCH allowlist in the same
// change, so this becomes the only write path for a balance change made
// through the app. Direct edits in the Supabase table editor still bypass
// this entirely (and this app has no way to intercept those).
//
// GET /api/wallet/transactions?player_id=<uuid> — admin-only ledger read,
// most recent first. Powers the "recent transactions" list on
// /admin/players.

import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { createServiceClient } from '@/lib/supabase'
import { RATE_LIMITS, rateLimit } from '@/lib/rateLimit'
import { walletTransactionSchema } from '@/lib/schemas'
import { sendPushToPlayer } from '@/lib/webpush'

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  const user = session?.user as any
  if (!user?.isAdmin) return NextResponse.json({ error: 'Unauthorised' }, { status: 403 })

  const limited = await rateLimit(req, RATE_LIMITS.adminWrite, user.playerId)
  if (limited) return limited

  const body = await req.json().catch(() => null)
  const parsed = walletTransactionSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? 'Invalid request' },
      { status: 400 }
    )
  }
  const { player_id, type, amount, reason, notes } = parsed.data

  const supabase = createServiceClient()

  const { data: player, error: playerErr } = await supabase
    .from('players')
    .select('id, wallet_balance')
    .eq('id', player_id)
    .single()

  if (playerErr || !player) {
    return NextResponse.json({ error: 'Player not found' }, { status: 404 })
  }

  const delta = type === 'credit' ? amount : -amount
  const newBalance = Number(player.wallet_balance ?? 0) + delta

  // Ledger row written first — it's the source of truth. If the balance
  // sync below fails, the transaction is still on record and the
  // discrepancy is visible/fixable rather than silently lost.
  const { data: transaction, error: txErr } = await supabase
    .from('wallet_transactions')
    .insert({
      player_id,
      type,
      amount,
      reason,
      notes: notes || null,
      created_by: user.email ?? null,
    })
    .select()
    .single()

  if (txErr) return NextResponse.json({ error: txErr.message }, { status: 500 })

  const { data: updatedPlayer, error: balErr } = await supabase
    .from('players')
    .update({ wallet_balance: newBalance })
    .eq('id', player_id)
    .select()
    .single()

  if (balErr) {
    return NextResponse.json(
      { error: `Transaction recorded but balance sync failed: ${balErr.message}`, transaction },
      { status: 500 }
    )
  }

  // Awaited — Vercel serverless functions are killed the instant the
  // response returns, so fire-and-forget push sends never complete.
  await sendPushToPlayer(player_id, {
    title: type === 'credit' ? '💰 Wallet Credited' : '💰 Wallet Debited',
    body: `${type === 'credit' ? '+' : '-'}₹${amount} — ${reason}. New balance: ₹${newBalance}`,
    url: '/profile',
  })

  return NextResponse.json({ player: updatedPlayer, transaction })
}

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions)
  const user = session?.user as any
  if (!user?.isAdmin) return NextResponse.json({ error: 'Unauthorised' }, { status: 403 })

  const playerId = req.nextUrl.searchParams.get('player_id')
  if (!playerId) return NextResponse.json({ error: 'player_id is required' }, { status: 400 })

  const supabase = createServiceClient()
  const { data, error } = await supabase
    .from('wallet_transactions')
    .select('id, type, amount, reason, notes, created_by, created_at')
    .eq('player_id', playerId)
    .order('created_at', { ascending: false })
    .limit(50)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ transactions: data ?? [] })
}
