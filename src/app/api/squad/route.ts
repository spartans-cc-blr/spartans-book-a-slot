import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { createServiceClient } from '@/lib/supabase'

async function requireCaptain() {
  const session = await getServerSession(authOptions)
  const user = session?.user as any
  if (!user?.playerId) return { error: NextResponse.json({ error: 'Not authenticated' }, { status: 401 }), player: null }
  if (!user?.isCaptain && !user?.isAdmin) return { error: NextResponse.json({ error: 'Forbidden' }, { status: 403 }), player: null }
  return { error: null, player: user }
}

// GET /api/squad?booking_id=xxx
export async function GET(req: NextRequest) {
  const bookingId = req.nextUrl.searchParams.get('booking_id')
  if (!bookingId) return NextResponse.json({ error: 'booking_id required' }, { status: 400 })

  const { error: authErr, player } = await requireCaptain()

  const supabase = createServiceClient()
  const query = supabase
    .from('squad')
    .select('player_id, status, players(id, name, primary_skill)')
    .eq('booking_id', bookingId)

  // Non-captains only see announced rows — enforce even without full RLS
  if (authErr) {
    query.eq('status', 'announced')
  }

  const { data, error } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ squad: data })
}

// POST /api/squad — save draft selection
export async function POST(req: NextRequest) {
  const { error: authErr, player } = await requireCaptain()
  if (authErr) return authErr

  const { booking_id, player_ids } = await req.json()
  if (!booking_id || !Array.isArray(player_ids))
    return NextResponse.json({ error: 'Invalid body' }, { status: 400 })

  // Hard cap enforced server-side — never trust client count
  if (player_ids.length > 12)
    return NextResponse.json({ error: 'Squad cannot exceed 12 players' }, { status: 400 })

  const supabase = createServiceClient()

  // Delete existing draft rows, re-insert
  await supabase.from('squad')
    .delete()
    .eq('booking_id', booking_id)
    .eq('status', 'draft')

  if (player_ids.length > 0) {
    const rows = player_ids.map((pid: string) => ({
      booking_id,
      player_id: pid,
      status: 'draft',
    }))
    const { error } = await supabase.from('squad').insert(rows)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ ok: true })
}