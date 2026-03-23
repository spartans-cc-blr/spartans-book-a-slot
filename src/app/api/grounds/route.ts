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
  // Public — grounds are displayed on public fixtures cards
  const supabase = createServiceClient()
  const { data, error } = await supabase
    .from('grounds')
    .select('id, name, maps_url, hospital_url')
    .order('name', { ascending: true })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ grounds: data ?? [] })
}

export async function POST(request: Request) {
  const deny = await requireAdmin()
  if (deny) return deny
  const supabase = createServiceClient()
  const body = await request.json()
  const { name, maps_url, hospital_url } = body
  if (!name || !maps_url || !hospital_url) {
    return NextResponse.json({ error: 'name, maps_url and hospital_url are required' }, { status: 400 })
  }
  const { data, error } = await supabase
    .from('grounds')
    .insert({ name, maps_url, hospital_url })
    .select()
    .single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ground: data })
}

export async function PATCH(request: Request) {
  const deny = await requireAdmin()
  if (deny) return deny
  const supabase = createServiceClient()
  const body = await request.json()
  const { id, ...updates } = body
  if (!id) return NextResponse.json({ error: 'id is required' }, { status: 400 })
  const { data, error } = await supabase
    .from('grounds')
    .update(updates)
    .eq('id', id)
    .select()
    .single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ground: data })
}
