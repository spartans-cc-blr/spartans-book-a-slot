import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { createServiceClient } from '@/lib/supabase'

// GET /api/dugout/gear/[id]
// Authenticated players only
// Returns single active listing with poster name and cricheroes_url
// Inactive listings return 404 — not the listing data, not 403
// whatsapp is intentionally excluded from this response
export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const session = await getServerSession(authOptions)
  const player  = session?.user as any
  if (!player?.playerId) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })

  const listingId = params.id
  if (!listingId || typeof listingId !== 'string' || listingId.trim() === '') {
    return NextResponse.json({ error: 'Listing ID is required' }, { status: 400 })
  }

  const supabase = createServiceClient()

  const { data: listing, error } = await supabase
    .from('gear_listings')
    .select(`
      id,
      type,
      condition,
      title,
      description,
      is_active,
      created_at,
      players!gear_listings_player_id_fkey (
        name,
        cricheroes_url
      )
    `)
    .eq('id', listingId)
    .single()

  if (error || !listing) {
    return NextResponse.json({ error: 'Listing not found' }, { status: 404 })
  }

  // Inactive listings must not be exposed — return 404 as if they don't exist
  if (!listing.is_active) {
    return NextResponse.json({ error: 'Listing not found' }, { status: 404 })
  }

  return NextResponse.json({ listing })
}

// PATCH /api/dugout/gear/[id]
// Deactivate listing only (is_active = false)
// Player can only deactivate their own listing
// Admin can deactivate any listing
// No other field updates allowed
// IDOR check: fetch listing first, confirm ownership or isAdmin
export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const session = await getServerSession(authOptions)
  const user    = session?.user as any
  if (!user?.playerId) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })

  const listingId = params.id
  if (!listingId || typeof listingId !== 'string' || listingId.trim() === '') {
    return NextResponse.json({ error: 'Listing ID is required' }, { status: 400 })
  }

  const body = await req.json()

  // Only is_active = false is permitted — no other field updates
  if (body.is_active !== false) {
    return NextResponse.json(
      { error: 'Only deactivating a listing (is_active: false) is permitted' },
      { status: 400 }
    )
  }

  const isAdmin = Boolean(user?.isAdmin)

  const supabase = createServiceClient()

  // IDOR check: fetch the listing first, confirm ownership or admin access
  const { data: listing, error: fetchErr } = await supabase
    .from('gear_listings')
    .select('id, player_id, is_active')
    .eq('id', listingId)
    .single()

  if (fetchErr || !listing) {
    return NextResponse.json({ error: 'Listing not found' }, { status: 404 })
  }

  const isOwner = listing.player_id === user.playerId

  if (!isOwner && !isAdmin) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const { data: updated, error: updateErr } = await supabase
    .from('gear_listings')
    .update({ is_active: false })
    .eq('id', listingId)
    .select('id, is_active')
    .single()

  if (updateErr) {
    return NextResponse.json({ error: updateErr.message }, { status: 500 })
  }

  return NextResponse.json({ listing: updated })
}
