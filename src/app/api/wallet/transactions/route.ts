// Player Payment Ledger — see features/wallet-ledger.md.
//
// GET  — bank-statement-style paginated read.
//   • Any signed-in player with a playerId: their own transactions
//     (newest first), unless `player_id` is given and differs — that's
//     admin-only cross-player lookup, same "own by default, admin
//     override via ?player_id=" convention as
//     /api/player/future-availability.
//   • `scope=all` (admin only): a club-wide ledger across every player,
//     each row carrying the player's name — feeds the /admin/wallet hub's
//     "Recent Transactions" list.
//   • Cursor-paginated via `cursor_created_at` + `cursor_id` (the last row
//     of the previous page) — 20 rows per page. Once the single-player
//     mode has genuinely reached the end (`has_more: false`), the response
//     also includes `opening_balance` — the "Brought Forward" line the
//     client renders as the final row of the statement. See §"Brought
//     Forward" in the feature doc for why this is computed, not stored,
//     unless an admin has explicitly overridden it.
//
// POST — admin-only wallet adjustment (unchanged from the original S-1
//   route, plus an optional `created_at` for backdating a historic entry
//   the ledger never captured at the time).
//
// PATCH — admin-only correction of an existing transaction. Never a raw
//   UPDATE with no trail: the pre-edit values are preserved in
//   wallet_transaction_edits first, and — since amount/type edits shift
//   the running total regardless of a transaction's position in time —
//   players.wallet_balance is adjusted by exactly the delta the edit
//   introduces (newDelta - oldDelta), keeping every player's live balance
//   mathematically consistent with "opening balance + sum(ledger)" without
//   needing to replay the whole ledger. player_id and booking_id are
//   deliberately never editable — a correction fixes what happened, it
//   never reassigns who or which match it happened to/for.

import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { createServiceClient } from '@/lib/supabase'
import { RATE_LIMITS, rateLimit } from '@/lib/rateLimit'
import { walletTransactionSchema, walletTransactionEditSchema } from '@/lib/schemas'
import { sendPushToPlayer } from '@/lib/webpush'

const PAGE_SIZE = 20

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
  const { player_id, type, amount, reason, notes, created_at } = parsed.data

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
      ...(created_at ? { created_at } : {}),
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

  // A backdated entry doesn't reflect something that "just happened" to
  // the player right now — skip the push for those, same reasoning as the
  // PATCH handler below skipping it for cosmetic-only edits.
  if (!created_at) {
    await sendPushToPlayer(player_id, {
      title: type === 'credit' ? '💰 Wallet Credited' : '💰 Wallet Debited',
      body: `${type === 'credit' ? '+' : '-'}₹${amount} — ${reason}. New balance: ₹${newBalance}`,
      url: '/wallet',
    })
  }

  return NextResponse.json({ player: updatedPlayer, transaction })
}

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions)
  const user = session?.user as any
  if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })

  const isAdmin = !!user.isAdmin
  const scope = req.nextUrl.searchParams.get('scope')
  const cursorCreatedAt = req.nextUrl.searchParams.get('cursor_created_at')
  const cursorId = req.nextUrl.searchParams.get('cursor_id')

  const limited = await rateLimit(req, RATE_LIMITS.publicRead, user.playerId ?? user.email)
  if (limited) return limited

  const supabase = createServiceClient()

  // ── Club-wide ledger (admin only) ──────────────────────────────────────
  if (scope === 'all') {
    if (!isAdmin) return NextResponse.json({ error: 'Unauthorised' }, { status: 403 })

    let query = supabase
      .from('wallet_transactions')
      .select('id, player_id, type, amount, reason, notes, created_by, created_at, booking_id, edited_at, edited_by, players(name)')
      .order('created_at', { ascending: false })
      .order('id', { ascending: false })
      .limit(PAGE_SIZE + 1)

    if (cursorCreatedAt && cursorId) {
      query = query.or(`created_at.lt.${cursorCreatedAt},and(created_at.eq.${cursorCreatedAt},id.lt.${cursorId})`)
    }

    const { data, error } = await query
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    const rows = data ?? []
    const hasMore = rows.length > PAGE_SIZE
    const page = hasMore ? rows.slice(0, PAGE_SIZE) : rows
    const last = page[page.length - 1]

    return NextResponse.json({
      transactions: page.map(t => ({ ...t, player_name: (t as any).players?.name ?? null })),
      has_more: hasMore,
      next_cursor: hasMore && last ? { created_at: last.created_at, id: last.id } : null,
    })
  }

  // ── Single-player statement — own, or (admin only) another player's ────
  const requestedPlayerId = req.nextUrl.searchParams.get('player_id')
  if (requestedPlayerId && requestedPlayerId !== user.playerId && !isAdmin) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }
  const targetPlayerId = requestedPlayerId || user.playerId
  if (!targetPlayerId) {
    return NextResponse.json({ error: 'player_id is required' }, { status: 400 })
  }

  const { data: playerRow, error: playerErr } = await supabase
    .from('players')
    .select('name, wallet_balance, wallet_opening_balance, wallet_opening_balance_note, wallet_opening_balance_set_by, wallet_opening_balance_set_at')
    .eq('id', targetPlayerId)
    .single()
  if (playerErr || !playerRow) {
    return NextResponse.json({ error: 'Player not found' }, { status: 404 })
  }

  let query = supabase
    .from('wallet_transactions')
    .select('id, type, amount, reason, notes, created_by, created_at, booking_id, edited_at, edited_by')
    .eq('player_id', targetPlayerId)
    .order('created_at', { ascending: false })
    .order('id', { ascending: false })
    .limit(PAGE_SIZE + 1)

  if (cursorCreatedAt && cursorId) {
    query = query.or(`created_at.lt.${cursorCreatedAt},and(created_at.eq.${cursorCreatedAt},id.lt.${cursorId})`)
  }

  const { data, error } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const rows = data ?? []
  const hasMore = rows.length > PAGE_SIZE
  const page = hasMore ? rows.slice(0, PAGE_SIZE) : rows
  const last = page[page.length - 1]

  const response: Record<string, unknown> = {
    transactions: page,
    has_more: hasMore,
    next_cursor: hasMore && last ? { created_at: last.created_at, id: last.id } : null,
    current_balance: Number(playerRow.wallet_balance ?? 0),
    player_name: playerRow.name,
  }

  // Only computed once the statement has genuinely reached the end — no
  // point summing every transaction on every page of a long history.
  if (!hasMore) {
    const { data: allTx } = await supabase
      .from('wallet_transactions')
      .select('type, amount')
      .eq('player_id', targetPlayerId)
    const ledgerSum = (allTx ?? []).reduce(
      (sum, t) => sum + (t.type === 'credit' ? Number(t.amount) : -Number(t.amount)), 0
    )
    const computed = Number(playerRow.wallet_balance ?? 0) - ledgerSum
    const override = playerRow.wallet_opening_balance
    response.opening_balance = {
      amount: override != null ? Number(override) : computed,
      is_override: override != null,
      computed_amount: computed,
      note: playerRow.wallet_opening_balance_note ?? null,
      set_by: playerRow.wallet_opening_balance_set_by ?? null,
      set_at: playerRow.wallet_opening_balance_set_at ?? null,
    }
  }

  return NextResponse.json(response)
}

