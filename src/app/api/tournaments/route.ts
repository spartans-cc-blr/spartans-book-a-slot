import { NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase'

export async function GET() {
  const supabase = createServiceClient()
  const { data, error } = await supabase
    .from('tournaments')
    .select('id, name, organiser_name, organiser_contact, ball_type, ground_id, active, created_at')
    .order('name', { ascending: true })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ tournaments: data ?? [] })
}

export async function POST(request: Request) {
  const supabase = createServiceClient()
  const body = await request.json()
  const { name, organiser_name, organiser_contact, ball_type = 'red', ground_id } = body

  if (!name) return NextResponse.json({ error: 'name is required' }, { status: 400 })

  const { data, error } = await supabase
    .from('tournaments')
    .insert({
      name,
      organiser_name: organiser_name || null,
      organiser_contact: organiser_contact || null,
      ball_type,
      ground_id: ground_id || null,
      active: true,
    })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ tournament: data })
}

export async function PATCH(request: Request) {
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
