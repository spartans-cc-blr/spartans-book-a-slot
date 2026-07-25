// GET  /api/admin/scorecard-backfill — list every past confirmed booking
//      that has a CricHeroes match_id, regardless of sync status. Used to
//      be filtered down to only "not yet synced" rows, but that made an
//      already-synced/fees_applied match impossible to locate here at all —
//      which is exactly the case an admin needs this page for when a fix to
//      the parsing pipeline (e.g. a bowling-extraction bug) needs a past
//      match re-run. backfillOneBooking() itself never checks current
//      status (it unconditionally upserts scorecard_uploads and re-parses),
//      so no "reset" step is actually required server-side — the client
//      just needs to be able to find the row and choose to re-run it.
// POST /api/admin/scorecard-backfill — process exactly one booking (fetch
//      from CricHeroes, parse, persist). Called once per row by the admin
//      backfill page's client-side loop — never loops server-side itself,
//      since a Vercel function has a hard ceiling well under what a full
//      historical backlog could take.

import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { createServiceClient } from '@/lib/supabase'
import { RATE_LIMITS, rateLimit } from '@/lib/rateLimit'
import { backfillOneBooking } from '@/lib/scorecardBackfill'

export const maxDuration = 60

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions)
  const user = session?.user as any
  if (!user?.isAdmin) return NextResponse.json({ error: 'Unauthorised' }, { status: 403 })

  const supabase = createServiceClient()
  const today = new Date().toISOString().split('T')[0]

  const { data: bookings, error } = await supabase
    .from('bookings')
    .select('id, game_date, slot_time, format, opponent_name, match_id, scorecard_uploads(status, error_message, verified, needs_reconciliation, reconciliation_note, reconciliation_flagged_by, reconciliation_flagged_at)')
    .eq('status', 'confirmed')
    .lt('game_date', today)
    .not('match_id', 'is', null)
    .order('game_date', { ascending: false })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // scorecard_uploads has several FK columns to players (uploaded_by,
  // fees_applied_by, verified_by, reconciliation_flagged_by) — an embedded
  // `players(...)` select would hit the FK-ambiguity error documented in
  // security.md, so flagger names are resolved via a separate batched
  // lookup instead, same pattern as ledRes/rolesRes in matches/history.
  const flaggedByIds = Array.from(new Set(
    (bookings ?? [])
      .map((b: any) => (Array.isArray(b.scorecard_uploads) ? b.scorecard_uploads[0] : b.scorecard_uploads)?.reconciliation_flagged_by)
      .filter(Boolean)
  ))
  const { data: flaggers } = flaggedByIds.length
    ? await supabase.from('players').select('id, name').in('id', flaggedByIds)
    : { data: [] as { id: string; name: string }[] }
  const flaggerName = new Map((flaggers ?? []).map((p: any) => [p.id, p.name]))

  const rows = (bookings ?? []).map((b: any) => {
    // scorecard_uploads.booking_id is UNIQUE, so PostgREST should embed
    // this as a single object — but a defensive array check costs
    // nothing and avoids a footgun if that ever changes.
    const su = Array.isArray(b.scorecard_uploads) ? b.scorecard_uploads[0] : b.scorecard_uploads
    return {
      booking_id:      b.id,
      game_date:       b.game_date,
      slot_time:       b.slot_time,
      format:          b.format,
      opponent_name:   b.opponent_name,
      match_id:        b.match_id,
      current_status:  su?.status ?? null,
      error_message:   su?.error_message ?? null,
      verified:                       su?.verified ?? false,
      needs_reconciliation:           su?.needs_reconciliation ?? false,
      reconciliation_note:            su?.reconciliation_note ?? null,
      reconciliation_flagged_at:      su?.reconciliation_flagged_at ?? null,
      reconciliation_flagged_by_name: su?.reconciliation_flagged_by ? (flaggerName.get(su.reconciliation_flagged_by) ?? null) : null,
    }
  })

  // Flagged rows first (oldest flag first — most overdue), everything else
  // keeps the query's own game_date-desc order. Array.sort is a stable sort,
  // so returning 0 for the non-flagged group preserves that order exactly.
  rows.sort((a, b) => {
    if (a.needs_reconciliation !== b.needs_reconciliation) return a.needs_reconciliation ? -1 : 1
    if (a.needs_reconciliation && b.needs_reconciliation) {
      return (a.reconciliation_flagged_at ?? '').localeCompare(b.reconciliation_flagged_at ?? '')
    }
    return 0
  })

  return NextResponse.json({ bookings: rows })
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  const user = session?.user as any
  if (!user?.isAdmin) return NextResponse.json({ error: 'Unauthorised' }, { status: 403 })

  const limited = await rateLimit(req, RATE_LIMITS.adminWrite, user.playerId)
  if (limited) return limited

  const body = await req.json().catch(() => null)
  const bookingId = body?.booking_id
  if (!bookingId || typeof bookingId !== 'string') {
    return NextResponse.json({ error: 'booking_id required' }, { status: 400 })
  }

  const result = await backfillOneBooking(bookingId)
  return NextResponse.json(result)
}
