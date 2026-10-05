// GET /api/players/[id]/stats — career + current-season performance stats
// for the "My Stats" section on /profile. Same IDOR pattern as the
// dashboard route: a player can only fetch their own stats, admin can
// fetch any. Read-only, no write path.

import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { getPlayerCareerStats, getPlayerSeasonStats, getSeasonCapHolders } from '@/lib/playerStats'
import { capsForPlayer } from '@/lib/capHolders'

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions)
  const user = session?.user as any

  // vibe-security: IDOR guard — player can only fetch their own stats
  if (!user?.playerId) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })
  if (!user.isAdmin && user.playerId !== params.id)
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  try {
    const year = new Date().getFullYear()
    const [career, season, capHolders] = await Promise.all([
      getPlayerCareerStats(params.id),
      getPlayerSeasonStats(params.id, year),
      // Best-effort — a failure here must not hide the stats themselves.
      getSeasonCapHolders(year).catch(() => ({ year, orange: [] as string[], purple: [] as string[] })),
    ])
    return NextResponse.json({ career, season, seasonYear: year, caps: capsForPlayer(params.id, capHolders) })
  } catch (err: any) {
    return NextResponse.json({ error: err.message ?? 'Failed to load stats' }, { status: 500 })
  }
}
