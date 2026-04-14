import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { createServiceClient } from '@/lib/supabase'

// POST { player_id, override: true|false }
export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.player) {
    return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })
  }

  const { isCaptain, isGC, isAdmin } = session.player
  if (!isCaptain && !isGC && !isAdmin) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const body = await req.json()
  const { player_id, override } = body

  if (!player_id || typeof override !== 'boolean') {
    return NextResponse.json({ error: 'Invalid payload' }, { status: 400 })
  }

  const supabase = createServiceClient()

  const { error } = await supabase
    .from('players')
    .update({ dues_override: override })
    .eq('id', player_id)

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ ok: true, player_id, dues_override: override })
}