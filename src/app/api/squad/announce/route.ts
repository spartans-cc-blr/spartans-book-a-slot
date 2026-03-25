import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { createServiceClient } from '@/lib/supabase'

// POST /api/squad/announce — captain announces a GC-approved squad
// Also supports re-announcement after post-announcement edits:
// the squad goes back through draft → pending → approved → announced.
// The approved check is the gate; GC must re-approve after any edit.
export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  const user = session?.user as any
  if (!user?.playerId) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
  if (!user?.isCaptain && !user?.isAdmin) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { booking_id } = await req.json()
  if (!booking_id) return NextResponse.json({ error: 'booking_id required' }, { status: 400 })

  const supabase = createServiceClient()

  // Check that at least one row exists and is in 'approved' status
  // This gate ensures GC approval is always required — even after edits
  const { data: rows } = await supabase
    .from('squad')
    .select('status')
    .eq('booking_id', booking_id)
    .limit(1)

  if (!rows?.length)
    return NextResponse.json({ error: 'No squad found for this booking' }, { status: 404 })

  if (rows[0].status !== 'approved')
    return NextResponse.json({ error: 'Squad must be approved by GC before announcement' }, { status: 400 })

  // Flip all approved rows to announced
  const { error } = await supabase
    .from('squad')
    .update({ status: 'announced' })
    .eq('booking_id', booking_id)
    .eq('status', 'approved')

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
