import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { createServiceClient } from '@/lib/supabase'

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })

  const body = await req.json()
  const { game_date, slot_time, organiser_name, organiser_phone, reserved_until, notes } = body

  if (!game_date || !slot_time || !organiser_name) {
    return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
  }

  const supabase = createServiceClient()

  const { data: existing } = await supabase
    .from('bookings')
    .select('id')
    .eq('game_date', game_date)
    .eq('slot_time', slot_time)
    .neq('status', 'cancelled')
    .maybeSingle()

  if (existing) {
    return NextResponse.json({ error: 'This slot is already booked or reserved.' }, { status: 409 })
  }

  const { data, error } = await supabase
    .from('bookings')
    .insert({
      game_date,
      slot_time,
      status:          'soft_block',
      organiser_name:  organiser_name.trim(),
      organiser_phone: organiser_phone ?? null,
      reserved_until:  reserved_until,
      notes:           notes ?? null,
      format:          null,
      captain_id:      null,
      tournament_id:   null,
      venue:           null,
      block_reason:    'Reserved pending CricHeroes match creation',
    })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ booking: data }, { status: 201 })
}
