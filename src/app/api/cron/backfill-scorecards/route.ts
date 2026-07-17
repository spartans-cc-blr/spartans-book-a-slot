import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase'
import { notifyGCs } from '@/lib/webpush'
import { backfillOneBooking } from '@/lib/scorecardBackfill'

export const dynamic = 'force-dynamic'
export const revalidate = 0
export const maxDuration = 60

// Runs daily at 01:30 UTC = 07:00 IST. All Spartans matches are Sat/Sun
// (see architecture.md — bookings.game_date is weekend-only), so a daily
// run reliably catches "yesterday" the morning after every match day.
// vercel.json entry: { "path": "/api/cron/backfill-scorecards", "schedule": "30 1 * * *" }
//
// Deliberately queries ALL past unsynced bookings, not just "yesterday" —
// if a run gets cut short (Vercel's hard ceiling) or a fetch keeps failing,
// the leftover bookings just get picked up by tomorrow's run instead of
// being permanently skipped. MAX_PER_RUN bounds each individual run's
// duration; a backlog beyond that drains a few more each day until clear.
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
    .select('id, opponent_name, game_date, match_id, scorecard_uploads(status)')
    .eq('status', 'confirmed')
    .lt('game_date', today)
    .not('match_id', 'is', null)
    .order('game_date', { ascending: false })
    .limit(50) // upper bound on the query itself; MAX_PER_RUN caps what we actually process

  if (error) {
    await notifyGCs('⚠️ Scorecard Backfill — Query Failed', `Cron error: ${error.message}`, '/admin/scorecard-backfill', false)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  const eligible = (bookings ?? [])
    .map((b: any) => ({
      ...b,
      su: Array.isArray(b.scorecard_uploads) ? b.scorecard_uploads[0] : b.scorecard_uploads,
    }))
    .filter(b => !b.su || !['synced', 'fees_applied'].includes(b.su.status))
    .slice(0, MAX_PER_RUN)

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
