// Shared core for both the one-time admin backfill UI and the daily cron —
// processes a single booking: fetch its scorecard directly from CricHeroes
// via the analytics microservice's /fetch-and-parse-scorecard, and mirror
// the exact same scorecard_uploads status machine the manual upload route
// (src/app/api/matches/[id]/scorecard/route.ts) uses. A failure here lands
// in the same 'pending_parse' + error_message state a failed manual upload
// would, so the existing "Stuck? Retry upload" affordance and the admin
// Post-Match panel both already know how to surface and recover from it —
// no new UI needed for the failure path.

import { createServiceClient } from '@/lib/supabase'

const MICROSERVICE_TIMEOUT_MS = 45_000

export interface BackfillResult {
  booking_id: string
  match_id:   string | null
  ok:         boolean
  error?:     string
}

export async function backfillOneBooking(bookingId: string): Promise<BackfillResult> {
  const supabase = createServiceClient()

  const { data: booking, error: bookingErr } = await supabase
    .from('bookings')
    .select('id, match_id, game_date, status')
    .eq('id', bookingId)
    .eq('status', 'confirmed')
    .single()

  if (bookingErr || !booking) {
    return { booking_id: bookingId, match_id: null, ok: false, error: 'Booking not found' }
  }
  if (!booking.match_id) {
    return { booking_id: bookingId, match_id: null, ok: false, error: 'No match_id set on this booking' }
  }

  const today = new Date().toISOString().split('T')[0]
  if (booking.game_date >= today) {
    return { booking_id: bookingId, match_id: booking.match_id, ok: false, error: 'Match not yet completed' }
  }

  const microserviceUrl    = process.env.MICROSERVICE_URL
  const microserviceSecret = process.env.MICROSERVICE_SECRET
  if (!microserviceUrl || !microserviceSecret) {
    return { booking_id: bookingId, match_id: booking.match_id, ok: false, error: 'Analytics microservice is not configured' }
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
    return { booking_id: bookingId, match_id: booking.match_id, ok: false, error: message }
  }

  if (!msRes.ok) {
    const errBody = await msRes.json().catch(() => ({} as any))
    const message = errBody?.detail ?? `Microservice returned HTTP ${msRes.status}`
    await supabase.from('scorecard_uploads').update({ error_message: message }).eq('booking_id', bookingId)
    return { booking_id: bookingId, match_id: booking.match_id, ok: false, error: message }
  }

  const { error: statusErr } = await supabase
    .from('scorecard_uploads')
    .update({ status: 'parsed' })
    .eq('booking_id', bookingId)

  if (statusErr) {
    return { booking_id: bookingId, match_id: booking.match_id, ok: false, error: statusErr.message }
  }

  return { booking_id: bookingId, match_id: booking.match_id, ok: true }
}
