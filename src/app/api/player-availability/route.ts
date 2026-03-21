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

  if (!booking_id || !['Y', 'N', 'O', 'E', 'L'].includes(response)) {
    return NextResponse.json({ error: 'Invalid request — booking_id and valid response required' }, { status: 400 })
  }

  const supabase = createServiceClient()

  // Check if a row already exists for this player + booking
  const { data: existing } = await supabase
    .from('availability')
    .select('id')
    .eq('player_id', player.playerId)
    .eq('booking_id', booking_id)
    .single()

  let result

  if (existing?.id) {
    // Row exists — UPDATE it
    const { data, error } = await supabase
      .from('availability')
      .update({ response })
      .eq('id', existing.id)
      .select()
      .single()
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    result = data
  } else {
    // No row — INSERT
    const { data, error } = await supabase
      .from('availability')
      .insert({ player_id: player.playerId, booking_id, response })
      .select()
      .single()
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    result = data
  }

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
  return NextResponse.json({ success: true })
}
