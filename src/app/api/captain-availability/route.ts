// app/api/captain/availability/route.ts
// Captain-only endpoint to set availability on behalf of a player.
// Writes provenance (updated_by, update_source) and inserts an immutable audit row.

import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { createServiceClient } from '@/lib/supabase'

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  const user    = session?.user as any

  if (!user?.isCaptain && !user?.isAdmin) {
    return NextResponse.json({ error: 'Unauthorised — captains only' }, { status: 403 })
  }

  const body = await req.json()
  const { player_id, booking_id, response, note } = body

  if (!player_id || !booking_id) {
    return NextResponse.json({ error: 'player_id and booking_id required' }, { status: 400 })
  }
  // null response = delete (clear availability)
  if (response !== null && !['Y', 'O', 'E', 'L'].includes(response)) {
    return NextResponse.json({ error: 'Invalid response value' }, { status: 400 })
  }

  const supabase      = createServiceClient()
  const captainPlayerId = user.playerId

  // ── Fetch current availability row (for audit old_response) ──
  const { data: existing } = await supabase
    .from('availability')
    .select('id, response')
    .eq('player_id', player_id)
    .eq('booking_id', booking_id)
    .single()

  const oldResponse = existing?.response ?? null

  // ── Apply the change ──────────────────────────────────────────
  if (response === null) {
    // Clear — DELETE the row
    if (existing?.id) {
      const { error } = await supabase
        .from('availability')
        .delete()
        .eq('id', existing.id)
      if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    }
  } else if (existing?.id) {
    // UPDATE
    const { error } = await supabase
      .from('availability')
      .update({
        response,
        updated_by:    captainPlayerId,
        update_source: 'captain',
      })
      .eq('id', existing.id)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  } else {
    // INSERT
    const { error } = await supabase
      .from('availability')
      .insert({
        player_id,
        booking_id,
        response,
        updated_by:    captainPlayerId,
        update_source: 'captain',
      })
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  }

  // ── Always write audit row (even for deletes) ─────────────────
  const { error: auditError } = await supabase
    .from('availability_audit')
    .insert({
      player_id,
      booking_id,
      old_response:  oldResponse,
      new_response:  response ?? 'CLEARED',
      updated_by:    captainPlayerId,
      update_source: 'captain',
      note:          note ?? null,
    })

  if (auditError) {
    // Audit failure should not block the main operation — log but continue
    console.error('Audit log insert failed:', auditError.message)
  }

  return NextResponse.json({ success: true, old_response: oldResponse, new_response: response })
}

// GET /api/captain/availability?booking_id=xxx
// Returns audit log for a specific booking — captain/admin only
export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions)
  const user    = session?.user as any

  if (!user?.isCaptain && !user?.isAdmin) {
    return NextResponse.json({ error: 'Unauthorised' }, { status: 403 })
  }

  const { searchParams } = new URL(req.url)
  const booking_id = searchParams.get('booking_id')
  const player_id  = searchParams.get('player_id')

  const supabase = createServiceClient()
  let query = supabase
    .from('availability_audit')
    .select(`
      id, created_at, old_response, new_response, update_source, note,
      player:players!availability_audit_player_id_fkey(id, name),
      updated_by_player:players!availability_audit_updated_by_fkey(id, name)
    `)
    .order('created_at', { ascending: false })
    .limit(100)

  if (booking_id) query = query.eq('booking_id', booking_id)
  if (player_id)  query = query.eq('player_id',  player_id)

  const { data, error } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ audit: data ?? [] })
}
