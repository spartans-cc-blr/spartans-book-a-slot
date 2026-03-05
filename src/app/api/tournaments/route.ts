import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase'

export async function GET() {
  const supabase = createServiceClient()
  const { data, error } = await supabase
    .from('tournaments')
    .select('*')
    .eq('active', true)
    .order('name')
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ tournaments: data })
}

export async function POST(req: NextRequest) {
  const supabase = createServiceClient()
  const body = await req.json()
  const { data, error } = await supabase
    .from('tournaments')
    .insert({
      name:              body.name,
      organiser_name:    body.organiser_name ?? null,
      organiser_contact: body.organiser_contact ?? null,
    })
    .select()
    .single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ tournament: data }, { status: 201 })
}
