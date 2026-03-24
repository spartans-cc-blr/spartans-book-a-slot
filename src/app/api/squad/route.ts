import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs'
import { cookies } from 'next/headers'
import { NextRequest, NextResponse } from 'next/server'

// ── Security: re-validate captain role server-side on every request ──
async function assertCaptain(supabase: ReturnType<typeof createRouteHandlerClient>) {
  const { data: { session } } = await supabase.auth.getSession()
  if (!session) return null
  const { data: player } = await supabase
    .from('players')
    .select('id, is_captain')
    .eq('gmail_id', session.user.email)
    .eq('active', true)
    .single()
  if (!player?.is_captain) return null
  return player
}

// GET /api/squad?booking_id=xxx  — returns announced squad (public) or draft (captain)
export async function GET(req: NextRequest) {
  const supabase = createRouteHandlerClient({ cookies })
  const bookingId = req.nextUrl.searchParams.get('booking_id')
  if (!bookingId) return NextResponse.json({ error: 'booking_id required' }, { status: 400 })

  const captain = await assertCaptain(supabase)

  const query = supabase
    .from('squad')
    .select('player_id, status, players(id, name, primary_skill)')
    .eq('booking_id', bookingId)

  // Non-captains only see announced squads — RLS enforces this too, double-checked here
  if (!captain) query.eq('status', 'announced')

  const { data, error } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ squad: data })
}

// POST /api/squad — upsert draft selection
export async function POST(req: NextRequest) {
  const supabase = createRouteHandlerClient({ cookies })
  const captain = await assertCaptain(supabase)
  if (!captain) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { booking_id, player_ids } = await req.json()
  if (!booking_id || !Array.isArray(player_ids))
    return NextResponse.json({ error: 'Invalid body' }, { status: 400 })

  // Hard cap enforced server-side — do not trust client count
  if (player_ids.length > 12)
    return NextResponse.json({ error: 'Squad cannot exceed 12 players' }, { status: 400 })

  // Verify this captain owns this booking
  const { data: booking } = await supabase
    .from('bookings')
    .select('captain_id')
    .eq('id', booking_id)
    .single()
  if (!booking || booking.captain_id !== captain.id)
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  // Delete existing draft rows, re-insert
  await supabase.from('squad').delete()
    .eq('booking_id', booking_id).eq('status', 'draft')

  if (player_ids.length > 0) {
    const rows = player_ids.map((pid: string) => ({
      booking_id, player_id: pid, status: 'draft',
    }))
    const { error } = await supabase.from('squad').insert(rows)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ ok: true })
}