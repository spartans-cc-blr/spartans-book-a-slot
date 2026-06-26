import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { createServiceClient } from '@/lib/supabase'

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  const user = session?.user as any
  if (!user?.isAdmin) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { booking_id, confirm } = await req.json()
  if (!booking_id) return NextResponse.json({ error: 'booking_id required' }, { status: 400 })

  const supabase = createServiceClient()

  // Derive fee server-side — never trust client input
  const { data: bookingRow } = await supabase
    .from('bookings')
    .select('match_fee_override, tournament:tournaments(match_fee)')
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
    .select('player_id, players(id, wallet_balance, fee_exemptions(start_date, end_date))')
    .eq('booking_id', booking_id)
    .eq('status', 'announced')

  if (!squad?.length) {
    return NextResponse.json({ error: 'No announced squad for this booking' }, { status: 400 })
  }

  const today = new Date().toISOString().split('T')[0]

  const nonExemptSquad = squad.filter(row => {
    const player = row.players as any
    return !(player?.fee_exemptions ?? []).some(
      (e: any) => e.start_date <= today && (e.end_date === null || e.end_date >= today)
    )
  })

  const nonExemptCount = nonExemptSquad.length
  const feePerPlayer = nonExemptCount > 0 ? Math.ceil(baseFee / nonExemptCount) : 0

  if (!confirm) {
    // Dry-run: return the computed fee without applying
    return NextResponse.json({
      base_fee:         baseFee,
      non_exempt_count: nonExemptCount,
      fee_per_player:   feePerPlayer,
      total_squad:      squad.length,
    })
  }

  // Apply: debit each non-exempt player's wallet
  const errors: string[] = []
  for (const row of nonExemptSquad) {
    const player = row.players as any
    const currentBalance: number = player?.wallet_balance ?? 0
    const newBalance = currentBalance - feePerPlayer

    const { error } = await supabase
      .from('players')
      .update({ wallet_balance: newBalance })
      .eq('id', row.player_id)

    if (error) errors.push(`${row.player_id}: ${error.message}`)

    // Record wallet transaction
    await supabase.from('wallet_transactions').insert({
      player_id:   row.player_id,
      amount:      -feePerPlayer,
      type:        'match_fee',
      booking_id,
      note:        `Match fee debit — ₹${feePerPlayer}`,
    })
  }

  if (errors.length) {
    return NextResponse.json({ error: 'Partial failure', details: errors }, { status: 500 })
  }

  return NextResponse.json({
    ok:               true,
    fee_per_player:   feePerPlayer,
    players_debited:  nonExemptCount,
  })
}