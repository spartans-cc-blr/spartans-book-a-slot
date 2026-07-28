// Shared by POST /api/admin/sync-match-stats (manual, admin-triggered) and
// the scorecard backfill pipeline (automated, after a successful parse).
// Reads parsed stats from the separate analytics Supabase project and
// caches them into this project's match_stats_cache table. Source of truth
// remains the analytics DB — this is a read-through cache used for display
// only. Deliberately does NOT touch fees — /api/fees/apply stays a fully
// separate, manual-only action regardless of how a match got synced.

import { createServiceClient } from '@/lib/supabase'
import { createClient as createSupabaseClient } from '@supabase/supabase-js'

export interface SyncMatchStatsResult {
  ok:    boolean
  error?: string
}

export async function syncMatchStatsForBooking(
  bookingId: string,
  syncedBy: string | null
): Promise<SyncMatchStatsResult> {
  const supabase = createServiceClient()

  const { data: booking, error: bookingErr } = await supabase
    .from('bookings')
    .select('match_id')
    .eq('id', bookingId)
    .single()

  if (bookingErr || !booking?.match_id) {
    return { ok: false, error: 'No match_id on this booking' }
  }

  const mid = booking.match_id

  const analyticsUrl = process.env.ANALYTICS_SUPABASE_URL
  const analyticsKey = process.env.ANALYTICS_SUPABASE_KEY
  if (!analyticsUrl || !analyticsKey) {
    return { ok: false, error: 'Analytics database is not configured' }
  }
  const analyticsSupabase = createSupabaseClient(analyticsUrl, analyticsKey, { auth: { persistSession: false } })

  // select('*') deliberately, not an explicit column list — this is what
  // makes player_id (see src/lib/playerIdentityResolution.ts) show up in
  // match_stats_cache automatically once reconciled, with no change needed
  // here. Rows synced before their name is reconciled just carry
  // player_id: null into the cache until the next sync — expected, not a bug.
  const [match, batting, bowling, fielding, team] = await Promise.all([
    analyticsSupabase.from('match_stats').select('*').eq('match_id', mid).single(),
    analyticsSupabase.from('batting_stats').select('*').eq('match_id', mid),
    analyticsSupabase.from('bowling_stats').select('*').eq('match_id', mid),
    analyticsSupabase.from('fielding_stats').select('*').eq('match_id', mid),
    analyticsSupabase.from('team_list').select('*').eq('match_id', mid),
  ])

  if (!match.data) {
    return { ok: false, error: 'No stats found in analytics DB for this match_id' }
  }

  const m = match.data as any

  const { error: cacheErr } = await supabase.from('match_stats_cache').upsert({
    match_id:         mid,
    booking_id:       bookingId,
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
    synced_by:        syncedBy,
  }, { onConflict: 'match_id' })

  if (cacheErr) return { ok: false, error: cacheErr.message }

  // Status is forward-only (pending_parse → parsed → synced → fees_applied
  // — see architecture.md §6). A re-sync (e.g. to pick up a player_name
  // reconciled after the first sync — see player-identity-resolution.md
  // §5) must never regress an already-fees_applied booking back to
  // 'synced', which would make it look eligible for another fee debit.
  const { error: statusErr } = await supabase
    .from('scorecard_uploads')
    .update({ status: 'synced' })
    .eq('booking_id', bookingId)
    .neq('status', 'fees_applied')

  if (statusErr) return { ok: false, error: statusErr.message }

  return { ok: true }
}
