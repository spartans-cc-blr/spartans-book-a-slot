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
// Player places a new jersey order (v2)
export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  const player  = session?.user as any
  if (!player?.playerId) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
  if (player?.playerStatus === 'expelled') return NextResponse.json({ error: 'Account suspended' }, { status: 403 })

  // Rate limit: 3 attempts per player per hour
  const rateLimitResponse = await rateLimit(req, JERSEY_ORDER_RATE_LIMIT, String(player.playerId))
  if (rateLimitResponse) return rateLimitResponse

  const body = await req.json()

  const {
  half_sleeve, full_sleeve, tracks,
  jersey_size_selected,
  tracks_size,
  jersey_name_input, update_profile_name, notes,
  } = body

  const halfSleeve        = Boolean(half_sleeve)
  const fullSleeve        = Boolean(full_sleeve)
  const addTracks         = Boolean(tracks)
  const doUpdateName      = Boolean(update_profile_name)

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

  // Validate jersey_name_input if provided
  const trimmedNameInput: string | null =
    typeof jersey_name_input === 'string' && jersey_name_input.trim().length > 0
      ? jersey_name_input.trim().slice(0, 10)
      : null

  if (
    typeof jersey_name_input === 'string' &&
    jersey_name_input.trim().length > 0 &&
    jersey_name_input.trim().length > 10
  ) {
    return NextResponse.json(
      { error: 'jersey_name_input must be 10 characters or fewer' },
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

  if (!playerRow.jersey_number || String(playerRow.jersey_number).trim() === '') {
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

  // Derive jersey_name_override: set only when input differs from profile name (case-insensitive)
  const profileName = String(playerRow.jersey_name).trim()
  const nameOverride: string | null =
    trimmedNameInput !== null &&
    trimmedNameInput.toLowerCase() !== profileName.toLowerCase()
      ? trimmedNameInput
      : null

  // If player requested profile name update and name differs, PATCH players first
  if (doUpdateName && trimmedNameInput !== null && trimmedNameInput.toLowerCase() !== profileName.toLowerCase()) {
    const { error: patchErr } = await supabase
      .from('players')
      .update({ jersey_name: trimmedNameInput })
      .eq('id', player.playerId)

    if (patchErr) {
      return NextResponse.json(
        { error: 'Failed to update profile name — order not placed' },
        { status: 500 }
      )
    }
  }

  // Derive per-item sizes
  const jerseyHalfSleeveSize: string | null = halfSleeve ? (jersey_size_selected as string) : null
  const jerseyFullSleeveSize: string | null = fullSleeve ? (jersey_size_selected as string) : null
  const tracksSize: string | null = addTracks
  ? (isValidJerseySize(tracks_size) ? tracks_size : isValidJerseySize(jersey_size_selected) ? jersey_size_selected : null)
  : null

  const { data: order, error: insertErr } = await supabase
    .from('jersey_orders')
    .insert({
      player_id:                player.playerId,
      jersey_name:              playerRow.jersey_name,
      jersey_number:            playerRow.jersey_number,
      jersey_size:              null,
      jersey_half_sleeve_size:  jerseyHalfSleeveSize,
      jersey_full_sleeve_size:  jerseyFullSleeveSize,
      tracks_size:              tracksSize,
      jersey_name_override:     nameOverride,
      notes:                    sanitisedNotes,
      status:                   'pending',
    })
    .select()
    .single()

  if (insertErr) {
    return NextResponse.json({ error: insertErr.message }, { status: 500 })
  }

  return NextResponse.json({ order }, { status: 201 })
}