import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { createServiceClient } from '@/lib/supabase'

// POST /api/squad/announce — captain announces a GC-approved squad
export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  const user = session?.user as any
  if (!user?.playerId) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
  if (!user?.isCaptain && !user?.isAdmin) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { booking_id } = await req.json()
  if (!booking_id) return NextResponse.json({ error: 'booking_id required' }, { status: 400 })

  const supabase = createServiceClient()

  // Verify squad is in approved state before allowing announcement
  const { data: rows } = await supabase
    .from('squad')
    .select('status')
    .eq('booking_id', booking_id)
    .limit(1)

  if (!rows?.length || rows[0].status !== 'approved')
    return NextResponse.json({ error: 'Squad not yet approved by GC' }, { status: 400 })

  const { error } = await supabase
    .from('squad')
    .update({ status: 'announced' })
    .eq('booking_id', booking_id)
    .eq('status', 'approved')

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}