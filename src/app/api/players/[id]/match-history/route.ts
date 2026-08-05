// GET /api/players/[id]/match-history — full match-by-match stats for the
// player stats page (/players/[id]/stats). Any signed-in, non-expelled
// member can view any player's stats — same posture as /matches/history
// and its scorecard routes ("stats aren't sensitive"). Not IDOR-restricted
// to self, unlike /api/players/[id]/stats (the compact /profile summary).
//
// vibe-security: read-only, no write path. Year/ground/format filters are
// parsed server-side; an invalid year falls back to unfiltered rather than
// erroring, since this only narrows a read.

import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { createServiceClient } from '@/lib/supabase'
import { getPlayerStats, getPlayerMatchHistory } from '@/lib/playerStats'

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions)
  const user = session?.user as any

  if (!user?.playerId && !user?.isAdmin) {
    return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })
  }
  if (user.playerStatus === 'expelled') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const { searchParams } = new URL(req.url)
  const yearParam = searchParams.get('year')
  const groundId = searchParams.get('ground') || undefined
  const formatParam = searchParams.get('format') || undefined
  const asCaptain = searchParams.get('captain') === '1'
  const inningsParam = searchParams.get('innings')
  const innings: 'defending' | 'chasing' | undefined =
    inningsParam === 'defending' || inningsParam === 'chasing' ? inningsParam : undefined
  // Practice games are excluded from stats by default (see getScopedMatchIds
  // in src/lib/playerStats.ts) — this is the personal stats page's explicit
  // opt-in to see through that exclusion.
  const includePractice = searchParams.get('practice') === '1'
  const year = yearParam ? Number(yearParam) : undefined
  const filters = {
    year: Number.isFinite(year) && year ? year : undefined,
    groundId,
    // Only a single-format restriction is ever sent (mirrors /leaderboard's
    // convention — absent/both-checked means "no restriction").
    formats: formatParam ? [formatParam] : undefined,
    asCaptain,
    innings,
    includePractice,
  }

  const supabase = createServiceClient()
  const { data: player, error: playerErr } = await supabase
    .from('players')
    .select('id, name, photo_url, jersey_name, jersey_number, primary_skill, secondary_skill, cricheroes_url')
    .eq('id', params.id)
    .single()
  if (playerErr || !player) return NextResponse.json({ error: 'Player not found' }, { status: 404 })

  try {
    const [career, scoped, matches] = await Promise.all([
      getPlayerStats(params.id),
      getPlayerStats(params.id, filters),
      getPlayerMatchHistory(params.id, filters),
    ])
    return NextResponse.json({ player, career, scoped, matches })
  } catch (err: any) {
    return NextResponse.json({ error: err.message ?? 'Failed to load stats' }, { status: 500 })
  }
}
