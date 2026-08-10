import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { createServiceClient } from '@/lib/supabase'
import { sendPushToPlayer } from '@/lib/webpush'
import { feesApplySchema } from '@/lib/schemas'

// Analytics DB field names aren't part of this repo's schema, so every
// lookup tries a couple of likely keys — same tolerance as ScorecardTables.tsx.
function pickField(row: any, keys: string[]): any {
  for (const k of keys) if (row?.[k] != null) return row[k]
  return null
}
function num(row: any, keys: string[]): number {
  const v = pickField(row, keys)
  return v != null ? Number(v) : 0
}

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
      return NextResponse.json({ error: 'Fees have already been applied for this booking' }, { status: 400 })
    }
  }

  // Derive fee server-side — never trust client input
  const { data: bookingRow } = await supabase
    .from('bookings')
    .select('match_id, match_fee_override, tournament:tournaments(match_fee)')
    .eq('id', booking_id)
    .single()

  const baseFee: number | null =
    (bookingRow as any)?.match_fee_override ??
    (bookingRow as any)?.tournament?.match_fee ??
    null

  if (!baseFee) {
    return NextResponse.json({ error: 'No match fee configured for this booking' }, { status: 400 })
  }

  // Fetch announced squad with live exemption data
  const { data: squad } = await supabase
    .from('squad')
    .select('player_id, players(id, name, wallet_balance, fee_exemptions(start_date, end_date))')
    .eq('booking_id', booking_id)
    .eq('status', 'announced')

  if (!squad?.length) {
    return NextResponse.json({ error: 'No announced squad for this booking' }, { status: 400 })
  }

  // Unit overrides must actually be for players in this booking's own
  // squad — never trust a client-supplied player_id beyond that.
  const squadIds = new Set(squad.map(row => row.player_id))
  const unitOverrideIds = Object.keys(player_units)
  if (unitOverrideIds.some(id => !squadIds.has(id))) {
    return NextResponse.json(
      { error: "One or more players are not in this booking's announced squad" },
      { status: 400 }
    )
  }

  const today = new Date().toISOString().split('T')[0]
  const isExempt = (row: any) =>
    (row.players?.fee_exemptions ?? []).some(
      (e: any) => e.start_date <= today && (e.end_date === null || e.end_date >= today)
    )

  // Batting/bowling involvement — the "did they actually get a role" signal
  // for the waiver checklist. Same did-not-bat/bowl convention as
  // ScorecardTables.tsx. Best-effort: if the match isn't synced yet or a
  // scorecard name hasn't been reconciled to a player_id, this just comes
  // back empty rather than blocking anything.
  const battedIds = new Set<string>()
  const bowledIds = new Set<string>()
  if (bookingRow?.match_id) {
    const { data: statsRow } = await supabase
      .from('match_stats_cache')
      .select('batting, bowling')
      .eq('match_id', bookingRow.match_id)
      .maybeSingle()
    const nameToId = new Map(
      squad.map(row => [((row.players as any)?.name ?? '').trim().toLowerCase(), row.player_id])
    )
    for (const row of (statsRow as any)?.batting ?? []) {
      if (pickField(row, ['dismissal_method']) === 'did_not_bat' || num(row, ['balls', 'balls_faced']) <= 0) continue
      const pid = pickField(row, ['player_id']) ?? nameToId.get((pickField(row, ['player_name', 'name']) ?? '').trim().toLowerCase())
      if (pid) battedIds.add(pid)
    }
    for (const row of (statsRow as any)?.bowling ?? []) {
      if (num(row, ['overs', 'overs_bowled']) <= 0) continue
      const pid = pickField(row, ['player_id']) ?? nameToId.get((pickField(row, ['player_name', 'name']) ?? '').trim().toLowerCase())
      if (pid) bowledIds.add(pid)
    }
  }

  // Default share count for a player who wasn't given an explicit override:
  // 0 for a standing exemption (never overridable — see below) or a squad
  // member with no recorded batting/bowling role, 1 for a recognized role.
  // "No role recorded" defaults to excluded rather than included — a player
  // who never appears on the scorecard at all is assumed not to have
  // actually played, not silently charged unless an admin notices and
  // unchecks them.
  const defaultUnits = (row: any): number => {
    if (isExempt(row)) return 0
    return battedIds.has(row.player_id) || bowledIds.has(row.player_id) ? 1 : 0
  }

  // Final units per player: the client's override if one was sent for that
  // player, clamped 0-12 (already enforced by the schema), else the
  // server-computed default. A standing exemption always wins regardless of
  // what the client sent — same as the old "waived: true, disabled" row,
  // never client-overridable.
  const finalUnits = (row: any): number =>
    isExempt(row) ? 0 : (player_units[row.player_id] ?? defaultUnits(row))

  const squadDetail = squad.map(row => ({
    player_id:     row.player_id,
    name:          (row.players as any)?.name ?? 'Unknown',
    exempt:        isExempt(row),
    batted:        battedIds.has(row.player_id),
    bowled:        bowledIds.has(row.player_id),
    units:         finalUnits(row),
    default_units: defaultUnits(row),
  }))

  const totalUnits = squadDetail.reduce((sum, row) => sum + row.units, 0)
  const unitPrice = totalUnits > 0 ? Math.ceil(baseFee / totalUnits) : 0
  const squadWithFee = squadDetail.map(row => ({ ...row, fee: unitPrice * row.units }))
  const includedCount = squadWithFee.filter(row => row.units > 0).length
  const totalCollectable = squadWithFee.reduce((sum, row) => sum + row.fee, 0)

  // Rows whose final share diverges from the server-computed default —
  // these are the only ones that need (and get) a logged reason, and the
  // only ones written to match_fee_waivers on confirm.
  const adjustedRows = squadWithFee.filter(row => row.units !== row.default_units)

  if (!confirm) {
    // Dry-run: return the computed fee without applying
    return NextResponse.json({
      base_fee:          baseFee,
      total_units:       totalUnits,
      unit_price:        unitPrice,
      included_count:    includedCount,
      total_collectable: totalCollectable,
      total_squad:       squad.length,
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
  for (const row of squad) {
    const units = finalUnits(row)
    if (units <= 0) continue
    const fee = unitPrice * units

    const player = row.players as any
    const currentBalance: number = player?.wallet_balance ?? 0
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
      reason:      `Match fee debit — ₹${fee}${units > 1 ? ` (${units} shares)` : ''}`,
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
