import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { createServiceClient } from '@/lib/supabase'
import { RATE_LIMITS, rateLimit } from '@/lib/rateLimit'

async function requireCaptain() {
  const session = await getServerSession(authOptions)
  const user = session?.user as any
  if (!user?.playerId) return { error: NextResponse.json({ error: 'Not authenticated' }, { status: 401 }), player: null }
  if (!user?.isCaptain && !user?.isAdmin) return { error: NextResponse.json({ error: 'Forbidden' }, { status: 403 }), player: null }
  return { error: null, player: user }
}

// GET /api/squad?booking_id=xxx
export async function GET(req: NextRequest) {
  const bookingId = req.nextUrl.searchParams.get('booking_id')
  if (!bookingId) return NextResponse.json({ error: 'booking_id required' }, { status: 400 })

  const { error: authErr } = await requireCaptain()

  const supabase = createServiceClient()
  const query = supabase
    .from('squad')
    .select('player_id, status, is_captain, is_vc, is_wk, players(id, name, primary_skill, cricheroes_url)')
    .eq('booking_id', bookingId)

  // Non-captains only see announced rows
  if (authErr) {
    query.eq('status', 'announced')
  }

  const { data, error } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ squad: data })
}

// POST /api/squad — save draft selection with roles
export async function POST(req: NextRequest) {
    // After
  const { error: authErr, player } = await requireCaptain()
  if (authErr) return authErr

  const limited = await rateLimit(req, RATE_LIMITS.captainWrite, player!.playerId)
  if (limited) return limited

  const { booking_id, player_ids, roles } = await req.json()
  // player_ids: string[]
  // roles: { captain: string | null, vc: string | null, wk: string[] }

  if (!booking_id || !Array.isArray(player_ids))
    return NextResponse.json({ error: 'Invalid body' }, { status: 400 })

  // Hard cap enforced server-side — never trust client count
  if (player_ids.length > 12)
    return NextResponse.json({ error: 'Squad cannot exceed 12 players' }, { status: 400 })

  // Validate roles reference only players in the squad
  const captainId: string | null = roles?.captain ?? null
  const vcId:      string | null = roles?.vc ?? null
  const wkIds:     string[]      = Array.isArray(roles?.wk) ? roles.wk : []

  if (captainId && !player_ids.includes(captainId))
    return NextResponse.json({ error: 'Captain must be in the squad' }, { status: 400 })
  if (vcId && !player_ids.includes(vcId))
    return NextResponse.json({ error: 'Vice captain must be in the squad' }, { status: 400 })
  for (const wkId of wkIds) {
    if (!player_ids.includes(wkId))
      return NextResponse.json({ error: 'Wicket keeper must be in the squad' }, { status: 400 })
  }

  const supabase = createServiceClient()

  // Delete all existing rows for this booking regardless of status,
  // then re-insert fresh. This handles edits to announced squads
  // without hitting the (player_id, booking_id) unique constraint.
  await supabase.from('squad')
    .delete()
    .eq('booking_id', booking_id)

  if (player_ids.length > 0) {
    const rows = player_ids.map((pid: string) => ({
      booking_id,
      player_id:  pid,
      status:     'draft',
      is_captain: pid === captainId,
      is_vc:      pid === vcId,
      is_wk:      wkIds.includes(pid),
    }))
    const { error } = await supabase.from('squad').insert(rows)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ ok: true })
}
