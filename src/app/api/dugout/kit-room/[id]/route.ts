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

const VALID_JERSEY_SIZES = ['XS', 'S', 'M', 'L', 'XL', 'XXL', 'XXXL'] as const
type JerseySize = typeof VALID_JERSEY_SIZES[number]

function isValidJerseySize(value: unknown): value is JerseySize {
  return typeof value === 'string' && (VALID_JERSEY_SIZES as readonly string[]).includes(value)
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
  if (!user?.playerId && !user?.isAdmin && !user?.isGC) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })

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

// PUT /api/dugout/kit-room/[id]
// Edit an existing pending order — player only, IDOR-checked
export async function PUT(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const session = await getServerSession(authOptions)
  const user    = session?.user as any

  // Only authenticated players may use this route; admin/GC are blocked
  if (!user?.playerId) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
  if (user?.playerStatus === 'expelled') return NextResponse.json({ error: 'Account suspended' }, { status: 403 })

  const orderId = params.id
  if (!orderId || typeof orderId !== 'string' || orderId.trim() === '') {
    return NextResponse.json({ error: 'Order ID is required' }, { status: 400 })
  }

  const supabase = createServiceClient()

  // IDOR check: fetch order first, confirm it belongs to this player
  const { data: existingOrder, error: fetchErr } = await supabase
    .from('jersey_orders')
    .select('id, player_id, status, jersey_name, jersey_number')
    .eq('id', orderId)
    .single()

  if (fetchErr || !existingOrder) {
    return NextResponse.json({ error: 'Order not found' }, { status: 404 })
  }

  if (existingOrder.player_id !== user.playerId) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  if (existingOrder.status !== 'pending') {
    return NextResponse.json({ error: 'Order can only be edited while pending' }, { status: 400 })
  }

  const body = await req.json()

  const {
    half_sleeve, full_sleeve, tracks,
    jersey_size_selected,
    tracks_size,
    jersey_name_input, update_profile_name, notes,
  } = body

  const halfSleeve   = Boolean(half_sleeve)
  const fullSleeve   = Boolean(full_sleeve)
  const addTracks    = Boolean(tracks)
  const doUpdateName = Boolean(update_profile_name)

  // At least one item must be selected
  if (!halfSleeve && !fullSleeve && !addTracks) {
    return NextResponse.json(
      { error: 'Select at least one item — half sleeve, full sleeve, or tracks' },
      { status: 400 }
    )
  }

  // Size required when any sleeve is selected
  if ((halfSleeve || fullSleeve) && !isValidJerseySize(jersey_size_selected)) {
    return NextResponse.json(
      { error: `jersey_size_selected is required and must be one of: ${VALID_JERSEY_SIZES.join(', ')}` },
      { status: 400 }
    )
  }

  // tracks_size required and must be valid when tracks selected
  if (addTracks && !isValidJerseySize(tracks_size)) {
    return NextResponse.json(
      { error: `tracks_size is required and must be one of: ${VALID_JERSEY_SIZES.join(', ')}` },
      { status: 400 }
    )
  }

  // jersey_name_input: trim and cap at 10 chars server-side
  const trimmedNameInput: string | null =
    typeof jersey_name_input === 'string' && jersey_name_input.trim().length > 0
      ? jersey_name_input.trim().slice(0, 10)
      : null

  if (notes !== undefined && notes !== null && typeof notes !== 'string') {
    return NextResponse.json({ error: 'notes must be a string' }, { status: 400 })
  }

  const sanitisedNotes: string | null = typeof notes === 'string' && notes.trim().length > 0
    ? notes.trim().slice(0, 500)
    : null

  // Derive jersey_name_override: set only when input differs from order's jersey_name (case-insensitive)
  const orderName = String(existingOrder.jersey_name).trim()
  const nameOverride: string | null =
    trimmedNameInput !== null &&
    trimmedNameInput.toLowerCase() !== orderName.toLowerCase()
      ? trimmedNameInput
      : null

  // If player requested profile name update and name differs, PATCH players first
  if (doUpdateName && trimmedNameInput !== null && trimmedNameInput.toLowerCase() !== orderName.toLowerCase()) {
    const { error: patchErr } = await supabase
      .from('players')
      .update({ jersey_name: trimmedNameInput })
      .eq('id', user.playerId)

    if (patchErr) {
      return NextResponse.json(
        { error: 'Failed to update profile name — order not updated' },
        { status: 500 }
      )
    }
  }

  // Derive per-item sizes
  const jerseyHalfSleeveSize: string | null = halfSleeve ? (jersey_size_selected as string) : null
  const jerseyFullSleeveSize: string | null = fullSleeve ? (jersey_size_selected as string) : null
  const derivedTracksSize: string | null    = addTracks ? (tracks_size as string) : null

  const { data: updated, error: updateErr } = await supabase
    .from('jersey_orders')
    .update({
      jersey_size:             null,
      jersey_half_sleeve_size: jerseyHalfSleeveSize,
      jersey_full_sleeve_size: jerseyFullSleeveSize,
      tracks_size:             derivedTracksSize,
      jersey_name_override:    nameOverride,
      notes:                   sanitisedNotes,
    })
    .eq('id', orderId)
    .select()
    .single()

  if (updateErr) {
    return NextResponse.json({ error: updateErr.message }, { status: 500 })
  }

  return NextResponse.json({ order: updated })
}
