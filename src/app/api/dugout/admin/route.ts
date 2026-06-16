import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { createServiceClient } from '@/lib/supabase'

type OrderStatus = 'pending' | 'submitted' | 'delivered' | 'received'
const ALL_STATUSES: OrderStatus[] = ['pending', 'submitted', 'delivered', 'received']

// GET /api/dugout/kit-room/admin
// Admin and GC only — returns all jersey_orders joined with player name and whatsapp
// Optional: ?status=pending|submitted|delivered|received
export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions)
  const user    = session?.user as any

  if (!user?.isAdmin && !user?.isGC) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const { searchParams } = new URL(req.url)
  const statusFilter = searchParams.get('status')

  if (statusFilter !== null && !(ALL_STATUSES as string[]).includes(statusFilter)) {
    return NextResponse.json(
      { error: `status must be one of: ${ALL_STATUSES.join(', ')}` },
      { status: 400 }
    )
  }

  const supabase = createServiceClient()

  let query = supabase
    .from('jersey_orders')
    .select(`
      *,
      player:players(id, name, whatsapp)
    `)
    .order('created_at', { ascending: true })

  if (statusFilter) {
    query = query.eq('status', statusFilter)
  }

  const { data, error } = await query

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ orders: data ?? [] })
}
