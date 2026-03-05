import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { createServiceClient } from '@/lib/supabase'
import type { CreateSoftBlockRequest } from '@/types'

// ── GET /api/soft-blocks ──────────────────────────────────────────
export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })

  const supabase = createServiceClient()
  const { data, error } = await supabase
    .from('bookings')
    .select('*')
    .eq('status', 'soft_block')
    .order('game_date')

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ softBlocks: data })
}

// ── POST /api/soft-blocks ─────────────────────────────────────────
export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })

  const body: CreateSoftBlockRequest = await req.json()
  const { game_date, slot_time, block_reason, notes } = body

  if (!game_date || !slot_time || !block_reason) {
    return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
  }

  const supabase = createServiceClient()

  // Check slot isn't already taken
  const { data: existing } = await supabase
    .from('bookings')
    .select('id')
    .eq('game_date', game_date)
    .eq('slot_time', slot_time)
    .neq('status', 'cancelled')
    .single()

  if (existing) {
    return NextResponse.json(
      { error: 'This slot is already booked or reserved.' },
      { status: 422 }
    )
  }

  const { data, error } = await supabase
    .from('bookings')
    .insert({
      game_date,
      slot_time,
      block_reason,
      notes: notes ?? null,
      status: 'soft_block',
      format: null,
      captain_id: null,
      tournament_id: null,
    })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ softBlock: data }, { status: 201 })
}
