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
import { redis } from '@/lib/rateLimit'

const MICROSERVICE_TIMEOUT_MS = 45_000

// previewBackfillMatch() is called twice per backfill — once for the
// explicit "Preview" click, and again inside createBackfillBooking() to
// re-derive game_date/opponent/ground server-side rather than trust
// whatever the admin's browser last displayed (see that function's own
// comment). Both calls hit CricHeroes's PDF endpoint via the same shared
// Render microservice that the daily backfill-scorecards cron and the
// Scorecard Backfill admin page also use — all CricHeroes-facing traffic in
// this app draws on one throttle budget, and CricHeroes has been observed
// returning 429 ("Rate limited by CricHeroes") to that endpoint (see
// api.py's fetch-and-parse-scorecard). A single Preview-then-Create cycle
// for one match was tripling that exposure for no real benefit, since the
// second fetch almost always returns byte-identical data to the first,
// seconds to minutes earlier.
//
// This cache closes that gap WITHOUT weakening the "re-derive from
// CricHeroes, never from the client" guarantee: the cached value is still
// the server's own prior CricHeroes response, not anything the browser
// supplied. A short TTL keeps it safe — long enough to cover normal
// Preview-review-pick-tournament-then-Create human pacing, short enough
// that a genuinely stale preview (admin walks away, comes back much later)
// still forces a fresh fetch before writing, exactly as before this change.
const PREVIEW_CACHE_TTL_SECONDS = 10 * 60
const previewCacheKey = (matchId: string) => `spartans:booking-backfill-preview:${matchId}`

export interface BackfillPreview {
  match_id:        string
  opponent_name:   string | null
  ground:          string | null
  tournament_name: string | null
  match_type:      string | null
  game_date:       string | null // YYYY-MM-DD, best-effort parsed from CricHeroes' "date" text
  match_result:    string | null
  // Raw per-player breakdown straight from the microservice, unfiltered —
  // surfaced so a stuck/zeroed player row (e.g. an extraction bug in
  // field_extractors.py) can be diagnosed from a dry-run preview alone,
  // without needing to add debug logging on the Python side first.
  player_stats:    Record<string, Record<string, any>> | null
  team_lists:      Record<string, string[]> | null
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
// repeatedly, never writes to the analytics DB or Hub. Cached briefly (see
// PREVIEW_CACHE_TTL_SECONDS above) so the explicit "Preview" click and
// createBackfillBooking()'s own internal re-derivation don't each cost a
// separate CricHeroes fetch for the same match_id.
export async function previewBackfillMatch(matchId: string): Promise<BackfillPreview> {
  const cacheKey = previewCacheKey(matchId)

  try {
    const cached = await redis.get<BackfillPreview>(cacheKey)
    if (cached) return cached
  } catch (err) {
    // Fail open — a cache read error should never block a preview, it
    // just means this call pays for a fresh CricHeroes fetch like before.
    console.error('[bookingBackfill] preview cache read failed:', err)
  }

  const parsed = await callMicroservice(matchId, true)
  const md = parsed?.match_details ?? {}

  // CricHeroes' own date field comes back as e.g. "2026-03-14 12:54 PM IST"
  // — never trust it to already be a clean YYYY-MM-DD.
  const rawDate = typeof md.date === 'string' ? md.date.split(' ')[0] : null
  const game_date = rawDate && /^\d{4}-\d{2}-\d{2}$/.test(rawDate) ? rawDate : null

  const preview: BackfillPreview = {
    match_id:        parsed?.match_id ?? matchId,
    opponent_name:   md.opponent ?? null,
    ground:          md.ground ?? null,
    tournament_name: md.tournament_name ?? null,
    match_type:      md.match_type ?? null,
    game_date,
    match_result:    md.result ?? parsed?.match_result ?? null,
    player_stats:    parsed?.player_stats ?? null,
    team_lists:      parsed?.team_lists ?? null,
  }

  try {
    await redis.set(cacheKey, preview, { ex: PREVIEW_CACHE_TTL_SECONDS })
  } catch (err) {
    // Fail open — caching is purely an optimisation; losing it just means
    // the next call (Create's own re-derivation) pays for a fresh fetch.
    console.error('[bookingBackfill] preview cache write failed:', err)
  }

  return preview
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

export interface CreateManualBackfillBookingInput {
  match_id:      string
  tournament_id: string
  format:        'T20' | 'T30'
  slot_time:     string
  // Admin-supplied because CricHeroes can't be reached right now to
  // re-derive these (see the file-level comment on this function).
  game_date:     string // YYYY-MM-DD
  opponent_name: string | null
}

// Fallback for when CricHeroes is rate-limiting (or otherwise unreachable)
// and createBackfillBooking() above can't even get a preview, let alone
// re-derive game_date/opponent/ground to write a real booking. Rather than
// retry the CricHeroes fetch synchronously, this creates the booking row
// directly from admin-supplied fields and deliberately does NOT call
// backfillOneBooking() — no CricHeroes request is made at all here.
//
// The booking is left exactly as any other confirmed booking with a real
// match_id and no synced scorecard yet — the same shape the existing
// self-healing backfill-scorecards cron already looks for (see
// features/post-match-scorecard.md §8's eligibility query: confirmed,
// non-practice, has match_id, not yet synced/fees_applied). Its next run
// (13:00/19:00 IST) will pick this booking up and attempt the real parse+
// sync itself — benefiting from whatever CricHeroes-side cooldown has
// elapsed by then — with no new queue table or scheduling logic needed.
// An admin can also drive it immediately from /admin/scorecard-backfill,
// which already lists exactly this class of booking.
//
// Still re-validates everything that doesn't require CricHeroes: the
// duplicate-match_id guard, that the tournament exists, and that game_date
// is genuinely in the past (this route is for backfilling completed
// matches only, same rule createBackfillBooking() enforces — it's just
// checked against the admin's own typed date here instead of CricHeroes'
// own "date" field, since there is no CricHeroes response to check it
// against). opponent_name is accepted as freely as venue/notes already
// are elsewhere on a booking — descriptive text, not a security boundary.
export async function createManualBackfillBooking(
  input: CreateManualBackfillBookingInput
): Promise<CreateBackfillBookingResult> {
  const supabase = createServiceClient()

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

  const today = new Date().toISOString().split('T')[0]
  if (input.game_date >= today) {
    return { ok: false, error: 'This match is not in the past — booking backfill is for completed matches only' }
  }

  const { data: booking, error: insertErr } = await supabase
    .from('bookings')
    .insert({
      game_date:     input.game_date,
      slot_time:     input.slot_time,
      format:        input.format,
      status:        'confirmed',
      tournament_id: input.tournament_id,
      opponent_name: input.opponent_name,
      match_id:      input.match_id,
    })
    .select('id')
    .single()

  if (insertErr || !booking) {
    return { ok: false, error: insertErr?.message ?? 'Failed to create booking' }
  }

  // Deliberately no backfillOneBooking() call here — see the function
  // comment above. The booking now simply exists, unsynced, which is all
  // "queued for the cron" means in this app — no separate queue table.
  return { ok: true, booking_id: booking.id }
}
