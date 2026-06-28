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

export async function GET() {
  // Public — needed by booking form, fixtures page, and /schedule
  const supabase = createServiceClient()
  const { data, error } = await supabase
    .from('tournaments')
    .select('*, captains!tournaments_captain_id_fkey(id, name, players(cricheroes_url, whatsapp))')
    .order('name', { ascending: true })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ tournaments: data ?? [] })
}

export async function POST(request: Request) {
  const deny = await requireAdmin()
  if (deny) return deny
  const supabase = createServiceClient()
  const body = await request.json()
  // vibe-security: explicitly exclude vc_captain_id — deprecated, never written
  const { vc_captain_id: _dropped, ...safeBody } = body
  const {
    name, organiser_name, organiser_contact, ball_type = 'red', ground_id,
    total_league_games, cricheroes_points_table_url, match_fee, captain_id,
  } = safeBody
  if (!name?.trim()) return NextResponse.json({ error: 'name is required' }, { status: 400 })

  // vibe-security: verify captain exists and is active if provided
  if (captain_id) {
    const { data: cap } = await supabase
      .from('captains')
      .select('id, active')
      .eq('id', captain_id)
      .single()
    if (!cap) return NextResponse.json({ error: 'Captain not found' }, { status: 400 })
    if (!cap.active) return NextResponse.json({ error: 'Captain is not active' }, { status: 400 })
  }

  const { data, error } = await supabase
    .from('tournaments')
    .insert({
      name: name.trim(),
      organiser_name: organiser_name || null,
      organiser_contact: organiser_contact || null,
      ball_type,
      ground_id: ground_id || null,
      active: true,
      total_league_games: total_league_games ?? null,
      cricheroes_points_table_url: cricheroes_points_table_url || null,
      match_fee: match_fee ?? null,
      captain_id: captain_id || null,
    })
    .select('*, captains!tournaments_captain_id_fkey(id, name, players(cricheroes_url, whatsapp))')
    .single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ tournament: data })
}

export async function PATCH(request: Request) {
  const deny = await requireAdmin()
  if (deny) return deny
  const supabase = createServiceClient()
  const body = await request.json()
  // vibe-security: strip vc_captain_id — deprecated, never written
  const { id, vc_captain_id: _dropped, ...updates } = body
  if (!id) return NextResponse.json({ error: 'id is required' }, { status: 400 })

  // vibe-security: validate captain if being changed
  if (updates.captain_id) {
    const { data: cap } = await supabase
      .from('captains')
      .select('id, active')
      .eq('id', updates.captain_id)
      .single()
    if (!cap) return NextResponse.json({ error: 'Captain not found' }, { status: 400 })
    if (!cap.active) return NextResponse.json({ error: 'Captain is not active' }, { status: 400 })
  }
  // Allow explicitly setting captain_id to null (removing captain from tournament)

  const { data, error } = await supabase
    .from('tournaments')
    .update(updates)
    .eq('id', id)
    .select('*, captains!tournaments_captain_id_fkey(id, name, players(cricheroes_url, whatsapp))')
    .single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ tournament: data })
}
