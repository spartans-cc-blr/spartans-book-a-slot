// POST /api/opponents/merge — fold one opponent into another. Captain / GC / wrangler / admin.
// See .claude/rules/features/opponent-identity.md.
//
// Moves every alias and booking from source_id to target_id, keeps the union of manager-set fields
// on the target, deletes the source, then mirrors the result into the analytics DB (best-effort).
// There is no undo: a wrong merge is fixed by re-creating the opponent and re-linking its spelling.

import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { createServiceClient } from '@/lib/supabase'
import { rateLimit, RATE_LIMITS } from '@/lib/rateLimit'
import { opponentMergeSchema } from '@/lib/schemas'
import { mergeOpponents, OpponentMergeError } from '@/lib/opponents'
import { mirrorOpponent, dropOpponentRef } from '@/lib/opponentMirror'
import { createAnalyticsClient } from '@/lib/playerIdentityResolution'

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

  const parsed = opponentMergeSchema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'Invalid input' }, { status: 400 })

  const supabase = createServiceClient()
  try {
    const result = await mergeOpponents(supabase, parsed.data.source_id, parsed.data.target_id, user.playerId ?? null)
    const analytics = createAnalyticsClient()
    await dropOpponentRef(analytics, parsed.data.source_id)
    await mirrorOpponent(supabase, analytics, parsed.data.target_id)
    return NextResponse.json({ ok: true, ...result })
  } catch (e: any) {
    if (e instanceof OpponentMergeError) return NextResponse.json({ error: e.message }, { status: 400 })
    return NextResponse.json({ error: e?.message ?? 'Failed to merge' }, { status: 500 })
  }
}
