// app/api/players/[id]/route.ts
// GET /api/players/[id]  — fetch single player (player can only fetch their own; admin can fetch any)
// PATCH /api/players/[id] — player self-service update (restricted fields only)

import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { createServiceClient } from '@/lib/supabase'
import { RATE_LIMITS, rateLimit } from '@/lib/rateLimit'

const PLAYER_EDITABLE_FIELDS = new Set([
  'whatsapp',
  'dob',
  'jersey_name',
  'jersey_number',
  'blood_group',
  'primary_skill',
  'secondary_skill',
  'cricheroes_url',
  'photo_url',
])

export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const session = await getServerSession(authOptions)
  const user    = session?.user as any

  if (!user?.playerId && !user?.isAdmin) {
    return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })
  }

  // Players can only fetch their own profile; admins can fetch any
  if (!user.isAdmin && user.playerId !== params.id) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const supabase = createServiceClient()
  const { data, error } = await supabase
    .from('players')
    .select(`
      id, name, gmail_id, whatsapp, dob, jersey_name, jersey_number,
      blood_group, primary_skill, secondary_skill, cricheroes_url, photo_url,
      wallet_balance, inducted_on, is_captain, status, active
    `)
    .eq('id', params.id)
    .single()

  if (error || !data) return NextResponse.json({ error: 'Player not found' }, { status: 404 })
  return NextResponse.json({ player: data })
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const session = await getServerSession(authOptions)
  const user    = session?.user as any

  if (!user?.playerId && !user?.isAdmin) {
    return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })
  }

  // Players can only update their own profile
  if (!user.isAdmin && user.playerId !== params.id) {
  return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
}

  const limited = await rateLimit(req, RATE_LIMITS.playerWrite, user.playerId)
  if (limited) return limited

  const body = await req.json()

  // If not admin, strip any fields not in the allowed set
  const updates: Record<string, any> = {}
  for (const [key, value] of Object.entries(body)) {
    if (user.isAdmin || PLAYER_EDITABLE_FIELDS.has(key)) {
      updates[key] = value
    }
  }

  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: 'No valid fields to update' }, { status: 400 })
  }

  const supabase = createServiceClient()
  const { data, error } = await supabase
    .from('players')
    .update(updates)
    .eq('id', params.id)
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ player: data })
}
