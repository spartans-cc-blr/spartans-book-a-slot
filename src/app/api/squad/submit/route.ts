import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { createServiceClient } from '@/lib/supabase'

// POST /api/squad/submit — captain submits draft to GC for review
export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  const user = session?.user as any
  if (!user?.playerId) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
  if (!user?.isCaptain && !user?.isAdmin) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { booking_id } = await req.json()
  if (!booking_id) return NextResponse.json({ error: 'booking_id required' }, { status: 400 })

  const supabase = createServiceClient()

  // Fetch the current draft rows to validate roles before submitting
  const { data: draftRows } = await supabase
    .from('squad')
    .select('player_id, is_captain, is_vc, is_wk')
    .eq('booking_id', booking_id)
    .eq('status', 'draft')

  if (!draftRows?.length)
    return NextResponse.json({ error: 'No draft squad found for this booking' }, { status: 400 })

  const hasCaptain = draftRows.some(r => r.is_captain)
  const hasVC      = draftRows.some(r => r.is_vc)
  const hasWK      = draftRows.some(r => r.is_wk)

  if (!hasCaptain)
    return NextResponse.json({ error: 'Assign a match captain (C) before submitting for GC review' }, { status: 400 })
  if (!hasVC)
    return NextResponse.json({ error: 'Assign a vice captain (VC) before submitting for GC review' }, { status: 400 })
  if (!hasWK)
    return NextResponse.json({ error: 'Assign a wicket keeper (WK) before submitting for GC review' }, { status: 400 })

  const { error } = await supabase
    .from('squad')
    .update({ status: 'pending_approval' })
    .eq('booking_id', booking_id)
    .eq('status', 'draft')

 // Clear any previous GC return note — fresh submission
  await supabase
   .from('bookings')
   .update({ gc_return_note: null })
   .eq('id', booking_id)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}