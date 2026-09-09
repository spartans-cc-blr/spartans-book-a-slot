import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { createServiceClient } from '@/lib/supabase'
import { sendPushToPlayer } from '@/lib/webpush'
import { feesApplySchema, feesCorrectSchema } from '@/lib/schemas'
import { RATE_LIMITS, rateLimit } from '@/lib/rateLimit'
import { computeMatchFeeSplit } from '@/lib/matchFeeSplit'

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  const user = session?.user as any
  if (!user?.isAdmin) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const body = await req.json().catch(() => null)
  const parsed = feesApplySchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? 'Invalid request' },
      { status: 400 }
    )
  }
  const { booking_id, confirm, player_units, adjustment_reason } = parsed.data

  const supabase = createServiceClient()

  // Guard against double-apply — without this, re-running confirm on an
  // already-applied booking would silently debit every player a second
  // time. Checked against wallet_transactions itself, not
  // scorecard_uploads.status: "Reset Upload" deletes the scorecard_uploads
  // row entirely (even after fees_applied, with its own warning that it
  // doesn't reverse debits), which would otherwise make this booking look
  // never-applied again and let a second debit round through.
  if (confirm) {
    const { data: existingDebit } = await supabase
      .from('wallet_transactions')
      .select('id')
      .eq('booking_id', booking_id)
      .eq('type', 'debit')
      .limit(1)
      .maybeSingle()
    if (existingDebit) {
      return NextResponse.json({
        error: 'Fees have already been applied for this booking — use Correct Match Fee to revise the split.',
      }, { status: 400 })
    }
  }

  // Matches before the 8 Aug 2026 weekend already had fees collected
  // through the legacy Hub Google Sheets process, never through the Hub's
  // own wallet — applying here too would double-charge every player.
  // Checked server-side (not just the UI hiding the button/checklist) so a
  // direct URL or API hit can't bypass it — see migration 062.
  const { data: uploadRow } = await supabase
    .from('scorecard_uploads')
    .select('fees_reconciled_externally')
    .eq('booking_id', booking_id)
    .maybeSingle()
  if (uploadRow?.fees_reconciled_externally) {
    return NextResponse.json(
      { error: "This match's fees were already reconciled outside the Hub (legacy spreadsheet) — applying here would double-charge players." },
      { status: 400 }
    )
  }

  const split = await computeMatchFeeSplit(supabase, booking_id, player_units)
  if ('error' in split) return NextResponse.json({ error: split.error }, { status: split.status })

  const { squad: squadWithFee, unitPrice, includedCount, totalCollectable, totalSquad, adjustedRows, baseFee, totalUnits } = split

  if (!confirm) {
    // Dry-run: return the computed fee without applying
    return NextResponse.json({
      base_fee:          baseFee,
      total_units:       totalUnits,
      unit_price:        unitPrice,
      included_count:    includedCount,
      total_collectable: totalCollectable,
      total_squad:       totalSquad,
      squad:             squadWithFee,
    })
  }

  if (adjustedRows.length > 0 && !adjustment_reason) {
    return NextResponse.json(
      { error: "A reason is required when adjusting a player's fee share from the default" },
      { status: 400 }
    )
  }

  // Apply: debit each included player's wallet by their own share
  // (units × unit_price — a player with 2 units, e.g. covering a guest,
  // pays double a single-share player, not the same flat amount).
  const errors: string[] = []
  // Pushes collected rather than awaited inline — sent together after the
  // loop so one slow push doesn't serialize the whole debit run. Still
  // awaited before the response is returned (Vercel kills fire-and-forget
  // work the instant a serverless function returns — see webpush.ts).
  const pushes: Promise<unknown>[] = []
  for (const row of squadWithFee) {
    if (row.units <= 0) continue
    const fee = row.fee

    const { data: playerRow, error: fetchErr } = await supabase
      .from('players')
      .select('wallet_balance')
      .eq('id', row.player_id)
      .single()
    if (fetchErr || !playerRow) { errors.push(`${row.player_id}: player not found`); continue }

    const currentBalance: number = playerRow.wallet_balance ?? 0
    const newBalance = currentBalance - fee

    const { error } = await supabase
      .from('players')
      .update({ wallet_balance: newBalance })
      .eq('id', row.player_id)

    if (error) errors.push(`${row.player_id}: ${error.message}`)

    // Record wallet transaction — wallet_transactions.type only allows
    // 'debit'/'credit' and the free-text column is `reason`, not `note`;
    // this insert previously violated both silently (error was never
    // checked), so every fee-apply left the ledger empty. amount is a
    // positive magnitude here, matching POST /api/wallet/transactions'
    // convention — direction comes from `type`, not the sign.
    const { error: txError } = await supabase.from('wallet_transactions').insert({
      player_id:   row.player_id,
      amount:      fee,
      type:        'debit',
      booking_id,
      reason:      `Match fee debit — ₹${fee}${row.units > 1 ? ` (${row.units} shares)` : ''}`,
    })
    if (txError) errors.push(`${row.player_id} (ledger): ${txError.message}`)

    if (!error && !txError) {
      pushes.push(sendPushToPlayer(row.player_id, {
        title: '💰 Wallet Debited',
        body: `-₹${fee} — Match fee. New balance: ₹${newBalance}`,
        url: '/profile',
      }))
    }
  }

  // Record per-booking, per-player share adjustments — separate from the
  // standing fee_exemptions table by design: a judgment call for this
  // match only, never leaks into any other booking's fee application. Only
  // rows that actually diverged from the server-computed default are
  // logged, each carrying the one shared reason the admin gave for this
  // apply action.
  if (adjustedRows.length) {
    const { error: waiverErr } = await supabase.from('match_fee_waivers').insert(
      adjustedRows.map(row => ({
        booking_id,
        player_id:       row.player_id,
        units:           row.units,
        reason:          adjustment_reason!,
        waived_by:       user.playerId ?? null,
        waived_by_email: user.email ?? '',
      }))
    )
    if (waiverErr) errors.push(`adjustments: ${waiverErr.message}`)
  }

  await Promise.allSettled(pushes)

  if (errors.length) {
    return NextResponse.json({ error: 'Partial failure', details: errors }, { status: 500 })
  }

  await supabase
    .from('scorecard_uploads')
    .update({ status: 'fees_applied', fees_applied_at: new Date().toISOString() })
    .eq('booking_id', booking_id)

  return NextResponse.json({
    ok:                true,
    unit_price:        unitPrice,
    total_collectable: totalCollectable,
    players_debited:   includedCount,
    players_adjusted:  adjustedRows.length,
  })
}

