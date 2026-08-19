import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { createServiceClient } from '@/lib/supabase'

async function requireAdmin() {
  const session = await getServerSession(authOptions)
  const user = session?.user as any
  if (!user?.isAdmin) return NextResponse.json({ error: 'Unauthorised' }, { status: 403 })
  return null
}

export async function GET(req: NextRequest) {
  // Public — needed by booking form dropdowns and admin pages
  const supabase = createServiceClient()
  const { searchParams } = new URL(req.url)
  const showAll = searchParams.get('all') === 'true'
  let query = supabase
    .from('captains')
    .select('id, name, active, player_id, created_at, players(id, name, cricheroes_url, whatsapp, is_captain)')
    .order('name')
  if (!showAll) query = query.eq('active', true)
  const { data, error } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ captains: data })
}

export async function POST(req: NextRequest) {
  const deny = await requireAdmin()
  if (deny) return deny
  const supabase = createServiceClient()
  const body = await req.json()
  if (!body.name?.trim()) {
    return NextResponse.json({ error: 'name is required' }, { status: 400 })
  }
  // vibe-security: verify the linked player exists and is flagged as captain
  if (body.player_id) {
    const { data: player } = await supabase
      .from('players')
      .select('id, is_captain')
      .eq('id', body.player_id)
      .single()
    if (!player) {
      return NextResponse.json({ error: 'Player not found' }, { status: 400 })
    }
    if (!player.is_captain) {
      return NextResponse.json(
        { error: 'Player is not flagged as captain in the Players directory' },
        { status: 400 }
      )
    }
  }
  const { data, error } = await supabase
    .from('captains')
    .insert({ name: body.name.trim(), player_id: body.player_id ?? null, active: true })
    .select('id, name, active, player_id, created_at, players(id, name, cricheroes_url, whatsapp, is_captain)')
    .single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ captain: data }, { status: 201 })
}

export async function PATCH(req: NextRequest) {
  const deny = await requireAdmin()
  if (deny) return deny
  const supabase = createServiceClient()
  const body = await req.json()
  const { id, ...updates } = body
  if (!id) return NextResponse.json({ error: 'Missing id' }, { status: 400 })
  // vibe-security: if linking a player, verify they exist and are flagged as captain
  if (updates.player_id) {
    const { data: player } = await supabase
      .from('players')
      .select('id, is_captain')
      .eq('id', updates.player_id)
      .single()
    if (!player) {
      return NextResponse.json({ error: 'Player not found' }, { status: 400 })
    }
    if (!player.is_captain) {
      return NextResponse.json(
        { error: 'Player is not flagged as captain in the Players directory' },
        { status: 400 }
      )
    }
  }
  const { data, error } = await supabase
    .from('captains')
    .update(updates)
    .eq('id', id)
    .select('id, name, active, player_id, created_at, players(id, name, cricheroes_url, whatsapp, is_captain)')
    .single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ captain: data })
}