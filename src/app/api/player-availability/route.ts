// app/api/player-availability/route.ts

import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { createServiceClient } from '@/lib/supabase'

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

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  const player  = session?.user as any
  if (!player?.playerId) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
  if (player?.playerStatus === 'expelled') return NextResponse.json({ error: 'Account suspended' }, { status: 403 })

  const body = await req.json()
  const { booking_id, response } = body

  // N removed — valid responses are Y, O, E, L only
  if (!booking_id || !['Y', 'O', 'E', 'L'].includes(response)) {
    return NextResponse.json({ error: 'Invalid request — booking_id and valid response required' }, { status: 400 })
  }

  const supabase = createServiceClient()

  // Explicit SELECT then INSERT or UPDATE — avoids upsert/conflict issues
  const { data: existing } = await supabase
    .from('availability')
    .select('id, response')
    .eq('player_id', player.playerId)
    .eq('booking_id', booking_id)
    .single()

  let result

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
      .insert({ player_id: player.playerId, booking_id, response, updated_by: null, update_source: 'player' })
      .select()
      .single()
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    result = data
  }

  // Auto-reactivate — fire and forget
  supabase
    .from('players')
    .update({ active: true })
    .eq('id', player.playerId)
    .eq('active', false)
    .then(({ error }) => {
      if (error) console.error('Auto-reactivate failed:', error.message)
    })

  // Audit log — fire and forget, never blocks the response
  supabase
    .from('availability_audit')
    .insert({
      player_id:     player.playerId,
      booking_id,
      old_response:  existing?.response ?? null,
      new_response:  response,
      updated_by:    player.playerId,
      update_source: 'player',
      note:          null,
    })
    .then(({ error }) => {
      if (error) console.error('Audit log insert failed:', error.message)
    })

  return NextResponse.json({ availability: result })
}

export async function DELETE(req: NextRequest) {
  const session = await getServerSession(authOptions)
  const player  = session?.user as any
  if (!player?.playerId) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })

  const body = await req.json()
  const { booking_id } = body
  if (!booking_id) return NextResponse.json({ error: 'booking_id required' }, { status: 400 })

  const supabase = createServiceClient()
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
      old_response:  null,   // we don't fetch before delete — acceptable for audit purposes
      new_response:  'CLEARED',
      updated_by:    player.playerId,
      update_source: 'player',
      note:          null,
    })
    .then(({ error }) => {
      if (error) console.error('Audit log insert failed:', error.message)
    })

  return NextResponse.json({ success: true })
}
