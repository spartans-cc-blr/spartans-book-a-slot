// GET /api/admin/matches/[id]/post-match
// Admin only. Feeds the "Post-Match" panel on /admin/bookings/[id] — upload
// status (with uploader name) plus the cached stats summary, if synced.
//
// DELETE clears a stuck or wrong scorecard_uploads row for this booking so
// the upload flow can restart cleanly — admin-only override, since a
// captain/wrangler self-service reset could otherwise erase a legitimate
// synced/fees_applied record. Never touches wallet_transactions — resetting
// the upload record does not reverse a debit already applied.

import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { createServiceClient } from '@/lib/supabase'
import { RATE_LIMITS, rateLimit } from '@/lib/rateLimit'

export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const session = await getServerSession(authOptions)
  const user = session?.user as any
  if (!user?.isAdmin) return NextResponse.json({ error: 'Unauthorised' }, { status: 403 })

  const supabase = createServiceClient()

  const { data: upload, error: uploadErr } = await supabase
    .from('scorecard_uploads')
    .select('status, uploaded_at, uploaded_by, error_message, fees_applied_at')
    .eq('booking_id', params.id)
    .maybeSingle()

  if (uploadErr) return NextResponse.json({ error: uploadErr.message }, { status: 500 })

  // Two FKs from scorecard_uploads point at players (uploaded_by,
  // fees_applied_by) — resolved with a separate lookup instead of an
  // embedded select to avoid PostgREST FK-ambiguity entirely.
  let uploadedByName: string | null = null
  if (upload?.uploaded_by) {
    const { data: uploader } = await supabase
      .from('players')
      .select('name')
      .eq('id', upload.uploaded_by)
      .maybeSingle()
    uploadedByName = uploader?.name ?? null
  }

  const { data: booking } = await supabase
    .from('bookings')
    .select('match_id')
    .eq('id', params.id)
    .maybeSingle()

  let stats: any = null
  if (booking?.match_id) {
    const { data: statsRow } = await supabase
      .from('match_stats_cache')
      .select('match_result, team_total, team_wickets, team_overs, opponent_total, opponent_wickets, opponent_overs')
      .eq('match_id', booking.match_id)
      .maybeSingle()
    stats = statsRow ?? null
  }

  // Fee share adjustments already recorded for this booking — surfaced so
  // re-opening an already-fees_applied booking still shows who diverged
  // from the default share and why, rather than that context only being
  // visible during the apply flow.
  const { data: waiverRows } = await supabase
    .from('match_fee_waivers')
    .select('player_id, units, reason, created_at, players(name)')
    .eq('booking_id', params.id)

  const waivers = (waiverRows ?? []).map(w => ({
    player_id:  w.player_id,
    name:       (w.players as any)?.name ?? 'Unknown',
    units:      w.units,
    reason:     w.reason,
    created_at: w.created_at,
  }))

  // The actual per-player amounts charged, once fees have been applied —
  // sourced from the immutable wallet_transactions ledger, never
  // recomputed. A fresh dry-run preview (POST /api/fees/apply,
  // confirm:false) only knows the server-computed *defaults*, not the
  // per-player unit overrides an admin actually applied — showing that
  // instead of the real ledger here previously produced a misleading
  // "per share" figure that didn't match what was actually debited.
  let feeBreakdown: { player_id: string; name: string; amount: number }[] = []
  if (upload?.status === 'fees_applied') {
    const { data: txRows } = await supabase
      .from('wallet_transactions')
      .select('player_id, amount, players(name)')
      .eq('booking_id', params.id)
      .eq('type', 'debit')

    feeBreakdown = (txRows ?? [])
      .map(t => ({
        player_id: t.player_id,
        name:      (t.players as any)?.name ?? 'Unknown',
        amount:    Number(t.amount),
      }))
      .sort((a, b) => a.name.localeCompare(b.name))
  }

  return NextResponse.json({
    upload: upload ? {
      status:           upload.status,
      uploaded_at:      upload.uploaded_at,
      uploaded_by_name: uploadedByName,
      error_message:    upload.error_message,
      fees_applied_at:  upload.fees_applied_at,
    } : null,
    stats,
    waivers,
    feeBreakdown,
  })
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

  const { error } = await supabase
    .from('scorecard_uploads')
    .delete()
    .eq('booking_id', params.id)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
