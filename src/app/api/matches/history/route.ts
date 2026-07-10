// GET /api/matches/history?month=YYYY-MM
// Public read — lightweight list of past confirmed matches, paginated by
// calendar month. No squad data here; see /api/matches/history/[bookingId]
// for the full detail. Reads still go through the service-role client
// (consistent with the rest of the app — no client-side Supabase reads).

import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase'

function pad(n: number) { return String(n).padStart(2, '0') }

function currentMonthStr(): string {
  const d = new Date()
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}`
}

function nextMonthStr(month: string): string {
  const [y, m] = month.split('-').map(Number)
  return m === 12 ? `${y + 1}-01` : `${y}-${pad(m + 1)}`
}

export async function GET(req: NextRequest) {
  const today = new Date().toISOString().split('T')[0]
  const monthParam = req.nextUrl.searchParams.get('month')
  const month = monthParam && /^\d{4}-\d{2}$/.test(monthParam) ? monthParam : currentMonthStr()

  const monthStart = `${month}-01`
  const monthEndExclusive = `${nextMonthStr(month)}-01`
  // A match is "past" only once game_date < today — cap the upper bound so
  // the current month's in-progress/future days never show up here.
  const upperBoundExclusive = monthEndExclusive < today ? monthEndExclusive : today

  const supabase = createServiceClient()

  const { data, error } = await supabase
    .from('bookings')
    .select('id, game_date, opponent_name, format, tournament_id, tournament:tournaments(name)')
    .eq('status', 'confirmed')
    .gte('game_date', monthStart)
    .lt('game_date', upperBoundExclusive)
    .order('game_date', { ascending: false })
    .order('slot_time', { ascending: false })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const matches = (data ?? []).map(b => ({
    booking_id:      b.id,
    game_date:       b.game_date,
    opponent_name:   b.opponent_name,
    format:          b.format,
    tournament_id:   b.tournament_id,
    tournament_name: (b.tournament as any)?.name ?? null,
  }))

  // Cheap existence check — is there any confirmed past match before this
  // month's start? Drives the "Older" pagination control.
  const { count: earlierCount, error: earlierErr } = await supabase
    .from('bookings')
    .select('id', { count: 'exact', head: true })
    .eq('status', 'confirmed')
    .lt('game_date', monthStart)

  if (earlierErr) return NextResponse.json({ error: earlierErr.message }, { status: 500 })

  return NextResponse.json({ matches, month, hasMore: (earlierCount ?? 0) > 0 })
}
