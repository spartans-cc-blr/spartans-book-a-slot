// GET /api/admin/bookings/past
// Admin-only — powers the paginated "Past" tab on /admin
// (DashboardBookingsTabs / AdminPastMatchesPanel).
//
// Mirrors the month-stepper pattern from /api/matches/history +
// /api/matches/history/filters (see MatchHistoryClient.tsx), but scoped to
// the admin dashboard's own broader "past bookings" definition (any
// non-cancelled status — confirmed AND soft_block, not just confirmed) and
// deliberately without that page's role/tournament/ground/format/result
// filters — the admin dashboard just needs to browse booking history month
// by month, not slice it every which way.
//
// This replaces the old `.limit(100)` fetch in admin/page.tsx, which
// silently capped the "Past" tab (and its "(100)" count) the moment the
// club's history grew past 100 bookings.
//
// Query params:
//   month=YYYY-MM — scope to one calendar month; omitted/empty = all time
//
// Response:
//   bookings   — DashboardBookingRow[] for the requested month (or all
//                time), most recent first
//   months     — every distinct YYYY-MM with at least one past booking,
//                most-recent-first — feeds the month stepper/picker
//   totalCount — count of ALL past non-cancelled bookings, unfiltered by
//                month — feeds the "Past (N)" tab label

import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { createServiceClient } from '@/lib/supabase'
import type { DashboardBookingRow } from '@/components/admin/DashboardBookingsTabs'

const MONTH_RE = /^(\d{4})-(\d{2})$/
// Generous safety cap for a single month's bookings — a club plays at most
// a handful of games a month, this only exists so a single request can
// never return an unbounded result set (see security.md S-4's array-cap
// precedent for the same principle elsewhere in this app).
const MONTH_LIMIT = 300

function nextMonthStr(month: string): string {
  const [y, m] = month.split('-').map(Number)
  return m === 12 ? `${y + 1}-01` : `${y}-${String(m + 1).padStart(2, '0')}`
}

async function requireAdmin() {
  const session = await getServerSession(authOptions)
  const user = session?.user as any
  if (!user?.isAdmin) return NextResponse.json({ error: 'Unauthorised' }, { status: 403 })
  return null
}

const tournamentSelect = `
  id, game_date, slot_time, format, status, block_reason, tournament_id,
  tournament:tournaments!bookings_tournament_id_fkey(
    id, name, captains!tournaments_captain_id_fkey(id, name)
  )
`

export async function GET(req: NextRequest) {
  const deny = await requireAdmin()
  if (deny) return deny

  const today = new Date().toISOString().split('T')[0]
  const supabase = createServiceClient()

  const monthParam = req.nextUrl.searchParams.get('month') || null
  const monthMatch = monthParam?.match(MONTH_RE)

  // Distinct months across ALL past bookings — cheap (one column), and
  // computed independently of whichever month is currently selected so the
  // stepper's ends/gaps are always correct. Total count falls out of the
  // same query for free.
  const { data: monthRows, error: monthErr } = await supabase
    .from('bookings')
    .select('game_date')
    .neq('status', 'cancelled')
    .lt('game_date', today)
  if (monthErr) return NextResponse.json({ error: monthErr.message }, { status: 500 })

  const monthSet = new Set((monthRows ?? []).map(r => r.game_date.slice(0, 7)))
  const months = Array.from(monthSet).sort((a, b) => b.localeCompare(a)) // most recent first
  const totalCount = monthRows?.length ?? 0

  let query = supabase
    .from('bookings')
    .select(tournamentSelect)
    .neq('status', 'cancelled')
    .lt('game_date', today)
    .order('game_date', { ascending: false })
    .order('slot_time', { ascending: false })
    .limit(MONTH_LIMIT)

  if (monthMatch) {
    query = query
      .gte('game_date', `${monthMatch[0]}-01`)
      .lt('game_date', `${nextMonthStr(monthMatch[0])}-01`)
  }

  const { data: bookings, error } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Scorecard status per booking — drives the "Apply Match Fee" shortcut,
  // same eligibility rule as the old admin/page.tsx query it replaces.
  const bookingIds = (bookings ?? []).map((b: any) => b.id)
  const { data: scorecardRows } = bookingIds.length
    ? await supabase.from('scorecard_uploads').select('booking_id, status, fees_reconciled_externally').in('booking_id', bookingIds)
    : { data: [] as { booking_id: string; status: string; fees_reconciled_externally: boolean }[] }
  const applyFeeEligibleByBooking = new Map(
    (scorecardRows ?? []).map(r => [r.booking_id, r.status === 'synced' && !r.fees_reconciled_externally])
  )

  const rows: DashboardBookingRow[] = (bookings ?? []).map((b: any) => ({
    id:                 b.id,
    game_date:          b.game_date,
    slot_time:          b.slot_time,
    format:             b.format ?? null,
    status:             b.status,
    block_reason:       b.block_reason ?? null,
    captain_name:       b.tournament?.captains?.name ?? null,
    tournament_name:    b.tournament?.name ?? null,
    apply_fee_eligible: applyFeeEligibleByBooking.get(b.id) ?? false,
  }))

  // Only "All time" (no month picked) can realistically hit MONTH_LIMIT —
  // any single calendar month is nowhere near it. Surfaced explicitly
  // rather than silently returning a short list, so this can never repeat
  // the original "(100)" bug's mistake of an invisible cap.
  const truncated = !monthMatch && rows.length === MONTH_LIMIT

  return NextResponse.json({ bookings: rows, months, totalCount, truncated })
}
