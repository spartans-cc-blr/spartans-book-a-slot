// PATCH /api/players/persona — set the caller's own nav persona preference.
// Self-only by design: no [id] param, always writes the signed-in session's
// own player row. Deliberately kept out of PATCH /api/players/[id]'s
// PLAYER_EDITABLE_FIELDS allowlist — that route lets an admin bypass the
// allowlist to edit *any* player's profile, and a nav preference should
// never be settable on someone else's account, admin or not.

import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { createServiceClient } from '@/lib/supabase'
import { RATE_LIMITS, rateLimit } from '@/lib/rateLimit'
import { isPersonaAllowed } from '@/lib/personas'

export async function PATCH(req: NextRequest) {
  const session = await getServerSession(authOptions)
  const user    = session?.user as any

  if (!user?.playerId) {
    return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })
  }

  const limited = await rateLimit(req, RATE_LIMITS.playerWrite, user.playerId)
  if (limited) return limited

  const body = await req.json()
  const persona = body?.persona

  // Never trust the client's claimed persona — re-check against this
  // session's own role flags, not against whatever the caller says.
  if (!isPersonaAllowed(persona, user)) {
    return NextResponse.json({ error: 'You do not have access to that view' }, { status: 403 })
  }

  const supabase = createServiceClient()
  const { error } = await supabase
    .from('players')
    .update({ default_persona: persona })
    .eq('id', user.playerId)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ persona })
}
