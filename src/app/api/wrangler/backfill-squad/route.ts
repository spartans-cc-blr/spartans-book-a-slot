// POST /api/wrangler/backfill-squad
// Writes resolved squad rows for a booking, sourced from a manually
// parsed + human-reviewed WhatsApp announcement. Wrangler/Admin only.
//
// Confirmation model: the in-app "Overwrite existing rows" checkbox
// (backfill-squad/page.tsx) IS the human confirmation gate for the
// overwrite path — this route trusts `overwrite` once the UI has shown
// the warning banner and required the explicit checkbox.

import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { createServiceClient } from '@/lib/supabase'

type Role = 'C' | 'VC' | 'WK'
const VALID_ROLES = new Set(['C', 'VC', 'WK'])

async function requireWrangler() {
  const session = await getServerSession(authOptions)
  const user = session?.user as any
  if (!user?.playerId) return { error: NextResponse.json({ error: 'Not authenticated' }, { status: 401 }), user: null }
  if (!user?.isWrangler && !user?.isAdmin) return { error: NextResponse.json({ error: 'Forbidden' }, { status: 403 }), user: null }
  return { error: null, user }
}

export async function POST(req: NextRequest) {
  const { error: authErr, user } = await requireWrangler()
  if (authErr) return authErr

  const body = await req.json().catch(() => null)
  const booking_id = body?.booking_id
  const players = body?.players
  const overwrite = body?.overwrite === true

  if (!booking_id || typeof booking_id !== 'string') {
    return NextResponse.json({ error: 'booking_id required' }, { status: 400 })
  }
  if (!Array.isArray(players) || players.length === 0) {
    return NextResponse.json({ error: 'players array required' }, { status: 400 })
  }
  if (players.length > 12) {
    return NextResponse.json({ error: 'Squad cannot exceed 12 players' }, { status: 400 })
  }

  const seen = new Set<string>()
  let captainCount = 0
  let vcCount = 0

  for (const row of players) {
    if (!row?.player_id || typeof row.player_id !== 'string') {
      return NextResponse.json({ error: 'Each player row requires a player_id' }, { status: 400 })
    }
    if (seen.has(row.player_id)) {
      return NextResponse.json({ error: 'Duplicate player_id in players array' }, { status: 400 })
    }
    seen.add(row.player_id)

    const roles = row.roles ?? []
    if (!Array.isArray(roles)) {
      return NextResponse.json({ error: 'roles must be an array' }, { status: 400 })
    }
    for (const r of roles) {
      if (!VALID_ROLES.has(r)) {
        return NextResponse.json({ error: `Invalid role: ${r}` }, { status: 400 })
      }
    }
    if (roles.includes('C'))  captainCount++
    if (roles.includes('VC')) vcCount++
  }
  if (captainCount > 1) return NextResponse.json({ error: 'Only one Captain (C) allowed' }, { status: 400 })
  if (vcCount > 1)      return NextResponse.json({ error: 'Only one Vice Captain (VC) allowed' }, { status: 400 })

  const supabase = createServiceClient()

  const { data: existing, error: existingErr } = await supabase
    .from('squad')
    .select('id')
    .eq('booking_id', booking_id)
    .limit(1)

  if (existingErr) return NextResponse.json({ error: existingErr.message }, { status: 500 })

  if (existing?.length && !overwrite) {
    return NextResponse.json(
      { error: 'Squad rows already exist for this booking — confirm overwrite to replace them' },
      { status: 409 }
    )
  }

  if (existing?.length && overwrite) {
    const { error: deleteErr } = await supabase
      .from('squad')
      .delete()
      .eq('booking_id', booking_id)
    if (deleteErr) return NextResponse.json({ error: deleteErr.message }, { status: 500 })
  }

  const rows = players.map((row: { player_id: string; roles?: Role[] }) => ({
    booking_id,
    player_id:  row.player_id,
    status:     'announced',
    is_captain: (row.roles ?? []).includes('C'),
    is_vc:      (row.roles ?? []).includes('VC'),
    is_wk:      (row.roles ?? []).includes('WK'),
  }))

  const { error: insertErr } = await supabase.from('squad').insert(rows)
  if (insertErr) return NextResponse.json({ error: insertErr.message }, { status: 500 })

  const { error: auditErr } = await supabase.from('squad_audit').insert({
    booking_id,
    action:   'announced',
    actor_id: user!.playerId,
    note:     'backfilled from WhatsApp announcement',
  })
  if (auditErr) console.error('[squad_audit] insert failed:', auditErr.message)

  return NextResponse.json({ ok: true, count: rows.length })
}
