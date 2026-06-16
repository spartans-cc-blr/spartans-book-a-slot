import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { createServiceClient } from '@/lib/supabase'
import { rateLimit } from '@/lib/rateLimit'

const GEAR_POST_RATE_LIMIT = { prefix: 'gear-post', limit: 5, windowSecs: 3600 }

const VALID_TYPES = ['wanted', 'for_sale'] as const
type GearType = typeof VALID_TYPES[number]

const VALID_CONDITIONS = ['new', 'good', 'fair'] as const
type GearCondition = typeof VALID_CONDITIONS[number]

function isValidType(value: unknown): value is GearType {
  return typeof value === 'string' && (VALID_TYPES as readonly string[]).includes(value)
}

function isValidCondition(value: unknown): value is GearCondition {
  return typeof value === 'string' && (VALID_CONDITIONS as readonly string[]).includes(value)
}

// GET /api/dugout/gear
// Authenticated players only — expelled players blocked
// Returns all active listings joined with poster's name and cricheroes_url
// Filterable by ?type=wanted or ?type=for_sale
// Ordered by created_at DESC
// whatsapp is intentionally excluded from this response
export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions)
  const player  = session?.user as any
  if (!player?.playerId) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
  if (player?.playerStatus === 'expelled') return NextResponse.json({ error: 'Account suspended' }, { status: 403 })

  const supabase = createServiceClient()

  const typeFilter = req.nextUrl.searchParams.get('type')
  if (typeFilter !== null && !isValidType(typeFilter)) {
    return NextResponse.json(
      { error: `type filter must be one of: ${VALID_TYPES.join(', ')}` },
      { status: 400 }
    )
  }

  let query = supabase
    .from('gear_listings')
    .select(`
      id,
      type,
      condition,
      title,
      description,
      created_at,
      players!gear_listings_player_id_fkey (
        name,
        cricheroes_url
      )
    `)
    .eq('is_active', true)
    .order('created_at', { ascending: false })

  if (typeFilter) {
    query = query.eq('type', typeFilter)
  }

  const { data, error } = await query

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ listings: data ?? [] })
}

// POST /api/dugout/gear
// Authenticated players only — expelled players blocked
// Rate limit: 5 listings per player per hour
// player_id always from session — never from request body
export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  const player  = session?.user as any
  if (!player?.playerId) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
  if (player?.playerStatus === 'expelled') return NextResponse.json({ error: 'Account suspended' }, { status: 403 })

  const rateLimitResponse = await rateLimit(req, GEAR_POST_RATE_LIMIT, String(player.playerId))
  if (rateLimitResponse) return rateLimitResponse

  const body = await req.json()

  // Destructure only the fields we accept — player_id is NEVER accepted from body
  const { type, condition, title, description } = body

  // Validate type
  if (!isValidType(type)) {
    return NextResponse.json(
      { error: `type is required and must be one of: ${VALID_TYPES.join(', ')}` },
      { status: 400 }
    )
  }

  // Cross-field validation: condition required for for_sale, must be absent for wanted
  if (type === 'for_sale') {
    if (!isValidCondition(condition)) {
      return NextResponse.json(
        { error: `condition is required for for_sale listings and must be one of: ${VALID_CONDITIONS.join(', ')}` },
        { status: 400 }
      )
    }
  } else {
    // type === 'wanted'
    if (condition !== undefined && condition !== null) {
      return NextResponse.json(
        { error: 'condition must not be provided for wanted listings' },
        { status: 400 }
      )
    }
  }

  // Validate title
  if (typeof title !== 'string' || title.trim().length < 5 || title.trim().length > 100) {
    return NextResponse.json(
      { error: 'title is required and must be between 5 and 100 characters' },
      { status: 400 }
    )
  }

  // Validate description
  if (typeof description !== 'string' || description.trim().length < 10 || description.trim().length > 500) {
    return NextResponse.json(
      { error: 'description is required and must be between 10 and 500 characters' },
      { status: 400 }
    )
  }

  const supabase = createServiceClient()

  const { data: listing, error: insertErr } = await supabase
    .from('gear_listings')
    .insert({
      player_id:   player.playerId,
      type,
      condition:   type === 'for_sale' ? condition : null,
      title:       title.trim(),
      description: description.trim(),
      is_active:   true,
    })
    .select('id, type, condition, title, description, is_active, created_at')
    .single()

  if (insertErr) {
    return NextResponse.json({ error: insertErr.message }, { status: 500 })
  }

  return NextResponse.json({ listing }, { status: 201 })
}
