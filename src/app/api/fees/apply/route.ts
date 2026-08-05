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
  const { booking_id, confirm, waived_player_ids, waiver_reason } = parsed.data

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

  // Waived players must actually be in this booking's own squad — never
  // trust a client-supplied ID list beyond that.
  const squadIds = new Set(squad.map(row => row.player_id))
  if (waived_player_ids.some(id => !squadIds.has(id))) {
    return NextResponse.json(
      { error: "One or more waived players are not in this booking's announced squad" },
      { status: 400 }
    )
  }
  const waivedSet = new Set(waived_player_ids)

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

  const squadDetail = squad.map(row => ({
    player_id: row.player_id,
    name:      (row.players as any)?.name ?? 'Unknown',
    exempt:    isExempt(row),
    waived:    waivedSet.has(row.player_id),
    batted:    battedIds.has(row.player_id),
    bowled:    bowledIds.has(row.player_id),
  }))

  const nonExemptSquad = squad.filter(row => !isExempt(row) && !waivedSet.has(row.player_id))

  const nonExemptCount = nonExemptSquad.length
  const feePerPlayer = nonExemptCount > 0 ? Math.ceil(baseFee / nonExemptCount) : 0

  if (!confirm) {
    // Dry-run: return the computed fee without applying
    return NextResponse.json({
      base_fee:         baseFee,
      non_exempt_count: nonExemptCount,
      fee_per_player:   feePerPlayer,
      total_squad:      squad.length,
      squad:            squadDetail,
    })
  }

  // Apply: debit each non-exempt, non-waived player's wallet
  const errors: string[] = []
  // Pushes collected rather than awaited inline — sent together after the
  // loop so one slow push doesn't serialize the whole debit run. Still
  // awaited before the response is returned (Vercel kills fire-and-forget
  // work the instant a serverless function returns — see webpush.ts).
  const pushes: Promise<unknown>[] = []
  for (const row of nonExemptSquad) {
    const player = row.players as any
    const currentBalance: number = player?.wallet_balance ?? 0
    const newBalance = currentBalance - feePerPlayer

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
      amount:      feePerPlayer,
      type:        'debit',
      booking_id,
      reason:      `Match fee debit — ₹${feePerPlayer}`,
    })
    if (txError) errors.push(`${row.player_id} (ledger): ${txError.message}`)

    if (!error && !txError) {
      pushes.push(sendPushToPlayer(row.player_id, {
        title: '💰 Wallet Debited',
        body: `-₹${feePerPlayer} — Match fee. New balance: ₹${newBalance}`,
        url: '/profile',
      }))
    }
  }

  // Record per-booking, per-player waivers — separate from the standing
  // fee_exemptions table by design: a judgment call for this match only,
  // never leaks into any other booking's fee application.
  if (waived_player_ids.length) {
    const { error: waiverErr } = await supabase.from('match_fee_waivers').insert(
      waived_player_ids.map(player_id => ({
        booking_id,
        player_id,
        reason:          waiver_reason!,
        waived_by:       user.playerId ?? null,
        waived_by_email: user.email ?? '',
      }))
    )
    if (waiverErr) errors.push(`waivers: ${waiverErr.message}`)
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
    ok:               true,
    fee_per_player:   feePerPlayer,
    players_debited:  nonExemptCount,
    players_waived:   waived_player_ids.length,
  })
}
