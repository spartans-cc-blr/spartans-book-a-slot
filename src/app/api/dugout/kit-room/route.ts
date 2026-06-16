import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { createServiceClient } from '@/lib/supabase'
import { rateLimit } from '@/lib/rateLimit'

const JERSEY_ORDER_RATE_LIMIT = { prefix: 'kit-room-post', limit: 3, windowSecs: 3600 }

const VALID_JERSEY_SIZES = ['XS', 'S', 'M', 'L', 'XL', 'XXL', 'XXXL'] as const
type JerseySize = typeof VALID_JERSEY_SIZES[number]

function isValidJerseySize(value: unknown): value is JerseySize {
  return typeof value === 'string' && (VALID_JERSEY_SIZES as readonly string[]).includes(value)
}

// GET /api/dugout/kit-room
// Player fetches their own jersey orders + current batch date
export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions)
  const player  = session?.user as any
  if (!player?.playerId) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })

  const supabase = createServiceClient()

  const [ordersResult, settingsResult] = await Promise.all([
    supabase
      .from('jersey_orders')
      .select('*')
      .eq('player_id', player.playerId)
      .order('created_at', { ascending: false }),
    supabase
      .from('dugout_settings')
      .select('kit_room_batch_date')
      .eq('id', 1)
      .maybeSingle(),
  ])

  if (ordersResult.error) {
    return NextResponse.json({ error: ordersResult.error.message }, { status: 500 })
  }

  return NextResponse.json({
    orders:     ordersResult.data ?? [],
    batch_date: settingsResult.data?.kit_room_batch_date ?? null,
  })
}

// POST /api/dugout/kit-room
// Player places a new jersey order
export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  const player  = session?.user as any
  if (!player?.playerId) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
  if (player?.playerStatus === 'expelled') return NextResponse.json({ error: 'Account suspended' }, { status: 403 })

  // Rate limit: 3 attempts per player per hour
  const rateLimitResponse = await rateLimit(req, JERSEY_ORDER_RATE_LIMIT, String(player.playerId))
  if (rateLimitResponse) return rateLimitResponse

  const body = await req.json()

  // Validate jersey_size from request body (the only field we accept from client)
  const { jersey_size, notes } = body

  if (!isValidJerseySize(jersey_size)) {
    return NextResponse.json(
      { error: `jersey_size is required and must be one of: ${VALID_JERSEY_SIZES.join(', ')}` },
      { status: 400 }
    )
  }

  if (notes !== undefined && notes !== null && typeof notes !== 'string') {
    return NextResponse.json({ error: 'notes must be a string' }, { status: 400 })
  }

  const sanitisedNotes: string | null = typeof notes === 'string' && notes.trim().length > 0
    ? notes.trim().slice(0, 500)
    : null

  const supabase = createServiceClient()

  // Fetch player record — jersey_name and jersey_number come from DB, never from request body
  const { data: playerRow, error: playerErr } = await supabase
    .from('players')
    .select('jersey_name, jersey_number')
    .eq('id', player.playerId)
    .single()

  if (playerErr || !playerRow) {
    return NextResponse.json({ error: 'Player not found' }, { status: 404 })
  }

  if (!playerRow.jersey_name || String(playerRow.jersey_name).trim() === '') {
    return NextResponse.json(
      { error: 'Complete your jersey details on your profile before placing an order' },
      { status: 400 }
    )
  }

  if (playerRow.jersey_number === null || playerRow.jersey_number === undefined) {
    return NextResponse.json(
      { error: 'Complete your jersey details on your profile before placing an order' },
      { status: 400 }
    )
  }

  // Check for an existing active order
  const { data: activeOrder } = await supabase
    .from('jersey_orders')
    .select('id, status')
    .eq('player_id', player.playerId)
    .in('status', ['pending', 'submitted', 'delivered'])
    .maybeSingle()

  if (activeOrder) {
    return NextResponse.json({ error: 'You already have an active order' }, { status: 409 })
  }

  const { data: order, error: insertErr } = await supabase
    .from('jersey_orders')
    .insert({
      player_id:     player.playerId,
      jersey_name:   playerRow.jersey_name,
      jersey_number: playerRow.jersey_number,
      jersey_size,
      notes:         sanitisedNotes,
      status:        'pending',
    })
    .select()
    .single()

  if (insertErr) {
    return NextResponse.json({ error: insertErr.message }, { status: 500 })
  }

  return NextResponse.json({ order }, { status: 201 })
}
