// POST /api/admin/sync-match-stats
// Admin only. Reads parsed stats from the separate analytics Supabase
// project and caches them into this project's match_stats_cache table.
// Source of truth remains the analytics DB — this is a read-through cache
// used for display only.

import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { createServiceClient } from '@/lib/supabase'
import { createClient as createSupabaseClient } from '@supabase/supabase-js'
import { RATE_LIMITS, rateLimit } from '@/lib/rateLimit'

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  const user = session?.user as any
  if (!user?.isAdmin) return NextResponse.json({ error: 'Unauthorised' }, { status: 403 })

  const limited = await rateLimit(req, RATE_LIMITS.adminWrite, user.playerId)
  if (limited) return limited

  const body = await req.json().catch(() => null)
  const booking_id = body?.booking_id
  if (!booking_id || typeof booking_id !== 'string') {
    return NextResponse.json({ error: 'booking_id required' }, { status: 400 })
  }

  const supabase = createServiceClient()

  const { data: booking, error: bookingErr } = await supabase
    .from('bookings')
    .select('match_id')
    .eq('id', booking_id)
    .single()

  if (bookingErr || !booking?.match_id) {
    return NextResponse.json({ error: 'No match_id on this booking' }, { status: 400 })
  }

  const mid = booking.match_id

  const analyticsUrl = process.env.ANALYTICS_SUPABASE_URL
  const analyticsKey = process.env.ANALYTICS_SUPABASE_KEY
  if (!analyticsUrl || !analyticsKey) {
    return NextResponse.json({ error: 'Analytics database is not configured' }, { status: 500 })
  }
  const analyticsSupabase = createSupabaseClient(analyticsUrl, analyticsKey, { auth: { persistSession: false } })

  const [match, batting, bowling, fielding, team] = await Promise.all([
    analyticsSupabase.from('match_stats').select('*').eq('match_id', mid).single(),
    analyticsSupabase.from('batting_stats').select('*').eq('match_id', mid),
    analyticsSupabase.from('bowling_stats').select('*').eq('match_id', mid),
    analyticsSupabase.from('fielding_stats').select('*').eq('match_id', mid),
    analyticsSupabase.from('team_list').select('*').eq('match_id', mid),
  ])

  if (!match.data) {
    return NextResponse.json({ error: 'No stats found in analytics DB for this match_id' }, { status: 404 })
  }

  const m = match.data as any

  const { error: cacheErr } = await supabase.from('match_stats_cache').upsert({
    match_id:         mid,
    booking_id,
    match_result:     m.match_result ?? null,
    team_total:       m.team_total ?? null,
    team_wickets:     m.team_wickets ?? null,
    team_overs:       m.team_overs ?? null,
    opponent_total:   m.opponent_total ?? null,
    opponent_wickets: m.opponent_wickets ?? null,
    opponent_overs:   m.opponent_overs ?? null,
    opponent_name:    m.opponent_name ?? null,
    ground:           m.ground ?? null,
    tournament_name:  m.tournament_name ?? null,
    match_date:       m.match_date ?? null,
    batting:          batting.data ?? [],
    bowling:          bowling.data ?? [],
    fielding:         fielding.data ?? [],
    team_list:        team.data ?? [],
    synced_at:        new Date().toISOString(),
    synced_by:        user.playerId,
  }, { onConflict: 'match_id' })

  if (cacheErr) return NextResponse.json({ error: cacheErr.message }, { status: 500 })

  const { error: statusErr } = await supabase
    .from('scorecard_uploads')
    .update({ status: 'synced' })
    .eq('booking_id', booking_id)

  if (statusErr) return NextResponse.json({ error: statusErr.message }, { status: 500 })

  return NextResponse.json({ ok: true })
}
