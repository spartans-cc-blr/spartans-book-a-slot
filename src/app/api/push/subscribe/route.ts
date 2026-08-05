import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { createServiceClient } from '@/lib/supabase'

export async function GET() {
  const session = await getServerSession(authOptions)
  const user = session?.user as any
  if (!user?.playerId) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })

  const supabase = createServiceClient()
  const { count, error } = await supabase
    .from('push_subscriptions')
    .select('id', { count: 'exact', head: true })
    .eq('player_id', user.playerId)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ subscribed: (count ?? 0) > 0 })
}

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

export async function DELETE(req: NextRequest) {
  const session = await getServerSession(authOptions)
  const user = session?.user as any
  if (!user?.playerId) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })

  const body = await req.json().catch(() => ({}))
  const { endpoint } = body ?? {}
  if (!endpoint) return NextResponse.json({ error: 'endpoint is required' }, { status: 400 })

  const supabase = createServiceClient()

  // Scoped to the caller's own player_id — a player can only ever remove
  // their own subscription rows, never an arbitrary endpoint.
  const { error } = await supabase
    .from('push_subscriptions')
    .delete()
    .eq('player_id', user.playerId)
    .eq('endpoint', endpoint)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ ok: true })
}
