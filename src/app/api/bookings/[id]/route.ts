import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { createServiceClient } from '@/lib/supabase'

export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })

  const supabase = createServiceClient()

  const { data, error } = await supabase
    .from('bookings')
    .select(`*, captain:captains(*), tournament:tournaments(*)`)
    .eq('id', params.id)
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ booking: data })
}

// ── PATCH /api/bookings/[id] ──────────────────────────────────────
// Update status (cancel, restore) or edit fields.
export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })

  const body = await req.json()

  // match_fee_override is admin-only — strip it from non-admin requests
  const user = session.user as any
  if (!user?.isAdmin && 'match_fee_override' in body) {
    delete body.match_fee_override
  }

  const supabase = createServiceClient()

  const { data: existing } = await supabase
  .from('bookings')
  .select('game_date, slot_time')
  .eq('id', params.id)
  .single()

  const dateOrSlotChanged =
    (body.game_date && body.game_date !== existing?.game_date) ||
    (body.slot_time && body.slot_time !== existing?.slot_time)

  const { data, error } = await supabase
    .from('bookings')
    .update({ ...body, updated_at: new Date().toISOString() })
    .eq('id', params.id)
    .select(`*, captain:captains(*), tournament:tournaments(*)`)
    .single()

  if (dateOrSlotChanged) {
    await supabase.from('availability').delete().eq('booking_id', params.id)
  }

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ booking: data })
}

// ── DELETE /api/bookings/[id] ─────────────────────────────────────
// Soft-deletes by setting status to 'cancelled'. Slot reopens immediately.
export async function DELETE(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })

  const supabase = createServiceClient()

  const { error } = await supabase
    .from('bookings')
    .update({ status: 'cancelled', updated_at: new Date().toISOString() })
    .eq('id', params.id)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ success: true })
}