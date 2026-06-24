import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { createServiceClient } from '@/lib/supabase'
import { NextResponse } from 'next/server'

async function requireGC() {
  const session = await getServerSession(authOptions)
  const user = session?.user as any
  if (!user?.isGC && !user?.isAdmin)
    return { guard: NextResponse.json({ error: 'Unauthorised' }, { status: 403 }), user: null }
  return { guard: null, user }
}

export async function GET(req: Request) {
  const { guard } = await requireGC()
  if (guard) return guard
  const { searchParams } = new URL(req.url)
  const campaignId = searchParams.get('campaign_id')
  if (!campaignId) return NextResponse.json({ error: 'Missing campaign_id' }, { status: 400 })
  const db = createServiceClient()
  const { data, error } = await db
    .from('feedback_claims')
    .select(`
      player_id, claimed_at,
      claimer:players!claimed_by(id, name)
    `)
    .eq('campaign_id', campaignId)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}

export async function POST(req: Request) {
  const { guard, user } = await requireGC()
  if (guard) return guard
  const { campaign_id, player_id } = await req.json()
  if (!campaign_id || !player_id)
    return NextResponse.json({ error: 'Missing fields' }, { status: 400 })
  const db = createServiceClient()
  const { data, error } = await db
    .from('feedback_claims')
    .upsert(
      { campaign_id, player_id, claimed_by: user!.playerId },
      { onConflict: 'campaign_id,player_id', ignoreDuplicates: true }
    )
    .select()
    .single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}

export async function DELETE(req: Request) {
  const { guard, user } = await requireGC()
  if (guard) return guard
  const { campaign_id, player_id } = await req.json()
  const db = createServiceClient()
  let query = db
    .from('feedback_claims')
    .delete()
    .eq('campaign_id', campaign_id)
    .eq('player_id', player_id)
  if (!user!.isAdmin) {
    query = query.eq('claimed_by', user!.playerId)
  }
  const { error } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}