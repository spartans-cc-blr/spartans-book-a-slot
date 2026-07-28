// POST /api/matches/[id]/verify-scorecard
// Captain/VC (own booking), wrangler/admin (any booking), or this match's
// own resolved top performer (own booking only — see matchTopPerformers.ts)
// confirms they've manually checked the synced stats against the real
// CricHeroes scorecard and they're correct. Pure confidence flag — never
// reprocesses anything, never touches the forward-only
// scorecard_uploads.status column. Mirrors the exact per-booking auth
// pattern from /api/matches/[id]/scorecard.
//
// vibe-security: canActOnScorecard() re-derives every branch server-side —
// the captain/VC check is a `squad` lookup scoped to THIS booking_id + THIS
// player_id, and the top-performer check is re-computed from
// match_stats_cache + squad, never trusted from the client. is_wrangler/
// is_admin bypass the per-booking check but still require an authenticated
// session with a valid playerId.

import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { createServiceClient } from '@/lib/supabase'
import { RATE_LIMITS, rateLimit } from '@/lib/rateLimit'
import { canActOnScorecard } from '@/lib/scorecardAuth'

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const session = await getServerSession(authOptions)
  const user = session?.user as any
  if (!user?.playerId) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })

  const limited = await rateLimit(req, RATE_LIMITS.captainWrite, user.playerId)
  if (limited) return limited

  const supabase = createServiceClient()
  const bookingId = params.id

  if (!(await canActOnScorecard(supabase, bookingId, user))) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const { data: upload, error: fetchErr } = await supabase
    .from('scorecard_uploads')
    .select('status, needs_reconciliation')
    .eq('booking_id', bookingId)
    .maybeSingle()

  if (fetchErr) return NextResponse.json({ error: fetchErr.message }, { status: 500 })
  if (!upload || !['synced', 'fees_applied'].includes(upload.status)) {
    return NextResponse.json({ error: 'Stats must be synced before they can be verified' }, { status: 400 })
  }
  if (upload.needs_reconciliation) {
    return NextResponse.json({ error: 'This match is flagged for reconciliation — resolve that first' }, { status: 400 })
  }

  const { error: updateErr } = await supabase
    .from('scorecard_uploads')
    .update({
      verified:    true,
      verified_by: user.playerId,
      verified_at: new Date().toISOString(),
    })
    .eq('booking_id', bookingId)

  if (updateErr) return NextResponse.json({ error: updateErr.message }, { status: 500 })

  return NextResponse.json({ ok: true })
}
