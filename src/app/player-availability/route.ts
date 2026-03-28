import { rateLimit, RATE_LIMITS } from '@/lib/rateLimit'
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

  // Return as { booking_id: response } map for easy lookup
  const responses = Object.fromEntries((data ?? []).map(r => [r.booking_id, r.response]))
  return NextResponse.json({ responses })
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  const player  = session?.user as any
  if (!player?.playerId) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
  if (player?.playerStatus === 'expelled') return NextResponse.json({ error: 'Account suspended' }, { status: 403 })
  
  // Rate limit: 20 writes/min per player
  const limited = await rateLimit(req, RATE_LIMITS.playerWrite, player.playerId)
  if (limited) return limited  

  const { booking_id, response } = await req.json()
  if (!booking_id || !['Y','N','O','E','L'].includes(response)) {
    return NextResponse.json({ error: 'Invalid request' }, { status: 400 })
  }

  const supabase = createServiceClient()
  const { data, error } = await supabase
    .from('availability')
    .upsert({
      player_id:  player.playerId,
      booking_id,
      response,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'player_id,booking_id' })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ availability: data })
}

export async function DELETE(req: NextRequest) {
  const session = await getServerSession(authOptions)
  const player  = session?.user as any
  if (!player?.playerId) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })

  const limited = await rateLimit(req, RATE_LIMITS.playerWrite, player.playerId)
  if (limited) return limited  
  
  const { booking_id } = await req.json()
  if (!booking_id) return NextResponse.json({ error: 'booking_id required' }, { status: 400 })

  const supabase = createServiceClient()
  await supabase
    .from('availability')
    .delete()
    .eq('player_id', player.playerId)
    .eq('booking_id', booking_id)

  return NextResponse.json({ success: true })
}
