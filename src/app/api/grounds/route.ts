import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { createServiceClient } from '@/lib/supabase'
import type { PitchType } from '@/types'

const PITCH_TYPES: PitchType[] = ['Matted', 'Astro', 'Turf']

// Absent/null/'' means "not set" (a new ground doesn't have to be
// classified up front — see the migration's own backfill note); anything
// else must be one of PITCH_TYPES — never trusts the client further than
// that, so an invalid value 400s here rather than hitting the DB's own
// CHECK constraint and surfacing a raw 500.
function isValidPitchType(v: unknown): v is PitchType | null | '' | undefined {
  return v === undefined || v === null || v === '' || (typeof v === 'string' && (PITCH_TYPES as string[]).includes(v))
}

async function requireWranglerOrAdmin() {
  const session = await getServerSession(authOptions)
  const user = session?.user as any
  if (!user?.isWrangler && !user?.isAdmin) return NextResponse.json({ error: 'Unauthorised' }, { status: 403 })
  return null
}

async function requireGCOrAdmin() {
  const session = await getServerSession(authOptions)
  const user = session?.user as any
  if (!user?.isGC && !user?.isAdmin) return NextResponse.json({ error: 'Unauthorised' }, { status: 403 })
  return null
}

export async function GET() {
  // Public — grounds are displayed on public fixtures cards
  const supabase = createServiceClient()
  const { data, error } = await supabase
    .from('grounds')
    .select('id, name, maps_url, hospital_url, pitch_type')
    .order('name', { ascending: true })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ grounds: data ?? [] })
}

export async function POST(request: Request) {
  const deny = await requireGCOrAdmin()
  if (deny) return deny
  const supabase = createServiceClient()
  const body = await request.json()
  const { name, maps_url, hospital_url, pitch_type } = body
  if (!name || !maps_url || !hospital_url) {
    return NextResponse.json({ error: 'name, maps_url and hospital_url are required' }, { status: 400 })
  }
  if (!isValidPitchType(pitch_type)) {
    return NextResponse.json({ error: 'pitch_type must be Matted, Astro or Turf' }, { status: 400 })
  }
  const { data, error } = await supabase
    .from('grounds')
    .insert({ name, maps_url, hospital_url, pitch_type: pitch_type || null })
    .select()
    .single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ground: data })
}

export async function PATCH(request: Request) {
  const deny = await requireWranglerOrAdmin()
  if (deny) return deny
  const supabase = createServiceClient()
  const body = await request.json()
  const { id, ...updates } = body
  if (!id) return NextResponse.json({ error: 'id is required' }, { status: 400 })
  if ('pitch_type' in updates) {
    if (!isValidPitchType(updates.pitch_type)) {
      return NextResponse.json({ error: 'pitch_type must be Matted, Astro or Turf' }, { status: 400 })
    }
    updates.pitch_type = updates.pitch_type || null
  }
  const { data, error } = await supabase
    .from('grounds')
    .update(updates)
    .eq('id', id)
    .select()
    .single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ground: data })
}
