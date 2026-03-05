import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase'

export async function GET() {
  const supabase = createServiceClient()
  const { data, error } = await supabase
    .from('captains')
    .select('*')
    .eq('active', true)
    .order('name')
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ captains: data })
}

export async function POST(req: NextRequest) {
  const supabase = createServiceClient()
  const body = await req.json()
  const { data, error } = await supabase
    .from('captains')
    .insert({ name: body.name })
    .select()
    .single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ captain: data }, { status: 201 })
}
