import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { createServiceClient } from '@/lib/supabase'

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  const user = session?.user as any
  if (!user?.playerId) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })

  const body = await req.json()
  const { endpoint, keys } = body ?? {}

  if (!endpoint || !keys?.p256dh || !keys?.auth) {
    return NextResponse.json({ error: 'endpoint, keys.p256dh, and keys.auth are required' }, { status: 400 })
  }

  const supabase = createServiceClient()

  const { error } = await supabase
    .from('push_subscriptions')
    .upsert(
      { player_id: user.playerId, endpoint, p256dh: keys.p256dh, auth: keys.auth },
      { onConflict: 'player_id,endpoint' }
    )

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ ok: true })
}
