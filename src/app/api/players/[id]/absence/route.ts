// PUT /api/players/[id]/absence — record why a player is inactive (injured,
// family/personal, work/abroad, left the club, unknown), or clear it.
// Captain / GC / admin only. Append-only: every call inserts a new
// player_absences row; the newest row is the current state.
// See features/player-directory.md §8.
//
// vibe-security: role re-checked server-side; recorded_by comes from the
// session, never the body; reasons can be sensitive (injury, family) so the
// table is service-role only and /players only sends it to these roles.

import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { createServiceClient } from '@/lib/supabase'
import { rateLimit, RATE_LIMITS } from '@/lib/rateLimit'
import { playerAbsenceSchema } from '@/lib/schemas'

export async function PUT(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions)
  const user = session?.user as any
  if (!user) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })
  if (user.playerStatus === 'expelled') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  if (!user.isCaptain && !user.isGC && !user.isAdmin) {
    return NextResponse.json({ error: 'Unauthorised' }, { status: 403 })
  }
  const limited = await rateLimit(req, RATE_LIMITS.captainWrite, user.playerId ?? user.email)
  if (limited) return limited

  const parsed = playerAbsenceSchema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'Invalid input' }, { status: 400 })
  const { reason, expected_return, note } = parsed.data

  const supabase = createServiceClient()
  const { data: player } = await supabase.from('players').select('id').eq('id', params.id).maybeSingle()
  if (!player) return NextResponse.json({ error: 'Player not found' }, { status: 404 })

  // A cleared row or a "left the club" row carries no return date.
  const keepsDetails = reason !== null
  const row = {
    player_id: params.id,
    reason,
    expected_return: keepsDetails && reason !== 'left_club' ? (expected_return ?? null) : null,
    note: keepsDetails ? (note?.trim() || null) : null,
    recorded_by: user.playerId ?? null,
    recorded_by_email: user.email ?? null,
  }
  const { data, error } = await supabase
    .from('player_absences')
    .insert(row)
    .select('reason, expected_return, note, created_at')
    .single()
  if (error) {
    console.error('[absence] insert error:', error.message)
    return NextResponse.json({ error: 'Failed to save' }, { status: 500 })
  }
  return NextResponse.json({ ok: true, absence: data })
}
