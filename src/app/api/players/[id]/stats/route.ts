// GET /api/players/[id]/stats — career + current-season performance stats
// for the "My Stats" section on /profile. Same IDOR pattern as the
// dashboard route: a player can only fetch their own stats, admin can
// fetch any. Read-only, no write path.

import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { getPlayerCareerStats, getPlayerSeasonStats } from '@/lib/playerStats'

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions)
  const user = session?.user as any

  // vibe-security: IDOR guard — player can only fetch their own stats
  if (!user?.playerId) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })
  if (!user.isAdmin && user.playerId !== params.id)
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  try {
    const year = new Date().getFullYear()
    const [career, season] = await Promise.all([
      getPlayerCareerStats(params.id),
      getPlayerSeasonStats(params.id, year),
    ])
    return NextResponse.json({ career, season, seasonYear: year })
  } catch (err: any) {
    return NextResponse.json({ error: err.message ?? 'Failed to load stats' }, { status: 500 })
  }
}
