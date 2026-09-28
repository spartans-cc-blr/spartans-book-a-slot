// Shared core for both the one-time admin backfill UI and the daily cron —
// processes a single booking: fetch its scorecard directly from CricHeroes
// via the analytics microservice's /fetch-and-parse-scorecard, mirror the
// exact same scorecard_uploads status machine the manual upload route
// (src/app/api/matches/[id]/scorecard/route.ts) uses, then also sync into
// match_stats_cache automatically — parse and sync are both seamless here.
//
// Fees are deliberately NEVER touched by this pipeline. /api/fees/apply
// stays a fully separate, manual-only action — past match fees are handled
// through a different Hub-sheet export/import process, and future fees
// should always be an explicit admin decision, not something a cron
// triggers on a schedule.
//
// A failure at the parse step lands in the same 'pending_parse' +
// error_message state a failed manual upload would, so the existing
// "Stuck? Retry upload" affordance and the admin Post-Match panel both
// already know how to surface and recover from it — no new UI needed for
// that failure path. A failure at the sync step leaves the booking at
// 'parsed', same as if an admin had uploaded manually and just not
// clicked "Sync Stats" yet — also already-handled UI.

import { createServiceClient } from '@/lib/supabase'
import { syncMatchStatsForBooking } from '@/lib/matchStatsSync'
import { hasMatchEnded } from '@/lib/matchStatus'

const MICROSERVICE_TIMEOUT_MS = 45_000

export interface BackfillResult {
  booking_id: string
  match_id:   string | null
  ok:         boolean  // true only if BOTH parse and sync succeeded
  parsed:     boolean
  synced:     boolean
  error?:     string
}

