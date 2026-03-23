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
    .select('id, name, organiser_name, organiser_contact, ball_type, ground_id, active, created_at')
    .order('name', { ascending: true })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ tournaments: data ?? [] })
}

export async function POST(request: Request) {
  const deny = await requireAdmin()
  if (deny) return deny
  const supabase = createServiceClient()
  const body = await request.json()
  const { name, organiser_name, organiser_contact, ball_type = 'red', ground_id } = body
  if (!name) return NextResponse.json({ error: 'name is required' }, { status: 400 })
  const { data, error } = await supabase
    .from('tournaments')
    .insert({ name, organiser_name: organiser_name || null, organiser_contact: organiser_contact || null, ball_type, ground_id: ground_id || null, active: true })
    .select()
    .single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ tournament: data })
}

export async function PATCH(request: Request) {
  const deny = await requireAdmin()
  if (deny) return deny
  const supabase = createServiceClient()
  const body = await request.json()
  const { id, ...updates } = body
  if (!id) return NextResponse.json({ error: 'id is required' }, { status: 400 })
  const { data, error } = await supabase
    .from('tournaments')
    .update(updates)
    .eq('id', id)
    .select()
    .single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ tournament: data })
}
