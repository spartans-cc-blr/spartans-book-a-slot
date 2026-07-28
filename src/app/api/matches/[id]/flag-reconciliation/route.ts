// POST   /api/matches/[id]/flag-reconciliation — captain/VC (own booking),
//        wrangler/admin (any booking), or this match's own resolved top
//        performer (own booking only — see matchTopPerformers.ts) flags a
//        scorecard as needing a second look, with a required note
//        explaining why. This widens scorecard
//        backfill eligibility (see src/lib/scorecardBackfill.ts, the daily
//        cron, and /admin/scorecard-backfill) to reprocess the booking
//        regardless of its current status — including fees_applied, which
//        is never itself touched or reversed by this route or by
//        reprocessing. Also clears any prior `verified` flag — flagging is
//        an explicit "I looked and something's wrong", which voids a
//        previous "I looked and it's fine".
// DELETE /api/matches/[id]/flag-reconciliation — admin-only override to
//        clear a flag WITHOUT reprocessing (a false alarm). The normal
//        clear path is automatic: scorecardBackfill.ts clears the flag
//        itself the next time this booking re-syncs successfully.
//
// vibe-security: same per-booking auth pattern as /api/matches/[id]/scorecard
// and /api/matches/[id]/verify-scorecard — captain/VC checked against THIS
// booking's squad row, never role-only. canActOnScorecard() (shared with
// verify-scorecard) also grants this match's own resolved top performer,
// re-derived server-side every call — never trusted from the client.

import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { createServiceClient } from '@/lib/supabase'
import { RATE_LIMITS, rateLimit } from '@/lib/rateLimit'
import { flagReconciliationSchema, resolveReconciliationSchema } from '@/lib/schemas'
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

  const body = await req.json().catch(() => null)
  const parsed = flagReconciliationSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'Invalid request' }, { status: 400 })
  }

  const { data: upload, error: fetchErr } = await supabase
    .from('scorecard_uploads')
    .select('id')
    .eq('booking_id', bookingId)
    .maybeSingle()
  if (fetchErr) return NextResponse.json({ error: fetchErr.message }, { status: 500 })
  if (!upload) return NextResponse.json({ error: 'No scorecard upload found for this match yet' }, { status: 400 })

  const now = new Date().toISOString()
  const { error: updateErr } = await supabase
    .from('scorecard_uploads')
    .update({
      needs_reconciliation:      true,
      reconciliation_note:       parsed.data.note,
      reconciliation_flagged_by: user.playerId,
      reconciliation_flagged_at: now,
      verified:    false,
      verified_by: null,
      verified_at: null,
    })
    .eq('booking_id', bookingId)
  if (updateErr) return NextResponse.json({ error: updateErr.message }, { status: 500 })

  // Audit log write is best-effort — never blocks the flag itself from
  // taking effect, same posture as the availability audit log.
  const { error: logErr } = await supabase.from('scorecard_reconciliation_log').insert({
    booking_id: bookingId,
    action:     'flagged',
    note:       parsed.data.note,
    actor_id:   user.playerId,
  })
  if (logErr) console.error('[flag-reconciliation] audit log write failed:', logErr.message)

  return NextResponse.json({ ok: true })
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const session = await getServerSession(authOptions)
  const user = session?.user as any
  if (!user?.isAdmin) return NextResponse.json({ error: 'Unauthorised' }, { status: 403 })

  const limited = await rateLimit(req, RATE_LIMITS.adminWrite, user.playerId)
  if (limited) return limited

  const supabase = createServiceClient()
  const bookingId = params.id

  const body = await req.json().catch(() => ({}))
  const parsed = resolveReconciliationSchema.safeParse(body ?? {})
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'Invalid request' }, { status: 400 })
  }

  const { data: upload, error: fetchErr } = await supabase
    .from('scorecard_uploads')
    .select('id, needs_reconciliation')
    .eq('booking_id', bookingId)
    .maybeSingle()
  if (fetchErr) return NextResponse.json({ error: fetchErr.message }, { status: 500 })
  if (!upload?.needs_reconciliation) {
    return NextResponse.json({ error: 'This match is not currently flagged' }, { status: 400 })
  }

  const { error: updateErr } = await supabase
    .from('scorecard_uploads')
    .update({
      needs_reconciliation:      false,
      reconciliation_note:       null,
      reconciliation_flagged_by: null,
      reconciliation_flagged_at: null,
    })
    .eq('booking_id', bookingId)
  if (updateErr) return NextResponse.json({ error: updateErr.message }, { status: 500 })

  const { error: logErr } = await supabase.from('scorecard_reconciliation_log').insert({
    booking_id: bookingId,
    action:     'resolved',
    note:       parsed.data.note ?? 'Cleared by admin without reprocessing',
    actor_id:   user.playerId ?? null,
  })
  if (logErr) console.error('[flag-reconciliation] audit log write failed:', logErr.message)

  return NextResponse.json({ ok: true })
}
