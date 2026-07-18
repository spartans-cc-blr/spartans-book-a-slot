// GET  /api/admin/cricheroes-id-backfill — list players whose cricheroes_url
//      is set but cricheroes_player_id is still null (either they saved
//      before src/lib/cricheroesId.ts's resolver existed, or before the
//      Render-microservice fallback for chshare.link links was added).
// POST /api/admin/cricheroes-id-backfill — re-resolve one player's
//      cricheroes_player_id from their already-saved cricheroes_url.
//      Called once per player by the admin page's client-paced loop —
//      never loops server-side itself, since a chshare.link resolution can
//      take up to ~36s (6s direct Vercel attempt + up to 30s Render
//      fallback), so even a handful of players sequentially could exceed
//      a single Vercel function's duration budget.

import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { createServiceClient } from '@/lib/supabase'
import { RATE_LIMITS, rateLimit } from '@/lib/rateLimit'
import { resolveCricheroesPlayerId } from '@/lib/cricheroesId'

export const maxDuration = 60

async function requireAdmin() {
  const session = await getServerSession(authOptions)
  const user = session?.user as any
  if (!user?.isAdmin) return { deny: NextResponse.json({ error: 'Unauthorised' }, { status: 403 }), user: null }
  return { deny: null, user }
}

export async function GET() {
  const { deny } = await requireAdmin()
  if (deny) return deny

  const supabase = createServiceClient()
  const { data, error } = await supabase
    .from('players')
    .select('id, name, cricheroes_url')
    .not('cricheroes_url', 'is', null)
    .is('cricheroes_player_id', null)
    .order('name', { ascending: true })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ players: data ?? [] })
}

export async function POST(req: NextRequest) {
  const { deny, user } = await requireAdmin()
  if (deny) return deny

  const limited = await rateLimit(req, RATE_LIMITS.adminWrite, user.playerId)
  if (limited) return limited

  const body = await req.json().catch(() => null)
  const playerId = body?.player_id
  if (!playerId || typeof playerId !== 'string') {
    return NextResponse.json({ error: 'player_id required' }, { status: 400 })
  }

  const supabase = createServiceClient()
  const { data: player, error: fetchErr } = await supabase
    .from('players')
    .select('id, cricheroes_url')
    .eq('id', playerId)
    .single()

  if (fetchErr || !player) return NextResponse.json({ error: 'Player not found' }, { status: 404 })
  if (!player.cricheroes_url) return NextResponse.json({ ok: true, cricheroes_player_id: null })

  const cricheroes_player_id = await resolveCricheroesPlayerId(player.cricheroes_url)

  const { error: updateErr } = await supabase
    .from('players')
    .update({ cricheroes_player_id })
    .eq('id', playerId)

  if (updateErr) return NextResponse.json({ error: updateErr.message }, { status: 500 })
  return NextResponse.json({ ok: true, cricheroes_player_id })
}
