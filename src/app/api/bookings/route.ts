import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { createServiceClient } from '@/lib/supabase'
import { validateBooking } from '@/lib/validation'
import type { CreateBookingRequest } from '@/types'



// ── GET /api/bookings ─────────────────────────────────────────────
// Admin only. Returns all bookings with captain and tournament joined.
export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })

  const supabase = createServiceClient()
  const { searchParams } = req.nextUrl
  const status = searchParams.get('status')
  const from   = searchParams.get('from')
  const to     = searchParams.get('to')

  let query = supabase
    .from('bookings')
    .select(`*, captain:captains(*), tournament:tournaments(*)`)
    .order('game_date', { ascending: true })
    .order('slot_time', { ascending: true })

  if (status) query = query.eq('status', status)
  if (from)   query = query.gte('game_date', from)
  if (to)     query = query.lte('game_date', to)

  const { data, error } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ bookings: data })
}

// ── POST /api/bookings ────────────────────────────────────────────
// Admin only. Creates a confirmed booking after running all 5 rule checks.
export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })

  const body: CreateBookingRequest = await req.json()
  const { game_date, slot_time, format, captain_id, tournament_id, venue, notes, opponent_name, match_id, cricheroes_url } = body as any
  
  // Basic presence check
  if (!game_date || !slot_time || !format || !captain_id || !tournament_id) {
    return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
  }

  const supabase = createServiceClient()

  // Fetch existing bookings and names for validation messages
  const [{ data: existing }, { data: captain }, { data: tournament }] =
    await Promise.all([
      supabase.from('bookings').select('*').neq('status', 'cancelled'),
      supabase.from('captains').select('name').eq('id', captain_id).single(),
      supabase.from('tournaments').select('name').eq('id', tournament_id).single(),
    ])

  const result = validateBooking(
    body,
    existing ?? [],
    captain?.name ?? 'This captain',
    tournament?.name ?? 'This tournament'
  )

  if (!result.valid) {
    return NextResponse.json({ errors: result.errors }, { status: 422 })
  }

  const { body: rawBody } = req  // already parsed above

  const { data, error } = await supabase
    .from('bookings')
    .insert({
      game_date, slot_time, format,
      captain_id, tournament_id,
      venue:          venue ?? null,
      notes:          notes ?? null,
      status:         'confirmed',
      opponent_name:  opponent_name ?? null,
      match_id:       match_id ?? null,
      cricheroes_url: cricheroes_url ?? null,
    })
    .select(`*, captain:captains(*), tournament:tournaments(*)`)
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ booking: data }, { status: 201 })
}