// PATCH — corrects an already-applied match fee at the match level: the
// per-player split is recomputed the same way POST does (same squad,
// exemptions, batted/bowled defaults, plus any fresh unit overrides), and
// every player whose recomputed share differs from what they've actually
// been charged for this booking so far gets a single adjusting ledger
// entry for exactly the difference — never a manual per-wallet edit, and
// never a mutation of the original debit rows. See
// features/post-match-scorecard.md §6.1.
export async function PATCH(req: NextRequest) {
  const session = await getServerSession(authOptions)
  const user = session?.user as any
  if (!user?.isAdmin) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const limited = await rateLimit(req, RATE_LIMITS.adminWrite, user.playerId)
  if (limited) return limited

  const body = await req.json().catch(() => null)
  const parsed = feesCorrectSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? 'Invalid request' },
      { status: 400 }
    )
  }
  const { booking_id, confirm, player_units, adjustment_reason, correction_reason } = parsed.data

  const supabase = createServiceClient()

  const { data: uploadRow } = await supabase
    .from('scorecard_uploads')
    .select('status')
    .eq('booking_id', booking_id)
    .maybeSingle()
  if (uploadRow?.status !== 'fees_applied') {
    return NextResponse.json(
      { error: 'Fees have not been applied for this booking yet — use Apply Match Fees, not Correct Match Fee.' },
      { status: 400 }
    )
  }

  // Every wallet_transactions row carrying this booking_id is a match-fee
  // entry — nothing else in this app writes booking_id onto a wallet
  // transaction (POST /api/wallet/transactions doesn't accept the field at
  // all, and the quarterly membership fee deliberately omits it — see
  // features/wallet-ledger.md §12 — specifically to avoid colliding with
  // this same signal). So the net of every existing row per player here is
  // exactly "what this player has actually been charged for this match so
  // far," correct even after an earlier correction pass already ran.
  const { data: existingRows, error: existingErr } = await supabase
    .from('wallet_transactions')
    .select('player_id, type, amount')
    .eq('booking_id', booking_id)
  if (existingErr) return NextResponse.json({ error: existingErr.message }, { status: 500 })
  if (!existingRows?.length) {
    return NextResponse.json(
      { error: 'No existing match fee ledger entries found for this booking.' },
      { status: 400 }
    )
  }

  const currentNet = new Map<string, number>()
  for (const row of existingRows) {
    const delta = row.type === 'debit' ? Number(row.amount) : -Number(row.amount)
    currentNet.set(row.player_id, (currentNet.get(row.player_id) ?? 0) + delta)
  }
  const totalBefore = existingRows.reduce(
    (sum, row) => sum + (row.type === 'debit' ? Number(row.amount) : -Number(row.amount)), 0
  )

  const split = await computeMatchFeeSplit(supabase, booking_id, player_units)
  if ('error' in split) return NextResponse.json({ error: split.error }, { status: split.status })

  const diffRows = split.squad
    .map(row => {
      const oldFee = currentNet.get(row.player_id) ?? 0
      return { ...row, old_fee: oldFee, delta: row.fee - oldFee }
    })
    .filter(row => row.delta !== 0)

  // A player can have a real charge on this booking without appearing in
  // computeMatchFeeSplit()'s squad array at all — not just "set to 0 units
  // within an unchanged squad" (which the loop above already handles), but
  // removed from the announced squad entirely (a squad edit after fees were
  // applied). computeMatchFeeSplit() has no way to know about them since it
  // only ever looks at the *current* announced squad — so they're resolved
  // here directly from the ledger instead, and always fully refunded (they
  // owe nothing towards a match they're no longer squadded for).
  const squadPlayerIds = new Set(split.squad.map(row => row.player_id))
  const orphanIds = Array.from(currentNet.keys()).filter(
    pid => !squadPlayerIds.has(pid) && (currentNet.get(pid) ?? 0) !== 0
  )
  let removedPlayers: { player_id: string; name: string; old_fee: number }[] = []
  let orphanDiffRows: typeof diffRows = []
  if (orphanIds.length) {
    const { data: orphanPlayerRows } = await supabase
      .from('players')
      .select('id, name')
      .in('id', orphanIds)
    const nameById = new Map((orphanPlayerRows ?? []).map(p => [p.id, p.name]))
    removedPlayers = orphanIds.map(pid => ({
      player_id: pid,
      name: nameById.get(pid) ?? 'Unknown',
      old_fee: currentNet.get(pid) ?? 0,
    }))
    orphanDiffRows = removedPlayers.map(p => ({
      player_id: p.player_id,
      name: p.name,
      exempt: false,
      batted: false,
      bowled: false,
      units: 0,
      default_units: 0,
      fee: 0,
      old_fee: p.old_fee,
      delta: -p.old_fee,
    }))
  }
  const allDiffRows = [...diffRows, ...orphanDiffRows]

  if (!confirm) {
    return NextResponse.json({
      base_fee:                    split.baseFee,
      total_units:                 split.totalUnits,
      unit_price:                  split.unitPrice,
      included_count:              split.includedCount,
      total_squad:                 split.totalSquad,
      squad:                       split.squad.map(row => ({ ...row, old_fee: currentNet.get(row.player_id) ?? 0 })),
      removed_players:             removedPlayers,
      total_collectable:           split.totalCollectable,
      total_previously_collected:  totalBefore,
      net_change:                  split.totalCollectable - totalBefore,
      changed_count:               allDiffRows.length,
    })
  }

  if (split.adjustedRows.length > 0 && !adjustment_reason) {
    return NextResponse.json(
      { error: "A reason is required when adjusting a player's fee share from the default" },
      { status: 400 }
    )
  }
  if (!allDiffRows.length) {
    return NextResponse.json(
      { error: 'Nothing to correct — the recomputed split already matches what was charged.' },
      { status: 400 }
    )
  }

  const errors: string[] = []
  const pushes: Promise<unknown>[] = []
  const changes: { player_id: string; name: string; old_fee: number; new_fee: number; action: 'added' | 'removed' | 'adjusted' }[] = []

  for (const row of allDiffRows) {
    const { data: playerRow, error: playerErr } = await supabase
      .from('players')
      .select('wallet_balance')
      .eq('id', row.player_id)
      .single()
    if (playerErr || !playerRow) { errors.push(`${row.player_id}: player not found`); continue }

    const currentBalance = Number(playerRow.wallet_balance ?? 0)
    const action: 'added' | 'removed' | 'adjusted' =
      row.old_fee <= 0 ? 'added' : row.fee <= 0 ? 'removed' : 'adjusted'

    // Always an additive adjusting entry, never a mutation of an existing
    // row — correct under any number of repeat corrections, since it's
    // derived from the current net position rather than one specific
    // transaction's id.
    const isRefund = row.delta < 0
    const magnitude = Math.abs(row.delta)
    const { error: txErr } = await supabase.from('wallet_transactions').insert({
      player_id: row.player_id,
      amount:    magnitude,
      type:      isRefund ? 'credit' : 'debit',
      booking_id,
      reason:    isRefund
        ? `Match fee correction — refund ₹${magnitude} (revised total ₹${row.fee})`
        : `Match fee correction — additional ₹${magnitude} (revised total ₹${row.fee})`,
    })
    if (txErr) { errors.push(`${row.player_id} (ledger): ${txErr.message}`); continue }

    const newBalance = currentBalance + (isRefund ? magnitude : -magnitude)
    const { error: balErr } = await supabase
      .from('players')
      .update({ wallet_balance: newBalance })
      .eq('id', row.player_id)
    if (balErr) { errors.push(`${row.player_id} (balance): ${balErr.message}`); continue }

    pushes.push(sendPushToPlayer(row.player_id, {
      title: isRefund ? '💰 Wallet Credited' : '💰 Wallet Debited',
      body: `Match fee corrected — ₹${row.old_fee} → ₹${row.fee}. New balance: ₹${newBalance}`,
      url: '/wallet',
    }))
    changes.push({ player_id: row.player_id, name: row.name, old_fee: row.old_fee, new_fee: row.fee, action })
  }

  if (split.adjustedRows.length) {
    const { error: waiverErr } = await supabase.from('match_fee_waivers').insert(
      split.adjustedRows.map(row => ({
        booking_id,
        player_id:       row.player_id,
        units:           row.units,
        reason:          `${adjustment_reason!} (correction)`,
        waived_by:       user.playerId ?? null,
        waived_by_email: user.email ?? '',
      }))
    )
    if (waiverErr) errors.push(`adjustments: ${waiverErr.message}`)
  }

  await Promise.allSettled(pushes)

  // The one summary record for "why was this match's fee revisited" —
  // independent of hunting through the individual adjusting ledger rows
  // above, which each only carry their own player's before/after.
  const { error: logErr } = await supabase.from('match_fee_corrections').insert({
    booking_id,
    base_fee:           split.baseFee,
    total_before:       totalBefore,
    total_after:        split.totalCollectable,
    changes,
    corrected_by:       user.playerId ?? null,
    corrected_by_email: user.email ?? '',
    correction_reason,
  })
  if (logErr) errors.push(`correction log: ${logErr.message}`)

  if (errors.length) {
    return NextResponse.json({ error: 'Partial failure', details: errors }, { status: 500 })
  }

  return NextResponse.json({
    ok:                          true,
    unit_price:                  split.unitPrice,
    total_collectable:           split.totalCollectable,
    total_previously_collected:  totalBefore,
    net_change:                  split.totalCollectable - totalBefore,
    players_changed:             changes.length,
  })
}
