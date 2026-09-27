import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase'
import { notifyGCs } from '@/lib/webpush'
import { backfillOneBooking } from '@/lib/scorecardBackfill'
import { hasMatchEnded } from '@/lib/matchStatus'

export const dynamic = 'force-dynamic'
export const revalidate = 0
export const maxDuration = 60

// Twice daily, 13:00 & 19:00 IST — the GitHub Actions workflow
// (.github/workflows/cron-backfill-scorecards.yml) is the primary trigger;
// vercel.json only ever carries a single-fire backup at 19:00 IST
// ("30 13 * * *" UTC) since Vercel Hobby caps a cron job at one
// invocation/day. See architecture.md §5 and limitations.md.
//
// Deliberately queries ALL past-or-ended unsynced bookings, not just
// "yesterday" — if a run gets cut short (Vercel's hard ceiling) or a fetch
// keeps failing, the leftover bookings just get picked up by tomorrow's run
// instead of being permanently skipped. MAX_PER_RUN bounds each individual
// run's duration; a backlog beyond that drains a few more each day until
// clear.
//
// Lowered from 5 to 3 on 2026-07-16 — a live manual run timed out
// (504 FUNCTION_INVOCATION_TIMEOUT) after completing exactly 3 bookings and
// starting a 4th. Lowered again to 2 on 2026-07-17 — even 3 wasn't safe: a
// scheduled run that day 504'd mid-fetch on the 3rd booking (2/3 synced, one
// left at pending_parse to retry next run). Per-item latency against the
// Render microservice + CricHeroes PDF fetch is variable enough that 2 is
// the first value that's actually held up under a real timeout.
const MAX_PER_RUN = 2

// Respectful pacing between CricHeroes fetches — same spirit as the
// wrangler's standalone download_scorecard.py script.
const DELAY_BETWEEN_MS = 3000

export async function GET(req: NextRequest) {
  const authHeader = req.headers.get('authorization')
  if (authHeader?.trim() !== `Bearer ${process.env.CRON_SECRET?.trim()}`) {
    return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })
  }

  const supabase = createServiceClient()
  const today = new Date().toISOString().split('T')[0]

  const { data: bookings, error } = await supabase
    .from('bookings')
    .select('id, opponent_name, game_date, slot_time, format, match_id, scorecard_uploads(status, needs_reconciliation)')
    .eq('status', 'confirmed')
    .lte('game_date', today)
    .not('match_id', 'is', null)
    // Newest-first (changed 2026-09-27, reversing an earlier oldest-first
    // fix — see below). MAX_PER_RUN only lets a couple of bookings through
    // per run, so ordering is what actually decides which ones get skipped
    // this time; per a direct request, the most recently played match should
    // always be the first one attempted, ahead of older backlog.
    //
    // Known tradeoff, carried over from the oldest-first design this
    // replaces: a match that *just* ended usually isn't posted on CricHeroes
    // yet (see the "Match not yet completed" / a fetch failure just after
    // match end, further down), so putting it first can occasionally burn
    // one of the scarce MAX_PER_RUN slots on a guaranteed-to-fail fetch,
    // bumping a genuinely-ready older booking to the next run. Accepted as
    // the smaller cost — the backlog this run actually drains (reconciliation
    // re-flags, historical gaps) is always well past match day, so this only
    // ever bites a match still within its first few hours of being over.
    // slot_time is a secondary tiebreaker so two same-day matches process in
    // the order they were actually played (also newest-first).
    .order('game_date', { ascending: false })
    .order('slot_time', { ascending: false })
    // NOTE: this limit applies BEFORE the in-memory sync-status filter below.
    // With newest-first ordering, a too-small limit only ever truncates the
    // oldest tail of history (harmless — that's exactly the backlog that
    // still gets picked up on a later run once the fresher rows ahead of it
    // are synced) rather than starving the query of the recent rows that
    // actually matter, the way it would have under the old oldest-first
    // order. 500 is well above the club's total match history (~100
    // confirmed bookings as of Aug 2026) with years of headroom; MAX_PER_RUN
    // is what actually bounds how many get processed per run.
    .limit(500)

  if (error) {
    await notifyGCs('⚠️ Scorecard Backfill — Query Failed', `Cron error: ${error.message}`, '/admin/scorecard-backfill', false)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  // A booking is eligible either the normal way (never synced) or because a
  // captain/VC/wrangler/admin flagged it for reconciliation — see
  // features/post-match-scorecard.md and flag-reconciliation/route.ts. A
  // flagged booking jumps the queue (sorted first) since a human already
  // singled it out as wrong, ahead of routine never-synced backlog.
  //
  // game_date alone can't tell "starts later today" apart from "already
  // finished" — same gap src/lib/matchStatus.ts was written to close for
  // /fixtures and /api/matches/history. Without the hasMatchEnded() check
  // here, a match played earlier today (e.g. the 07:30 slot, already over
  // by a 19:00 IST run) was silently excluded until the calendar date rolled
  // over — sometimes a full day-plus of unnecessary delay before its
  // scorecard was ever fetched.
  const withFlag = (bookings ?? [])
    .map((b: any) => ({
      ...b,
      su: Array.isArray(b.scorecard_uploads) ? b.scorecard_uploads[0] : b.scorecard_uploads,
    }))
    .filter(b => b.game_date < today || hasMatchEnded(b.game_date, b.slot_time, b.format))
    .filter(b => !b.su || !['synced', 'fees_applied'].includes(b.su.status) || b.su.needs_reconciliation)

  const eligible = [
    ...withFlag.filter(b => b.su?.needs_reconciliation),
    ...withFlag.filter(b => !b.su?.needs_reconciliation),
  ].slice(0, MAX_PER_RUN)

  if (eligible.length === 0) {
    return NextResponse.json({ processed: 0, succeeded: 0, failed: 0, results: [] })
  }

  const results: { booking_id: string; match_id: string | null; opponent_name: string | null; ok: boolean; parsed: boolean; synced: boolean; error?: string }[] = []

  for (let i = 0; i < eligible.length; i++) {
    const result = await backfillOneBooking(eligible[i].id)
    results.push({ ...result, opponent_name: eligible[i].opponent_name })
    if (i < eligible.length - 1) {
      await new Promise(r => setTimeout(r, DELAY_BETWEEN_MS))
    }
  }

  const succeeded = results.filter(r => r.ok)
  const failed    = results.filter(r => !r.ok)

  // Parse and sync into match_stats_cache both happen automatically now —
  // this nudge is just visibility, not a "please go sync this" action item.
  // Fees are deliberately never touched here; that stays a separate manual
  // step regardless of how a match got synced.
  if (succeeded.length > 0) {
    await notifyGCs(
      '📥 Scorecards Synced',
      `${succeeded.length} scorecard${succeeded.length > 1 ? 's' : ''} auto-fetched from CricHeroes and synced.`,
      '/matches/history',
      false
    )
  }
  if (failed.length > 0) {
    await notifyGCs(
      '⚠️ Scorecard Backfill — Some Failed',
      failed.map(f => `${f.opponent_name ?? f.booking_id}: ${f.error}`).join(' · '),
      '/admin/scorecard-backfill',
      false
    )
  }

  return NextResponse.json({ processed: results.length, succeeded: succeeded.length, failed: failed.length, results })
}
