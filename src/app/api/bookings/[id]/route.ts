import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { createServiceClient } from '@/lib/supabase'

export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const session = await getServerSession(authOptions)
  const user = session?.user as any
  if (!user?.isAdmin) return NextResponse.json({ error: 'Unauthorised' }, { status: 403 })

  const supabase = createServiceClient()

  const { data, error } = await supabase
    .from('bookings')
    .select(`
      *,
      tournament:tournaments!bookings_tournament_id_fkey(
        *, captains!tournaments_captain_id_fkey(id, name, players(cricheroes_url))
      )
    `)
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
const user = session?.user as any
if (!user?.isAdmin) return NextResponse.json({ error: 'Unauthorised' }, { status: 403 })

  const body = await req.json()

  // vibe-security: strip captain_id — captain is always derived from tournament
  const { captain_id: _dropped, ...safeUpdates } = body

  // match_fee_override is admin-only — strip it from non-admin requests
  //const user = session.user as any
  if (!user?.isAdmin && 'match_fee_override' in safeUpdates) {
    delete safeUpdates.match_fee_override
  }

  const supabase = createServiceClient()

  const { data: existing } = await supabase
  .from('bookings')
  .select('game_date, slot_time')
  .eq('id', params.id)
  .single()

  const dateOrSlotChanged =
    (safeUpdates.game_date && safeUpdates.game_date !== existing?.game_date) ||
    (safeUpdates.slot_time && safeUpdates.slot_time !== existing?.slot_time)

  const { data, error } = await supabase
    .from('bookings')
    .update({ ...safeUpdates, updated_at: new Date().toISOString() })
    .eq('id', params.id)
    .select(`
      *,
      tournament:tournaments!bookings_tournament_id_fkey(
        *, captains!tournaments_captain_id_fkey(id, name, players(cricheroes_url))
      )
    `)
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
const user = session?.user as any
if (!user?.isAdmin) return NextResponse.json({ error: 'Unauthorised' }, { status: 403 })

  const supabase = createServiceClient()

  const { error } = await supabase
    .from('bookings')
    .update({ status: 'cancelled', updated_at: new Date().toISOString() })
    .eq('id', params.id)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ success: true })
}
