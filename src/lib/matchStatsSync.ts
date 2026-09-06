// Shared by POST /api/admin/sync-match-stats (manual, admin-triggered) and
// the scorecard backfill pipeline (automated, after a successful parse).
// Reads parsed stats from the separate analytics Supabase project and
// caches them into this project's match_stats_cache table. Source of truth
// remains the analytics DB — this is a read-through cache used for display
// only. Deliberately does NOT touch fees — /api/fees/apply stays a fully
// separate, manual-only action regardless of how a match got synced.

import { createServiceClient } from '@/lib/supabase'
import { createClient as createSupabaseClient } from '@supabase/supabase-js'
import { detectAndLogMilestones, detectAndLogMatchPerformances } from '@/lib/milestones'
import { resolveSquadMatch, type SquadRef } from '@/lib/matchTopPerformers'
import { autoResolveMatch } from '@/lib/playerIdentityResolution'

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
    .select('match_id, game_date, tournament:tournaments(is_practice)')
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

  // Auto-apply any already-known alias/override/squad-disambiguation before
  // reading below — see autoResolveMatch()'s own header comment and
  // player-identity-resolution.md §5. This is what makes an already-known
  // player resolve on this very sync instead of needing an admin to run
  // "Run Reconciliation Pass" again for every new match. Best-effort —
  // autoResolveMatch() never throws, so a resolution hiccup here can't
  // block the sync itself.
  await autoResolveMatch(analyticsSupabase, supabase, mid)

  // select('*') deliberately, not an explicit column list — this is what
  // makes player_id (see src/lib/playerIdentityResolution.ts) show up in
  // match_stats_cache automatically once reconciled, with no change needed
  // here. Rows synced before their name is reconciled just carry
  // player_id: null into the cache until the next sync — expected, not a bug.
  // .order() on batting/bowling matters even though ScorecardTables.tsx
  // also sorts client-side — without it the row order landing in
  // match_stats_cache (and therefore every other consumer of that jsonb
  // array) is whatever Postgres feels like returning, not the real
  // batting/bowling order.
  const [match, batting, bowling, fielding, team, fallOfWickets] = await Promise.all([
    analyticsSupabase.from('match_stats').select('*').eq('match_id', mid).single(),
    analyticsSupabase.from('batting_stats').select('*').eq('match_id', mid).order('batting_order', { ascending: true }),
    analyticsSupabase.from('bowling_stats').select('*').eq('match_id', mid).order('bowling_order', { ascending: true, nullsFirst: false }),
    analyticsSupabase.from('fielding_stats').select('*').eq('match_id', mid),
    analyticsSupabase.from('team_list').select('*').eq('match_id', mid),
    analyticsSupabase.from('fall_of_wickets').select('*').eq('match_id', mid).order('wicket_number', { ascending: true }),
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
    fall_of_wickets:  fallOfWickets.data ?? [],
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

  // Club recognition — best-effort, covers this sync regardless of whether
  // it was a manual click or the unattended cron path (both funnel through
  // this one function). Never allowed to fail the sync itself — see
  // src/lib/milestones.ts. Practice games (see features/leaderboard.md
  // §10) are excluded from most match-performance highlights, same as
  // every other "real stats" surface in this app — season milestones
  // already exclude them via getPlayerSeasonStats()'s own default scoping.
  // Century and five-wicket-haul are the exception (mirrors the Honour
  // Board's own carve-out, features/leaderboard.md §5.1) — those two are
  // still logged for a practice game; detectAndLogMatchPerformances()
  // enforces the narrower exclusion itself via the isPractice param.
  //
  // playerIds is resolved via this booking's own squad (resolveSquadMatch,
  // same helper computeTopPerformers()/computeMatchMVP() already use),
  // not just the analytics row's own player_id — a fresh sync almost
  // always predates /admin/player-reconciliation for that match's scorecard
  // names (see player-identity-resolution.md), so relying on raw
  // row.player_id alone left milestone/performance detection silently
  // no-op for every player in a newly-synced match, even ones whose name
  // matches the squad byte-for-byte. See the 9 Aug 2026 PSG Champions
  // Trophy incident in features/post-match-scorecard.md.
  const { data: squadRows } = await supabase
    .from('squad')
    .select('player_id, players(name)')
    .eq('booking_id', bookingId)
  const squad: SquadRef[] = (squadRows ?? []).map((r: any) => ({
    player_id:   r.player_id,
    player_name: r.players?.name ?? '',
  }))

  const year = parseInt(String(booking.game_date).slice(0, 4), 10)
  const playerIds = Array.from(new Set<string>(
    [...(batting.data ?? []), ...(bowling.data ?? []), ...(fielding.data ?? []), ...(team.data ?? [])]
      .map((r: any) => resolveSquadMatch(r, r.player_name, squad)?.player_id)
      .filter((id): id is string => Boolean(id))
  ))
  const tournamentRow = Array.isArray(booking.tournament) ? booking.tournament[0] : booking.tournament
  const isPractice = !!(tournamentRow as any)?.is_practice

  await Promise.all([
    detectAndLogMilestones(bookingId, year, playerIds),
    detectAndLogMatchPerformances(bookingId, batting.data ?? [], bowling.data ?? [], fielding.data ?? [], squad, isPractice),
  ])

  return { ok: true }
}
