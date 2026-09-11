// POST /api/opponents/link — link a raw opponent_name spelling to a
// canonical opponent. Captain / GC / wrangler / admin. See
// features/team-stats.md §5.
//
// Writes the spelling to opponent_aliases (so every *future* booking typed
// the same way resolves on save — src/lib/opponents.ts) and back-fills
// bookings.opponent_id on every confirmed booking currently carrying that
// spelling with no opponent yet. Idempotent: a spelling already aliased to
// this opponent is a no-op; one aliased to a *different* opponent is a 409
// (fix the master list first, never silently re-point history).

import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { createServiceClient } from '@/lib/supabase'
import { rateLimit, RATE_LIMITS } from '@/lib/rateLimit'
import { opponentLinkSchema } from '@/lib/schemas'
import { linkSpellingToOpponent, AliasConflictError } from '@/lib/opponents'

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  const user = session?.user as any
  if (!user) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })
  if (user.playerStatus === 'expelled') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  if (!user.isCaptain && !user.isGC && !user.isWrangler && !user.isAdmin) {
    return NextResponse.json({ error: 'Unauthorised' }, { status: 403 })
  }
  const limited = await rateLimit(req, RATE_LIMITS.captainWrite, user.playerId ?? user.email)
  if (limited) return limited

  const parsed = opponentLinkSchema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'Invalid input' }, { status: 400 })

  const supabase = createServiceClient()
  const { data: opp } = await supabase.from('opponents').select('id').eq('id', parsed.data.opponent_id).maybeSingle()
  if (!opp) return NextResponse.json({ error: 'Opponent not found' }, { status: 404 })

  try {
    const linked = await linkSpellingToOpponent(supabase, parsed.data.opponent_id, parsed.data.name, user.playerId ?? null)
    return NextResponse.json({ ok: true, linked_bookings: linked })
  } catch (e: any) {
    if (e instanceof AliasConflictError) return NextResponse.json({ error: e.message }, { status: 409 })
    return NextResponse.json({ error: e?.message ?? 'Failed to link' }, { status: 500 })
  }
}
