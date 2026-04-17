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
  // Admin only — full player list with wallet balances
  const deny = await requireAdmin()
  if (deny) return deny
  const supabase = createServiceClient()
  const { data, error } = await supabase
    .from('players')
    .select(`*, fee_exemptions(id, reason, start_date, end_date, notes)`)
    .order('name', { ascending: true })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ players: data ?? [] })
}

export async function POST(request: Request) {
  const deny = await requireAdmin()
  if (deny) return deny
  const supabase = createServiceClient()
  const body = await request.json()
  const { name, gmail_id, whatsapp, dob, jersey_name, jersey_number,
    blood_group, primary_skill, secondary_skill, referred_by,
    inducted_on, wallet_balance, cricheroes_url } = body
  if (!name) return NextResponse.json({ error: 'name is required' }, { status: 400 })
  const { data, error } = await supabase
    .from('players')
    .insert({
      name,
      gmail_id: gmail_id || null,
      whatsapp: whatsapp || null,
      dob: dob || null,
      jersey_name: jersey_name || null,
      jersey_number: jersey_number || null,
      blood_group: blood_group || null,
      primary_skill: primary_skill || null,
      secondary_skill: secondary_skill || null,
      referred_by: referred_by || null,
      inducted_on: inducted_on || null,
      wallet_balance: wallet_balance ?? 0,
      cricheroes_url: cricheroes_url || null,
      active: true,
      is_captain: false,
    })
    .select()
    .single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ player: data })
}

// new
const PLAYER_COLUMNS = new Set([
  'name', 'gmail_id', 'whatsapp', 'dob', 'jersey_name', 'jersey_number',
  'blood_group', 'primary_skill', 'secondary_skill', 'cricheroes_url',
  'photo_url', 'wallet_balance', 'inducted_on', 'referred_by',
  'is_captain', 'is_gc', 'status', 'active', 'dues_override',
])

export async function PATCH(request: Request) {
  const deny = await requireAdmin()
  if (deny) return deny
  const supabase = createServiceClient()
  const body = await request.json()
  const { id, ...rest } = body
  if (!id) return NextResponse.json({ error: 'id is required' }, { status: 400 })

  // Strip join data (fee_exemptions etc.) — only real columns pass through
  const updates: Record<string, any> = {}
  for (const [key, value] of Object.entries(rest)) {
    if (PLAYER_COLUMNS.has(key) && value !== undefined) {
      updates[key] = value
    }
  }

  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: 'No valid fields to update' }, { status: 400 })
  }

  const { data, error } = await supabase
    .from('players')
    .update(updates)
    .eq('id', id)
    .select()
    .single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ player: data })
}
