import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { createServiceClient } from '@/lib/supabase'

// GET /api/availability/weekend?booking_ids=id1,id2,...
// Returns full availability breakdown for a set of booking IDs
// Requires captain or admin session

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions)
  const user    = session?.user as any

  if (!user?.isCaptain && !user?.isAdmin) {
    return NextResponse.json({ error: 'Unauthorised' }, { status: 403 })
  }

  const { searchParams } = new URL(req.url)
  const rawIds = searchParams.get('booking_ids')
  if (!rawIds) return NextResponse.json({ availability: [] })

  const bookingIds = rawIds.split(',').filter(Boolean)
  if (bookingIds.length === 0) return NextResponse.json({ availability: [] })

  const supabase = createServiceClient()

  // Fetch availability with player details joined
  const { data, error } = await supabase
    .from('availability')
    .select(`
      player_id,
      booking_id,
      response,
      player:players(id, name, jersey_name, jersey_number, wallet_balance, primary_skill, is_captain)
    `)
    .in('booking_id', bookingIds)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ availability: data ?? [] })
}