export async function backfillOneBooking(bookingId: string): Promise<BackfillResult> {
  const supabase = createServiceClient()

  const { data: booking, error: bookingErr } = await supabase
    .from('bookings')
    .select('id, match_id, game_date, slot_time, format, status')
    .eq('id', bookingId)
    .eq('status', 'confirmed')
    .single()

  if (bookingErr || !booking) {
    return { booking_id: bookingId, match_id: null, ok: false, parsed: false, synced: false, error: 'Booking not found' }
  }
  if (!booking.match_id) {
    return { booking_id: bookingId, match_id: null, ok: false, parsed: false, synced: false, error: 'No match_id set on this booking' }
  }

  if (!hasMatchEnded(booking.game_date, booking.slot_time, booking.format)) {
    return { booking_id: bookingId, match_id: booking.match_id, ok: false, parsed: false, synced: false, error: 'Match not yet completed' }
  }

  const microserviceUrl    = process.env.MICROSERVICE_URL
  const microserviceSecret = process.env.MICROSERVICE_SECRET
  if (!microserviceUrl || !microserviceSecret) {
    return { booking_id: bookingId, match_id: booking.match_id, ok: false, parsed: false, synced: false, error: 'Analytics microservice is not configured' }
  }

  await supabase.from('scorecard_uploads').upsert({
    booking_id:    bookingId,
    match_id:      booking.match_id,
    status:        'pending_parse',
    uploaded_by:   null, // no human uploader — this run was automated
    uploaded_at:   new Date().toISOString(),
    error_message: null,
  }, { onConflict: 'booking_id' })

  let msRes: Response
  try {
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), MICROSERVICE_TIMEOUT_MS)
    try {
      msRes = await fetch(`${microserviceUrl}/fetch-and-parse-scorecard`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json', 'x-secret': microserviceSecret },
        body:    JSON.stringify({ match_id: booking.match_id, dry_run: false }),
        signal:  controller.signal,
      })
    } finally {
      clearTimeout(timeout)
    }
  } catch (err: any) {
    const timedOut = err?.name === 'AbortError'
    const message = timedOut
      ? `Microservice did not respond within ${MICROSERVICE_TIMEOUT_MS / 1000}s`
      : `Microservice unreachable: ${err?.message ?? 'unknown error'}`
    await supabase.from('scorecard_uploads').update({ error_message: message }).eq('booking_id', bookingId)
    return { booking_id: bookingId, match_id: booking.match_id, ok: false, parsed: false, synced: false, error: message }
  }

  if (!msRes.ok) {
    // A genuine CricHeroes-side error (404/429/502 — see api.py's own
    // fetch_and_parse_scorecard) always comes back as JSON with a `detail`
    // field, so `errBody?.detail` covers the expected case below unchanged.
    // When it's absent, the response almost certainly never reached our
    // FastAPI app at all — something in front of it (most likely Render's
    // own free-tier edge, rejecting a request before the app sees it)
    // answered instead. Read the raw body via .text() first (not .json()
    // directly) so a non-JSON response — the exact signature of an
    // infra-level rejection — doesn't just collapse into an empty {} and
    // get thrown away; it's surfaced straight into error_message instead,
    // so scorecard_uploads itself becomes the diagnostic without needing
    // to go dig through Render/Vercel's own log UIs. Reported live
    // 2026-09-28: a persistent bare "Microservice returned HTTP 429" with
    // Render's deploy independently confirmed current and Live — this is
    // the fallback that error was always hitting, and it never said what
    // Render's edge actually sent back.
    const rawText = await msRes.text().catch(() => '')
    let detail: string | undefined
    try {
      detail = rawText ? JSON.parse(rawText)?.detail : undefined
    } catch {
      // Not JSON — confirms this didn't come from our own app's error handling.
    }
    const serverHeader = msRes.headers.get('server')
    const diagnosticBits = [
      !detail && rawText ? `raw: ${rawText.slice(0, 200)}` : null,
      serverHeader ? `server header: ${serverHeader}` : null,
    ].filter(Boolean).join(' · ')
    const message = detail
      ?? (diagnosticBits ? `Microservice returned HTTP ${msRes.status} (${diagnosticBits})` : `Microservice returned HTTP ${msRes.status}`)
    await supabase.from('scorecard_uploads').update({ error_message: message }).eq('booking_id', bookingId)
    return { booking_id: bookingId, match_id: booking.match_id, ok: false, parsed: false, synced: false, error: message }
  }

  const { error: statusErr } = await supabase
    .from('scorecard_uploads')
    .update({ status: 'parsed' })
    .eq('booking_id', bookingId)

  if (statusErr) {
    return { booking_id: bookingId, match_id: booking.match_id, ok: false, parsed: false, synced: false, error: statusErr.message }
  }

  // Parse succeeded — immediately attempt the sync step too, so the whole
  // pipeline is seamless end-to-end. A sync failure here is non-fatal to the
  // overall parse result: the booking is left at 'parsed' status, exactly
  // where a manual upload would leave it before an admin clicks "Sync
  // Stats" — the existing UI already knows how to surface and retry that.
  const syncResult = await syncMatchStatsForBooking(bookingId, null)
  if (!syncResult.ok) {
    return {
      booking_id: bookingId,
      match_id:   booking.match_id,
      ok:         false,
      parsed:     true,
      synced:     false,
      error:      `Parsed OK, but sync failed: ${syncResult.error}`,
    }
  }

  // A successful re-sync is what "resolves" a reconciliation flag — the
  // whole point of flagging was "the stats look wrong", and a fresh sync
  // just replaced them. Only fires when a flag was actually present (the
  // .eq('needs_reconciliation', true) makes this a no-op, with no log
  // noise, on the overwhelming majority of runs where nothing was flagged).
  // See src/app/api/matches/[id]/flag-reconciliation/route.ts for the
  // human-driven flag/resolve paths this mirrors.
  const { data: clearedFlag } = await supabase
    .from('scorecard_uploads')
    .update({
      needs_reconciliation:      false,
      reconciliation_note:       null,
      reconciliation_flagged_by: null,
      reconciliation_flagged_at: null,
    })
    .eq('booking_id', bookingId)
    .eq('needs_reconciliation', true)
    .select('id')

  if (clearedFlag && clearedFlag.length > 0) {
    await supabase.from('scorecard_reconciliation_log').insert({
      booking_id: bookingId,
      action:     'resolved',
      note:       'Auto-resolved — scorecard re-fetched and re-synced successfully',
      actor_id:   null, // null = system, not a human admin action
    })
  }

  return { booking_id: bookingId, match_id: booking.match_id, ok: true, parsed: true, synced: true }
}
