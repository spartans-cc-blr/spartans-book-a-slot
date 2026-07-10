// PATCH /api/matches/history/[bookingId]/roles
// GC or Admin only — corrects per-player match-day roles (C/VC/WK) on a
// squad after the fact. Never trusts the client's role flags: re-checks
// isGC/isAdmin from the session on every call, and only ever writes a row
// for a player_id that already exists in this booking's squad.

import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { createServiceClient } from '@/lib/supabase'
import { RATE_LIMITS, rateLimit } from '@/lib/rateLimit'

interface RoleUpdate {
  player_id:  string
  is_captain: boolean
  is_vc:      boolean
  is_wk:      boolean
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: { bookingId: string } }
) {
  const session = await getServerSession(authOptions)
  const user = session?.user as any
  if (!user?.playerId) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
  if (!user?.isGC && !user?.isAdmin) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const limited = await rateLimit(req, RATE_LIMITS.adminWrite, user.playerId)
  if (limited) return limited

  const body = await req.json()
  const updates: RoleUpdate[] = Array.isArray(body) ? body : body?.updates
  if (!Array.isArray(updates)) return NextResponse.json({ error: 'Invalid body' }, { status: 400 })

  const bookingId = params.bookingId
  const supabase = createServiceClient()

  const { data: currentRows, error: currentErr } = await supabase
    .from('squad')
    .select('player_id, is_captain, is_vc, is_wk')
    .eq('booking_id', bookingId)

  if (currentErr) return NextResponse.json({ error: currentErr.message }, { status: 500 })
  if (!currentRows?.length) return NextResponse.json({ error: 'No squad found for this booking' }, { status: 404 })

  const currentByPlayer = new Map(currentRows.map(r => [r.player_id, r]))
  const auditRows: Record<string, any>[] = []

  for (const upd of updates) {
    // Never trust the client — only correct a role for a player already in
    // this booking's squad.
    const current = currentByPlayer.get(upd?.player_id)
    if (!current) continue

    const nextCaptain = !!upd.is_captain
    const nextVc      = !!upd.is_vc
    const nextWk       = !!upd.is_wk

    if (current.is_captain === nextCaptain && current.is_vc === nextVc && current.is_wk === nextWk) {
      continue // no-op — skip both the write and the audit row
    }

    const { error: updErr } = await supabase
      .from('squad')
      .update({ is_captain: nextCaptain, is_vc: nextVc, is_wk: nextWk })
      .eq('booking_id', bookingId)
      .eq('player_id', upd.player_id)

    if (updErr) return NextResponse.json({ error: updErr.message }, { status: 500 })

    auditRows.push({
      booking_id: bookingId,
      action:     'role_corrected',
      actor_id:   user.playerId,
      note: JSON.stringify({
        player_id: upd.player_id,
        from: { captain: current.is_captain, vc: current.is_vc, wk: current.is_wk },
        to:   { captain: nextCaptain, vc: nextVc, wk: nextWk },
      }),
    })
  }

  if (auditRows.length) {
    const { error: auditErr } = await supabase.from('squad_audit').insert(auditRows)
    if (auditErr) console.error('[squad_audit] insert failed:', auditErr.message)
  }

  const { data: freshRows, error: freshErr } = await supabase
    .from('squad')
    .select('is_captain, is_vc')
    .eq('booking_id', bookingId)

  if (freshErr) return NextResponse.json({ error: freshErr.message }, { status: 500 })

  const captainCount = (freshRows ?? []).filter(r => r.is_captain).length
  const vcCount      = (freshRows ?? []).filter(r => r.is_vc).length

  return NextResponse.json({ ok: true, updated: auditRows.length, captainCount, vcCount })
}
