// GET /api/admin/bookings/needs-action
// Admin-only — powers the "Needs action" tab on /admin (Matches).
//
// Past confirmed games from the last NEEDS_ACTION_DAYS days whose scorecard
// or fee still has a next step (see computeNextStep()). Read-only: it only
// points at the next step; fees stay a manual admin action.

import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { createServiceClient } from '@/lib/supabase'
import type { DashboardBookingRow } from '@/components/admin/DashboardBookingsTabs'
import { computeNextStep, NEEDS_ACTION_DAYS } from '@/lib/matchNextStep'

export async function GET() {
  const session = await getServerSession(authOptions)
  if (!(session?.user as any)?.isAdmin) return NextResponse.json({ error: 'Unauthorised' }, { status: 403 })

  const supabase = createServiceClient()
  const today = new Date().toISOString().split('T')[0]
  const since = new Date(Date.now() - NEEDS_ACTION_DAYS * 86400000).toISOString().split('T')[0]

  const { data: bookings, error } = await supabase
    .from('bookings')
    .select(`
      id, game_date, slot_time, format, status, block_reason, match_id, is_practice, cricheroes_url,
      tournament:tournaments!bookings_tournament_id_fkey(
        id, name, is_practice, captains!tournaments_captain_id_fkey(id, name)
      )
    `)
    .eq('status', 'confirmed')
    .lt('game_date', today)
    .gte('game_date', since)
    .order('game_date', { ascending: false })
    .order('slot_time', { ascending: false })
    .limit(200)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const ids = (bookings ?? []).map((b: any) => b.id)
  const { data: scRows } = ids.length
    ? await supabase.from('scorecard_uploads')
        .select('booking_id, status, fees_reconciled_externally, needs_reconciliation').in('booking_id', ids)
    : { data: [] as any[] }
  const sc = new Map((scRows ?? []).map((r: any) => [r.booking_id, r]))

  const rows: DashboardBookingRow[] = []
  for (const b of (bookings ?? []) as any[]) {
    const s = sc.get(b.id)
    const next = computeNextStep({
      status: b.status, match_id: b.match_id ?? null,
      is_practice: !!b.is_practice || !!b.tournament?.is_practice,
      scorecard_status: s?.status ?? null,
      fees_reconciled_externally: !!s?.fees_reconciled_externally,
      needs_reconciliation: !!s?.needs_reconciliation,
    })
    if (!next) continue
    rows.push({
      id: b.id, game_date: b.game_date, slot_time: b.slot_time, format: b.format ?? null,
      status: b.status, block_reason: b.block_reason ?? null,
      captain_name: b.tournament?.captains?.name ?? null,
      tournament_name: b.tournament?.name ?? null,
      apply_fee_eligible: next.kind === 'fee_due',
      next_step: next,
      missing_link: !b.cricheroes_url,
    })
  }
  return NextResponse.json({ bookings: rows, windowDays: NEEDS_ACTION_DAYS })
}
