import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { createServiceClient } from '@/lib/supabase'

type OrderStatus = 'pending' | 'submitted' | 'delivered' | 'received' | 'cancelled'

const ALL_STATUSES: OrderStatus[] = ['pending', 'submitted', 'delivered', 'received', 'cancelled']

// Allowed transitions per role: [from] → [to]
const PLAYER_ALLOWED_TRANSITIONS: Partial<Record<OrderStatus, OrderStatus[]>> = {
  pending:   ['cancelled'],
  delivered: ['received'],
}

const ADMIN_GC_ALLOWED_TRANSITIONS: Partial<Record<OrderStatus, OrderStatus[]>> = {
  pending:   ['submitted', 'cancelled'],
  submitted: ['delivered', 'cancelled'],
}

function isValidStatus(value: unknown): value is OrderStatus {
  return typeof value === 'string' && (ALL_STATUSES as string[]).includes(value)
}

// PATCH /api/dugout/kit-room/[id]
// Status transitions only — field allowlist enforced
export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const session = await getServerSession(authOptions)
  const user    = session?.user as any
  if (!user?.playerId) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })

  const orderId = params.id
  if (!orderId || typeof orderId !== 'string' || orderId.trim() === '') {
    return NextResponse.json({ error: 'Order ID is required' }, { status: 400 })
  }

  const body = await req.json()

  // Allowlist: only 'status' may be set through this route
  const { status: newStatus } = body

  if (!isValidStatus(newStatus)) {
    return NextResponse.json(
      { error: `status must be one of: ${ALL_STATUSES.join(', ')}` },
      { status: 400 }
    )
  }

  const isAdminOrGC = Boolean(user?.isAdmin || user?.isGC)
  const isAdmin     = Boolean(user?.isAdmin)
  const isGC        = Boolean(user?.isGC)

  const supabase = createServiceClient()

  // IDOR check: fetch the order first, confirm ownership or admin/GC access
  const { data: order, error: fetchErr } = await supabase
    .from('jersey_orders')
    .select('id, player_id, status')
    .eq('id', orderId)
    .single()

  if (fetchErr || !order) {
    return NextResponse.json({ error: 'Order not found' }, { status: 404 })
  }

  const isOwner = order.player_id === user.playerId

  if (!isOwner && !isAdminOrGC) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const currentStatus = order.status as OrderStatus

  // Determine allowed transitions based on role
  if (isOwner && !isAdminOrGC) {
    const allowed = PLAYER_ALLOWED_TRANSITIONS[currentStatus] ?? []
    if (!allowed.includes(newStatus)) {
      return NextResponse.json(
        { error: `Invalid transition: ${currentStatus} → ${newStatus}` },
        { status: 400 }
      )
    }
  } else if (isAdminOrGC) {
    const allowed = ADMIN_GC_ALLOWED_TRANSITIONS[currentStatus] ?? []
    if (!allowed.includes(newStatus)) {
      return NextResponse.json(
        { error: `Invalid transition: ${currentStatus} → ${newStatus}` },
        { status: 400 }
      )
    }
  }

  const { data: updated, error: updateErr } = await supabase
    .from('jersey_orders')
    .update({ status: newStatus })
    .eq('id', orderId)
    .select()
    .single()

  if (updateErr) {
    return NextResponse.json({ error: updateErr.message }, { status: 500 })
  }

  return NextResponse.json({ order: updated })
}