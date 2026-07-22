// Booking Backfill — creates a Hub `bookings` row for a match that was
// already played on CricHeroes but never entered into Hub at all (e.g. it
// predates the Hub portal going live for that tournament, or was simply
// missed). This is a different gap from scorecardBackfill.ts: that
// pipeline assumes a booking already exists and only needs its scorecard
// parsed/synced. This one creates the booking itself, then hands off to
// the exact same parse+sync chain via backfillOneBooking().
//
// R1-R6 (src/lib/validation.ts) are deliberately never run here — those
// rules protect future ground-scheduling conflicts, which are meaningless
// for a match that already happened. The only scheduling-shaped guard that
// still applies is game_date < today, enforced below, so this path can
// never be used to sneak a future booking in under the guise of a backfill.
//
// Fees are never touched here either — same rule as scorecardBackfill.ts.

import { createServiceClient } from '@/lib/supabase'
import { backfillOneBooking, BackfillResult } from '@/lib/scorecardBackfill'

const MICROSERVICE_TIMEOUT_MS = 45_000

export interface BackfillPreview {
  match_id:        string
  opponent_name:   string | null
  ground:          string | null
  tournament_name: string | null
  match_type:      string | null
  game_date:       string | null // YYYY-MM-DD, best-effort parsed from CricHeroes' "date" text
  match_result:    string | null
}

async function callMicroservice(matchId: string, dryRun: boolean): Promise<any> {
  const microserviceUrl    = process.env.MICROSERVICE_URL
  const microserviceSecret = process.env.MICROSERVICE_SECRET
  if (!microserviceUrl || !microserviceSecret) {
    throw new Error('Analytics microservice is not configured')
  }

  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), MICROSERVICE_TIMEOUT_MS)
  let res: Response
  try {
    res = await fetch(`${microserviceUrl}/fetch-and-parse-scorecard`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json', 'x-secret': microserviceSecret },
      body:    JSON.stringify({ match_id: matchId, dry_run: dryRun }),
      signal:  controller.signal,
    })
  } catch (err: any) {
    const timedOut = err?.name === 'AbortError'
    throw new Error(timedOut
      ? `Microservice did not respond within ${MICROSERVICE_TIMEOUT_MS / 1000}s`
      : `Microservice unreachable: ${err?.message ?? 'unknown error'}`)
  } finally {
    clearTimeout(timeout)
  }

  if (!res.ok) {
    const errBody = await res.json().catch(() => ({} as any))
    throw new Error(errBody?.detail ?? `Microservice returned HTTP ${res.status}`)
  }
  return res.json()
}

// Always calls the microservice with dry_run: true — safe to call
// repeatedly, never writes to the analytics DB or Hub.
export async function previewBackfillMatch(matchId: string): Promise<BackfillPreview> {
  const parsed = await callMicroservice(matchId, true)
  const md = parsed?.match_details ?? {}

  // CricHeroes' own date field comes back as e.g. "2026-03-14 12:54 PM IST"
  // — never trust it to already be a clean YYYY-MM-DD.
  const rawDate = typeof md.date === 'string' ? md.date.split(' ')[0] : null
  const game_date = rawDate && /^\d{4}-\d{2}-\d{2}$/.test(rawDate) ? rawDate : null

  return {
    match_id:        parsed?.match_id ?? matchId,
    opponent_name:   md.opponent ?? null,
    ground:          md.ground ?? null,
    tournament_name: md.tournament_name ?? null,
    match_type:      md.match_type ?? null,
    game_date,
    match_result:    md.result ?? parsed?.match_result ?? null,
  }
}

export interface CreateBackfillBookingInput {
  match_id:      string
  tournament_id: string
  format:        'T20' | 'T30'
  slot_time:     string
}

export interface CreateBackfillBookingResult {
  ok:          boolean
  booking_id?: string
  error?:      string
  backfill?:   BackfillResult
}

// Confirm step — re-derives game_date/opponent/ground from CricHeroes
// itself server-side rather than trusting whatever the admin's browser
// last displayed from the preview call; only tournament_id, format, and
// slot_time (cosmetic labels the admin actually chooses) come from the client.
export async function createBackfillBooking(
  input: CreateBackfillBookingInput
): Promise<CreateBackfillBookingResult> {
  const supabase = createServiceClient()

  // Duplicate guard — match_id is the real "already backfilled" signal
  // here, not (game_date, slot_time), since slot_time is just a label.
  const { data: existing } = await supabase
    .from('bookings')
    .select('id')
    .eq('match_id', input.match_id)
    .maybeSingle()
  if (existing) {
    return { ok: false, error: `A booking already exists for match_id ${input.match_id}` }
  }

  const { data: tournament } = await supabase
    .from('tournaments')
    .select('id')
    .eq('id', input.tournament_id)
    .maybeSingle()
  if (!tournament) {
    return { ok: false, error: 'Tournament not found' }
  }

  let preview: BackfillPreview
  try {
    preview = await previewBackfillMatch(input.match_id)
  } catch (err: any) {
    return { ok: false, error: err?.message ?? 'Failed to fetch match from CricHeroes' }
  }

  if (!preview.game_date) {
    return { ok: false, error: 'Could not determine the match date from CricHeroes — cannot backfill' }
  }

  const today = new Date().toISOString().split('T')[0]
  if (preview.game_date >= today) {
    return { ok: false, error: 'This match is not in the past — booking backfill is for completed matches only' }
  }

  const { data: booking, error: insertErr } = await supabase
    .from('bookings')
    .insert({
      game_date:     preview.game_date,
      slot_time:     input.slot_time,
      format:        input.format,
      status:        'confirmed',
      tournament_id: input.tournament_id,
      opponent_name: preview.opponent_name,
      venue:         preview.ground,
      match_id:      input.match_id,
    })
    .select('id')
    .single()

  if (insertErr || !booking) {
    return { ok: false, error: insertErr?.message ?? 'Failed to create booking' }
  }

  // Chain straight into the existing parse+sync pipeline — identical to
  // what the daily cron does for a booking that already exists.
  const backfill = await backfillOneBooking(booking.id)
  return { ok: backfill.ok, booking_id: booking.id, backfill }
}
