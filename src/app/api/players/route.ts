import { NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase'

export async function POST(request: Request) {
  const supabase = createServiceClient()
  const body = await request.json()
  const { player_id, reason, start_date, end_date, notes } = body

  if (!player_id || !reason || !start_date) {
    return NextResponse.json({ error: 'player_id, reason and start_date are required' }, { status: 400 })
  }

  const { data, error } = await supabase
    .from('fee_exemptions')
    .insert({ player_id, reason, start_date, end_date: end_date || null, notes: notes || null })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ exemption: data })
}

export async function PATCH(request: Request) {
  const supabase = createServiceClient()
  const body = await request.json()
  const { id, ...updates } = body

  if (!id) return NextResponse.json({ error: 'id is required' }, { status: 400 })

  const { data, error } = await supabase
    .from('fee_exemptions')
    .update(updates)
    .eq('id', id)
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ exemption: data })
}