export async function PATCH(req: NextRequest) {
  const session = await getServerSession(authOptions)
  const user = session?.user as any
  if (!user?.isAdmin) return NextResponse.json({ error: 'Unauthorised' }, { status: 403 })

  const limited = await rateLimit(req, RATE_LIMITS.adminWrite, user.playerId)
  if (limited) return limited

  const body = await req.json().catch(() => null)
  const parsed = walletTransactionEditSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? 'Invalid request' },
      { status: 400 }
    )
  }
  const { id, edit_reason, ...changes } = parsed.data

  const supabase = createServiceClient()

  const { data: existing, error: fetchErr } = await supabase
    .from('wallet_transactions')
    .select('id, player_id, type, amount, reason, notes, created_at')
    .eq('id', id)
    .single()
  if (fetchErr || !existing) {
    return NextResponse.json({ error: 'Transaction not found' }, { status: 404 })
  }

  const newType = changes.type ?? existing.type
  const newAmount = changes.amount ?? Number(existing.amount)
  const oldDelta = existing.type === 'credit' ? Number(existing.amount) : -Number(existing.amount)
  const newDelta = newType === 'credit' ? newAmount : -newAmount
  const diff = newDelta - oldDelta

  // Audit row written before the correction itself — captures exactly what
  // this edit is changing away from, regardless of whether the update
  // below succeeds.
  const { error: auditErr } = await supabase.from('wallet_transaction_edits').insert({
    transaction_id: id,
    edited_by: user.email ?? '',
    edit_reason,
    old_type: existing.type,
    old_amount: existing.amount,
    old_reason: existing.reason,
    old_notes: existing.notes,
    old_created_at: existing.created_at,
  })
  if (auditErr) return NextResponse.json({ error: auditErr.message }, { status: 500 })

  const updates: Record<string, unknown> = {
    edited_at: new Date().toISOString(),
    edited_by: user.email ?? null,
  }
  if (changes.type !== undefined) updates.type = changes.type
  if (changes.amount !== undefined) updates.amount = changes.amount
  if (changes.reason !== undefined) updates.reason = changes.reason
  if (changes.notes !== undefined) updates.notes = changes.notes || null
  if (changes.created_at !== undefined) updates.created_at = changes.created_at

  const { data: updatedTx, error: txErr } = await supabase
    .from('wallet_transactions')
    .update(updates)
    .eq('id', id)
    .select()
    .single()
  if (txErr) return NextResponse.json({ error: txErr.message }, { status: 500 })

  let updatedPlayer = null
  if (diff !== 0) {
    const { data: playerRow, error: playerErr } = await supabase
      .from('players')
      .select('id, wallet_balance')
      .eq('id', existing.player_id)
      .single()
    if (playerErr || !playerRow) {
      return NextResponse.json(
        { error: 'Transaction corrected but player lookup failed — balance may be out of sync', transaction: updatedTx },
        { status: 500 }
      )
    }
    const newBalance = Number(playerRow.wallet_balance ?? 0) + diff
    const { data: savedPlayer, error: balErr } = await supabase
      .from('players')
      .update({ wallet_balance: newBalance })
      .eq('id', existing.player_id)
      .select()
      .single()
    if (balErr) {
      return NextResponse.json(
        { error: `Transaction corrected but balance sync failed: ${balErr.message}`, transaction: updatedTx },
        { status: 500 }
      )
    }
    updatedPlayer = savedPlayer

    await sendPushToPlayer(existing.player_id, {
      title: '💰 Wallet Correction',
      body: `A past transaction was corrected — new balance: ₹${newBalance}`,
      url: '/wallet',
    })
  }

  return NextResponse.json({ transaction: updatedTx, player: updatedPlayer })
}
