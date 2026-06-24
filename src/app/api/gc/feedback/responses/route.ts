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
    .from('feedback_responses')
    .select(`
      id, answers, notes, collected_at,
      player:players!player_id(id, name, cricheroes_url, primary_skill),
      collector:players!collected_by_gc(id, name)
    `)
    .eq('campaign_id', campaignId)
    .order('collected_at', { ascending: true })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}

export async function POST(req: Request) {
  const { guard, user } = await requireGC()
  if (guard) return guard
  const body = await req.json()
  const { campaign_id, player_id, answers, notes } = body
  if (!campaign_id || !player_id)
    return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
  if (typeof answers !== 'object' || Array.isArray(answers) || answers === null)
    return NextResponse.json({ error: 'answers must be an object' }, { status: 400 })
  const db = createServiceClient()
  const { data: campaign } = await db
    .from('feedback_campaigns')
    .select('id, questions, closed_at')
    .eq('id', campaign_id)
    .single()
  if (!campaign) return NextResponse.json({ error: 'Campaign not found' }, { status: 404 })
  if (campaign.closed_at) return NextResponse.json({ error: 'Campaign is closed' }, { status: 409 })
  const expectedKeys = (campaign.questions as string[]).map((_, i) => String(i))
  const receivedKeys = Object.keys(answers)
  if (!expectedKeys.every(k => receivedKeys.includes(k)))
    return NextResponse.json({ error: 'Answers do not match campaign questions' }, { status: 400 })
  const { data: player } = await db
    .from('players')
    .select('id')
    .eq('id', player_id)
    .single()
  if (!player) return NextResponse.json({ error: 'Player not found' }, { status: 404 })
  const { data, error } = await db
    .from('feedback_responses')
    .insert({
      campaign_id,
      player_id,
      collected_by_gc: user!.playerId,
      answers,
      notes: notes?.trim() ?? null,
    })
    .select('id')
    .single()
  if (error?.code === '23505')
    return NextResponse.json({ error: 'Response already collected for this player' }, { status: 409 })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  await db.from('feedback_claims')
    .delete()
    .eq('campaign_id', campaign_id)
    .eq('player_id', player_id)
  return NextResponse.json(data, { status: 201 })
}