import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { createServiceClient } from '@/lib/supabase'

// ── PATCH /api/bookings/[id] ──────────────────────────────────────
// Update status (cancel, restore) or edit fields.
export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })

  const body = await req.json()
  const supabase = createServiceClient()

  const { data, error } = await supabase
    .from('bookings')
    .update({ ...body, updated_at: new Date().toISOString() })
    .eq('id', params.id)
    .select(`*, captain:captains(*), tournament:tournaments(*)`)
    .single()

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
