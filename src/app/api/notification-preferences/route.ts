// GET/PUT /api/notification-preferences — the signed-in player's own
// notification preferences ("My Notifications" on /profile).
// player_id always comes from the session, never the request. Locked
// categories (squad announced, wallet) are not storable.

import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { z } from 'zod'
import { authOptions } from '@/lib/auth'
import { createServiceClient } from '@/lib/supabase'
import { RATE_LIMITS, rateLimit } from '@/lib/rateLimit'
import { getMutedKeys, setPreferences } from '@/lib/notificationPrefsServer'
import { isValidPrefKey } from '@/lib/notificationPrefs'

const putSchema = z.object({
  changes: z.array(z.object({
    key: z.string().refine(isValidPrefKey, 'Unknown preference'),
    enabled: z.boolean(),
  }).strict()).min(1).max(60),
}).strict()

async function auth() {
  const session = await getServerSession(authOptions)
  const user = session?.user as any
  if (!user?.playerId) return { error: NextResponse.json({ error: 'Not authenticated' }, { status: 401 }) }
  if (user.playerStatus === 'expelled') return { error: NextResponse.json({ error: 'Forbidden' }, { status: 403 }) }
  return { user }
}

export async function GET(req: NextRequest) {
  const a = await auth()
  if (a.error) return a.error
  const limited = await rateLimit(req, RATE_LIMITS.publicRead, a.user.playerId)
  if (limited) return limited

  const supabase = createServiceClient()
  const muted = await getMutedKeys(supabase, a.user.playerId)

  // Tournaments the player can follow: real, active, non-practice ones.
  const { data: tournaments } = await supabase
    .from('tournaments')
    .select('id, name')
    .eq('active', true)
    .eq('is_practice', false)
    .is('completed_at', null)
    .order('name')

  return NextResponse.json({ muted: Array.from(muted), tournaments: tournaments ?? [] })
}

export async function PUT(req: NextRequest) {
  const a = await auth()
  if (a.error) return a.error
  const limited = await rateLimit(req, RATE_LIMITS.playerWrite, a.user.playerId)
  if (limited) return limited

  const parsed = putSchema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'Invalid request' }, { status: 400 })
  }

  const supabase = createServiceClient()
  const { error } = await setPreferences(supabase, a.user.playerId, parsed.data.changes)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
