// src/app/api/player-availability/route.ts

import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { createServiceClient } from '@/lib/supabase'
import { rateLimit, RATE_LIMITS } from '@/lib/rateLimit'

const LOCK_MSG = 'Availability locked — Squad selection in progress'

// ── Shared freeze check ───────────────────────────────────────────────────────
// Returns LOCK_MSG if the slot is frozen for any reason, null otherwise.
// Vibe-security: always evaluated server-side — never trust client flags.
async function checkFreeze(
  supabase: ReturnType<typeof createServiceClient>,
  booking_id: string
): Promise<string | null> {
  const { data: booking } = await supabase
    .from('bookings')
    .select('availability_locked')
    .eq('id', booking_id)
    .single()
  if (booking?.availability_locked) return LOCK_MSG
  return null
}

// ── GET — own responses ───────────────────────────────────────────────────────
export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions)
  const player  = session?.user as any
  if (!player?.playerId) return NextResponse.json({ responses: {} })

  const supabase = createServiceClient()
  const { data } = await supabase
    .from('availability')
    .select('booking_id, response')
    .eq('player_id', player.playerId)

  const responses = Object.fromEntries((data ?? []).map(r => [r.booking_id, r.response]))
  return NextResponse.json({ responses })
}

// ── POST — self-update ────────────────────────────────────────────────────────
export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  const player  = session?.user as any
  if (!player?.playerId) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
  if (player?.playerStatus === 'expelled') return NextResponse.json({ error: 'Account suspended' }, { status: 403 })

  // Rate limit: 20 writes/min per player
  const limited = await rateLimit(req, RATE_LIMITS.playerWrite, player.playerId)
  if (limited) return limited

  const body = await req.json()
  const { booking_id, response } = body

  // N removed — valid responses are Y, O, E, L only
  if (!booking_id || !['Y', 'O', 'E', 'L'].includes(response)) {
    return NextResponse.json({ error: 'Invalid request — booking_id and valid response required' }, { status: 400 })
  }

  const supabase = createServiceClient()

  // ── GUARD 1: wallet dues ──────────────────────────────────────────────────
  const { data: playerRow, error: walletErr } = await supabase
    .from('players')
    .select('wallet_balance, dues_override, active')
    .eq('id', player.playerId)
    .single()

  if (walletErr || !playerRow) {
    return NextResponse.json({ error: 'Player not found' }, { status: 404 })
  }

  if ((playerRow.wallet_balance ?? 0) < 0 && !playerRow.dues_override) {
    return NextResponse.json(
      { error: 'Your account has an outstanding balance. Please clear dues to update availability.' },
      { status: 403 }
    )
  }

  // ── GUARD 2: availability_locked ──────────────────────────────────────────
  // Captains, GC, and admins bypass this guard — they manage the pool directly.
  if (!player.isCaptain && !player.isGC && !player.isAdmin) {
    const freezeMsg = await checkFreeze(supabase, booking_id)
    if (freezeMsg) return NextResponse.json({ error: freezeMsg }, { status: 403 })
  }

  // ── Explicit SELECT → INSERT or UPDATE (no upsert) ────────────────────────
  const { data: existing } = await supabase
    .from('availability')
    .select('id, response')
    .eq('booking_id', booking_id)
    .eq('player_id', player.playerId)
    .maybeSingle()

  const oldResponse = existing?.response ?? null
  let result: any

  if (existing?.id) {
    const { data, error } = await supabase
      .from('availability')
      .update({ response, updated_by: null, update_source: 'player' })
      .eq('id', existing.id)
      .select()
      .single()
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    result = data
  } else {
    const { data, error } = await supabase
      .from('availability')
      .insert({ player_id: player.playerId, booking_id, response, update_source: 'player' })
      .select()
      .single()
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    result = data
  }

  // Auto-reactivate inactive players — fire and forget
  if (!playerRow.active) {
    supabase.from('players').update({ active: true }).eq('id', player.playerId).then(() => {})
  }

  // Audit log — fire and forget
  supabase
    .from('availability_audit')
    .insert({
      availability_id: result.id,
      player_id:       player.playerId,
      booking_id,
      old_response:    oldResponse,
      new_response:    response,
      updated_by:      player.playerId,
      update_source:   'player',
      note:            null,
    })
    .then(({ error }) => {
      if (error) console.error('[audit] insert failed:', error.message)
    })

  return NextResponse.json({ availability: result })
}

// ── DELETE — clear response ───────────────────────────────────────────────────
export async function DELETE(req: NextRequest) {
  const session = await getServerSession(authOptions)
  const player  = session?.user as any
  if (!player?.playerId) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
  if (player?.playerStatus === 'expelled') return NextResponse.json({ error: 'Account suspended' }, { status: 403 })

  const limited = await rateLimit(req, RATE_LIMITS.playerWrite, player.playerId)
  if (limited) return limited

  const body = await req.json()
  const { booking_id } = body
  if (!booking_id) return NextResponse.json({ error: 'booking_id required' }, { status: 400 })

  const supabase = createServiceClient()

  // ── GUARD: availability_locked ──────────────────────────────────────────────
  // Captains, GC, and admins bypass — they can always override via captain-availability route.
  if (!player.isCaptain && !player.isGC && !player.isAdmin) {
    const freezeMsg = await checkFreeze(supabase, booking_id)
    if (freezeMsg) return NextResponse.json({ error: freezeMsg }, { status: 403 })
  }

  const { error } = await supabase
    .from('availability')
    .delete()
    .eq('player_id', player.playerId)
    .eq('booking_id', booking_id)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Audit log — fire and forget
  supabase
    .from('availability_audit')
    .insert({
      player_id:     player.playerId,
      booking_id,
      old_response:  null,
      new_response:  'CLEARED',
      updated_by:    player.playerId,
      update_source: 'player',
      note:          null,
    })
    .then(({ error }) => {
      if (error) console.error('[audit] insert failed:', error.message)
    })

  return NextResponse.json({ success: true })
}
