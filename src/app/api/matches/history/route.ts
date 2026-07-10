// GET /api/matches/history
// Signed-in members only — the detail route this list feeds into surfaces
// player names (with CricHeroes links), so unlike /schedule this isn't
// public. Reads still go through the service-role client (consistent with
// the rest of the app — no client-side Supabase reads).
//
// Keyset (cursor) pagination ordered by (game_date desc, id desc) — chosen
// over month-based paging because the "I Played" / "I Led" / tournament /
// venue / format filters below can shrink the result set to a handful of
// matches spread across years, which month-by-month browsing would make
// tedious. `cursor` is `${game_date}_${booking_id}` of the last row already
// seen; strictly validated before use since it's interpolated into a raw
// PostgREST `.or()` filter string.
//
// Query params:
//   cursor        — opaque pagination cursor from a previous response
//   limit         — page size, default 15, max 50
//   tournament_id — exact match
//   venue         — exact match on bookings.venue (free-text ground/venue)
//   format        — 'T20' | 'T30'
//   mine=1        — only matches where the signed-in player is in the squad
//   led=1         — only matches where the signed-in player was squad-level
//                   captain or vice-captain (squad.is_captain / squad.is_vc —
//                   never players.is_captain, which is the permanent
//                   club-level flag, not a per-match record)
//   month=YYYY-MM — jump straight to one calendar month (the month chip
//                   strip on the client); ANDs with every filter above and
//                   is completely independent of `cursor` — picking a month
//                   never disturbs the other filters, and vice versa

import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { createServiceClient } from '@/lib/supabase'

const DEFAULT_LIMIT = 15
const MAX_LIMIT = 50
const CURSOR_RE = /^(\d{4}-\d{2}-\d{2})_([0-9a-fA-F-]{36})$/
const MONTH_RE  = /^(\d{4})-(\d{2})$/

function nextMonthStr(month: string): string {
  const [y, m] = month.split('-').map(Number)
  return m === 12 ? `${y + 1}-01` : `${y}-${String(m + 1).padStart(2, '0')}`
}

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions)
  const user = session?.user as any
  if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
  if (user?.playerStatus === 'expelled') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const today = new Date().toISOString().split('T')[0]
  const params = req.nextUrl.searchParams

  const limitParam = parseInt(params.get('limit') ?? '', 10)
  const limit = Number.isFinite(limitParam) ? Math.min(Math.max(limitParam, 1), MAX_LIMIT) : DEFAULT_LIMIT

  const tournamentId = params.get('tournament_id') || null
  const venue        = params.get('venue') || null
  const format       = params.get('format') || null
  const mine         = params.get('mine') === '1'
  const led          = params.get('led') === '1'
  const cursor       = params.get('cursor') || null
  const monthParam   = params.get('month') || null

  const supabase = createServiceClient()

  // "I Played" / "I Led" narrow the result set to specific booking IDs via
  // the squad table, looked up for the signed-in player only — never a
  // client-supplied player_id.
  let restrictToBookingIds: string[] | null = null
  if (mine || led) {
    if (!user?.playerId) return NextResponse.json({ matches: [], nextCursor: null })
    let squadQuery = supabase.from('squad').select('booking_id').eq('player_id', user.playerId)
    if (led) squadQuery = squadQuery.or('is_captain.eq.true,is_vc.eq.true')
    const { data: squadRows, error: squadErr } = await squadQuery
    if (squadErr) return NextResponse.json({ error: squadErr.message }, { status: 500 })
    restrictToBookingIds = Array.from(new Set((squadRows ?? []).map(r => r.booking_id)))
    if (restrictToBookingIds.length === 0) return NextResponse.json({ matches: [], nextCursor: null })
  }

  let query = supabase
    .from('bookings')
    .select('id, game_date, slot_time, match_time, opponent_name, format, tournament_id, venue, cricheroes_url, tournament:tournaments(name, ball_type)')
    .eq('status', 'confirmed')
    .lt('game_date', today)
    .order('game_date', { ascending: false })
    .order('id', { ascending: false })
    .limit(limit)

  if (tournamentId)         query = query.eq('tournament_id', tournamentId)
  if (venue)                query = query.eq('venue', venue)
  if (format)               query = query.eq('format', format)
  if (restrictToBookingIds) query = query.in('id', restrictToBookingIds)

  // Never trust the client's month blindly — strictly shaped before use.
  const monthMatch = monthParam?.match(MONTH_RE)
  if (monthMatch) {
    query = query.gte('game_date', `${monthMatch[0]}-01`).lt('game_date', `${nextMonthStr(monthMatch[0])}-01`)
  }

  // Never trust the client's cursor blindly — it's about to be interpolated
  // into a raw filter string, so it must match this exact shape first.
  const cursorMatch = cursor?.match(CURSOR_RE)
  if (cursorMatch) {
    const [, cursorDate, cursorId] = cursorMatch
    query = query.or(`game_date.lt.${cursorDate},and(game_date.eq.${cursorDate},id.lt.${cursorId})`)
  }

  const { data, error } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const matches = (data ?? []).map(b => ({
    booking_id:      b.id,
    game_date:       b.game_date,
    slot_time:       b.slot_time,
    match_time:      b.match_time,
    opponent_name:   b.opponent_name,
    format:          b.format,
    tournament_id:   b.tournament_id,
    tournament_name: (b.tournament as any)?.name ?? null,
    ball_type:       (b.tournament as any)?.ball_type ?? null,
    venue:           b.venue,
    cricheroes_url:  b.cricheroes_url,
  }))

  const last = matches[matches.length - 1]
  const nextCursor = matches.length === limit && last ? `${last.game_date}_${last.booking_id}` : null

  return NextResponse.json({ matches, nextCursor })
}
