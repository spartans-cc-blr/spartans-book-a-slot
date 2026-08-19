// getSuggestedOpenDates — shared core behind /api/tournaments/[id]/suggested-slots
// (GC/Admin panel) and the public tournament share page's "Next available
// dates" section. Both callers need the exact same algorithm so a date
// offered to an organiser publicly never contradicts what GC/Admin would
// see, or what the admin booking form would actually accept.
//
// Finds upcoming (Sat/Sun) DAYS for a tournament — up to `maxSuggestions`
// (defaults to total_league_games minus confirmed games, capped at
// MAX_SUGGESTIONS_CAP) — that pass the same R1-R6 booking rules engine used
// by the admin booking form (src/lib/validation.ts), reused as-is here
// rather than reimplemented, so a suggestion can never contradict what the
// form would actually accept.
//
// Only days with NO existing booking at all (any status, any slot_time) are
// candidates — a day that already has one game on it is deliberately never
// suggested, even if another slot_time on that same day is technically
// still open. Restricting to wide-open days keeps the list simple to reason
// about — every suggested date really is a clean slate.
//
// The result only ever returns dates (game_date/day), never a slot_time —
// every candidate day is fully open, so any slot_time on it would work.
// slot_time/format are still used internally to rank and validate
// candidates against R1-R6 (a day still needs at least one concrete
// slot_time/format to check), but surfacing the one we happened to pick
// would wrongly read as "this is the time," when really the whole day is
// free. Ranking still prefers this tournament's own least-used slot_time
// as an internal tie-break, purely to keep its eventual slot spread
// balanced once a real time is chosen at booking time.
//
// Suggestions are selected incrementally: each accepted candidate is folded
// into the working "existing bookings" set before the next candidate is
// checked, so all suggestions remain mutually valid if the organiser books
// all of them (otherwise two suggestions from the same weekend could each
// look valid alone while jointly breaking R1's weekend cap).
//
// R3 (max 2 confirmed games per tournament per calendar month) is the one
// exception to "fold every accepted pick into the working set": a suggestion
// isn't a booking, so two suggested dates in the same month must not, by
// themselves, disqualify a third open date in that month from ever being
// offered — there's no guarantee the organiser takes both of the earlier
// ones. R3 is instead checked against real confirmed bookings only, with a
// small buffer (MAX_SUGGESTIONS_PER_MONTH) so a month doesn't flood with
// more alternatives than could plausibly ever get booked. The result flags
// any month whose suggestion count already exceeds R3's real cap so a
// caller can tell the organiser only some of them are actually bookable.

import { parseISO } from 'date-fns'
import { createServiceClient } from '@/lib/supabase'
import { validateBooking, getYearMonth } from '@/lib/validation'
import { ALL_SLOTS, distributeSlotTargets } from '@/lib/slotTargets'
import type { SlotKey } from '@/lib/slotTargets'
import type { CreateBookingRequest, GameFormat, SlotTime } from '@/types'

const SLOT_DEFS: { time: SlotTime; validFor: GameFormat[] }[] = [
  { time: '07:30', validFor: ['T20', 'T30'] },
  { time: '10:30', validFor: ['T20'] },
  { time: '12:30', validFor: ['T30'] },
  { time: '14:30', validFor: ['T20'] },
]

const HORIZON_WEEKS = 16
// Fallback when a tournament has no total_league_games set and no explicit
// maxSuggestions override was passed.
const DEFAULT_SUGGESTIONS = 3
// Hard ceiling regardless of how large the requested/unbooked count is, so
// a mis-entered total_league_games (or a caller passing a large override)
// can't blow up the horizon scan.
const MAX_SUGGESTIONS_CAP = 12
// R3's real cap (2) plus one backup alternative — a month can offer up to
// this many suggested dates even though only R3_MONTHLY_CAP of them could
// actually be booked, since we don't know in advance which ones the
// organiser will take.
export const R3_MONTHLY_CAP = 2
const MAX_SUGGESTIONS_PER_MONTH = R3_MONTHLY_CAP + 1

function addDays(d: Date, n: number): Date {
  const r = new Date(d)
  r.setDate(r.getDate() + n)
  return r
}
function toISODate(d: Date): string {
  return d.toISOString().split('T')[0]
}

// ── Weekend-gap helpers (getSuggestedSlotDates / findNextSlotDate) ──────
// A tournament's own games are meant to be spread across the season, not
// clustered — R1-R7 only cap club-wide weekend capacity and never stop two
// slot-bucket suggestions for the SAME tournament landing on the same
// weekend, or on back-to-back weekends. `weekendAnchor` maps both Saturday
// and Sunday of a weekend to the same key (the Saturday date); blocking a
// date's anchor plus the week before and after enforces "at least one clear
// weekend gap" between any two of this tournament's own dates.
function weekendAnchor(dateStr: string): string {
  const d = parseISO(dateStr)
  const dow = d.getDay()
  const sat = dow === 0 ? addDays(d, -1) : d // Sunday -> the Saturday before it
  return toISODate(sat)
}

function blockSurroundingWeeks(blocked: Set<string>, dateStr: string): void {
  const anchor = parseISO(weekendAnchor(dateStr))
  blocked.add(toISODate(anchor))
  blocked.add(toISODate(addDays(anchor, -7)))
  blocked.add(toISODate(addDays(anchor, 7)))
}

export interface SuggestedDate {
  game_date: string
  day: 'Sat' | 'Sun'
}

export type SuggestedOpenDatesResult =
  | { ok: true; suggestions: SuggestedDate[]; monthlyCap: number; overCapMonths: string[] }
  | { ok: false; error: string; status: number }

export async function getSuggestedOpenDates(
  tournamentId: string,
  maxSuggestions?: number
): Promise<SuggestedOpenDatesResult> {
  const supabase = createServiceClient()

  const { data: tournament, error: tErr } = await supabase
    .from('tournaments')
    .select('id, name, captain_id, total_league_games, captains!tournaments_captain_id_fkey(id, name, player_id)')
    .eq('id', tournamentId)
    .single()

  if (tErr || !tournament) {
    return { ok: false, error: 'Tournament not found', status: 404 }
  }

  const thisTournamentCaptainId = tournament.captain_id ?? null
  const thisTournamentCaptainPlayerId = (tournament.captains as any)?.player_id ?? null
  const captainName = (tournament.captains as any)?.name ?? 'This captain'
  const tournamentName = tournament.name

  const today = new Date()
  today.setHours(0, 0, 0, 0)
  // Start from the next Saturday strictly after today — never suggest a same-day slot.
  let firstSat = addDays(today, (6 - today.getDay() + 7) % 7)
  if (toISODate(firstSat) === toISODate(today)) firstSat = addDays(firstSat, 7)
  const horizonEnd = addDays(firstSat, HORIZON_WEEKS * 7)

  // Days the leading captain has pre-marked themselves fully unavailable
  // (player_future_availability) — dropped from candidates entirely below.
  // Deliberately requires ALL 4 slot_times to be 'L' for that date, not just
  // some — a captain who's L for some slots but not others still gets the
  // day offered; the exact-slot check happens at actual booking time
  // instead (see validateBooking's R8, src/lib/validation.ts).
  const fullyUnavailableDates = new Set<string>()
  if (thisTournamentCaptainPlayerId) {
    const { data: captainFutureRows } = await supabase
      .from('player_future_availability')
      .select('game_date, slot_time, response')
      .eq('player_id', thisTournamentCaptainPlayerId)
      .gte('game_date', toISODate(firstSat))
      .lte('game_date', toISODate(horizonEnd))

    const leaveSlotsByDate: Record<string, Set<string>> = {}
    for (const row of captainFutureRows ?? []) {
      if (row.response !== 'L') continue
      if (!leaveSlotsByDate[row.game_date]) leaveSlotsByDate[row.game_date] = new Set()
      leaveSlotsByDate[row.game_date].add(row.slot_time)
    }
    for (const [date, slots] of Object.entries(leaveSlotsByDate)) {
      if (SLOT_DEFS.every(s => slots.has(s.time))) fullyUnavailableDates.add(date)
    }
  }

  // This tournament's own confirmed games — used to rank candidate slots by
  // how under-used they are for THIS tournament specifically, and to find
  // the latest one already on the calendar (see latestOwnBookingDate below).
  const { data: ownGames, error: ownErr } = await supabase
    .from('bookings')
    .select('game_date, slot_time, format')
    .eq('tournament_id', tournamentId)
    .eq('status', 'confirmed')

  if (ownErr) return { ok: false, error: ownErr.message, status: 500 }

  const ownSlotCounts: Record<string, number> = {}
  for (const g of ownGames ?? []) {
    ownSlotCounts[g.slot_time] = (ownSlotCounts[g.slot_time] ?? 0) + 1
  }
  const activeFormats = Array.from(new Set(
    (ownGames ?? []).map(g => g.format).filter((f): f is GameFormat => !!f)
  ))

  // Latest date already on this tournament's own calendar (scheduled or
  // completed) — candidates on or before it are excluded below. Without
  // this, an earlier open weekend that happened to sit between two
  // already-scheduled games (e.g. 16 Aug, when the tournament already has
  // a game on 13 Sep) would get suggested — technically valid, but not
  // useful: suggestions should continue the season forward from whatever's
  // already locked in, not backfill gaps the organiser already scheduled
  // around.
  const latestOwnBookingDate = (ownGames ?? []).reduce<string | null>(
    (max, g) => (max === null || g.game_date > max ? g.game_date : max), null
  )

  // Match the unbooked count shown elsewhere on the page (total_league_games
  // minus confirmed games) unless the caller passed an explicit override —
  // a tournament with 4 games still unbooked should get up to 4 suggestions
  // by default, not just 3.
  const unbookedCount = maxSuggestions ?? (tournament.total_league_games != null
    ? Math.max(0, tournament.total_league_games - (ownGames ?? []).length)
    : DEFAULT_SUGGESTIONS)
  const MAX_SUGGESTIONS = Math.min(unbookedCount, MAX_SUGGESTIONS_CAP)

  // All non-cancelled bookings within the suggestion horizon, club-wide —
  // R1/R4/R5/R6 depend on every booking that day/weekend, not just this
  // tournament's, and R3's monthly cap needs this tournament's games within
  // the horizon too (already covered since tournament_id is on every row).
  const { data: existingRaw, error: existingErr } = await supabase
    .from('bookings')
    .select('*, tournament:tournaments!bookings_tournament_id_fkey(id, name, captain_id)')
    .neq('status', 'cancelled')
    .gte('game_date', toISODate(firstSat))
    .lte('game_date', toISODate(horizonEnd))

  if (existingErr) return { ok: false, error: existingErr.message, status: 500 }

  const existing = (existingRaw ?? []).map((b: any) => ({
    ...b,
    tournament: Array.isArray(b.tournament) ? b.tournament[0] ?? null : b.tournament,
  }))

  // Days with any existing booking at all (any slot_time, any status) are
  // excluded entirely below — only wide-open days are ever suggested.
  const bookedDates = new Set(existing.map(b => b.game_date))

  // Build the full candidate list (open day x slot), ranked by this
  // tournament's own slot balance (least-used slot first), then soonest
  // date first as a tie-break.
  type Candidate = { game_date: string; slot_time: SlotTime; format: GameFormat; day: 'Sat' | 'Sun' }
  const candidates: Candidate[] = []
  for (let week = 0; week < HORIZON_WEEKS; week++) {
    const sat = addDays(firstSat, week * 7)
    const sun = addDays(sat, 1)
    for (const [date, day] of [[sat, 'Sat'], [sun, 'Sun']] as const) {
      const dateStr = toISODate(date)
      if (bookedDates.has(dateStr)) continue
      if (latestOwnBookingDate && dateStr <= latestOwnBookingDate) continue
      if (fullyUnavailableDates.has(dateStr)) continue
      for (const slotDef of SLOT_DEFS) {
        const candidateFormats = activeFormats.length
          ? slotDef.validFor.filter(f => activeFormats.includes(f))
          : slotDef.validFor
        if (candidateFormats.length === 0) continue
        candidates.push({
          game_date: dateStr,
          slot_time: slotDef.time,
          format: candidateFormats[0],
          day,
        })
      }
    }
  }

  // Incremental selection — re-ranked before EVERY pick, not sorted once up
  // front. ownSlotCounts is mutated as each suggestion is accepted, so two
  // slots tied at (say) 0 games each get suggested once before either gets
  // suggested a second time — otherwise a static one-time sort just finds
  // "the single least-used slot" and keeps handing out that same slot_time
  // for all suggestions, which defeats the point of spreading league games
  // across every available slot at least once.
  const working = [...existing]
  const suggestions: Candidate[] = []
  let remaining = [...candidates]
  const suggestedMonthCounts: Record<string, number> = {}

  while (suggestions.length < MAX_SUGGESTIONS && remaining.length > 0) {
    remaining.sort((a, b) => {
      const aCount = ownSlotCounts[a.slot_time] ?? 0
      const bCount = ownSlotCounts[b.slot_time] ?? 0
      if (aCount !== bCount) return aCount - bCount
      return a.game_date.localeCompare(b.game_date)
    })

    const pickedIndex = remaining.findIndex(candidate => {
      const body: CreateBookingRequest = {
        game_date: candidate.game_date,
        slot_time: candidate.slot_time,
        format: candidate.format,
        tournament_id: tournamentId,
      }
      // R1/R4/R5/R6 must hold against the full working set (real bookings
      // plus already-accepted suggestions) — those are physical calendar
      // clashes that would be real if the organiser books everything
      // suggested. R3 from this check is ignored and re-checked below
      // against real bookings only — see the file-header comment.
      const result = validateBooking(body, working, captainName, tournamentName, thisTournamentCaptainId)
      const blockingErrors = result.errors.filter(e => e.rule !== 'R3')
      if (blockingErrors.length > 0 || result.warnings.length > 0) return false

      const realResult = validateBooking(body, existing, captainName, tournamentName, thisTournamentCaptainId)
      if (realResult.errors.some(e => e.rule === 'R3')) return false // genuinely maxed for real this month

      const month = getYearMonth(candidate.game_date)
      if ((suggestedMonthCounts[month] ?? 0) >= MAX_SUGGESTIONS_PER_MONTH) return false

      return true
    })

    if (pickedIndex === -1) break // nothing left in the horizon is valid at all

    const [picked] = remaining.splice(pickedIndex, 1)
    // Only one suggested slot_time per day — drop the day's other now-moot
    // slot_time candidates rather than potentially suggesting two different
    // times on what was meant to be presented as a single open day.
    remaining = remaining.filter(c => c.game_date !== picked.game_date)
    suggestions.push(picked)
    ownSlotCounts[picked.slot_time] = (ownSlotCounts[picked.slot_time] ?? 0) + 1
    const pickedMonth = getYearMonth(picked.game_date)
    suggestedMonthCounts[pickedMonth] = (suggestedMonthCounts[pickedMonth] ?? 0) + 1
    working.push({
      id: `candidate-${suggestions.length}`,
      game_date: picked.game_date,
      slot_time: picked.slot_time,
      format: picked.format,
      venue: null,
      tournament_id: tournamentId,
      status: 'confirmed',
      block_reason: null,
      notes: null,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      tournament: { captain_id: thisTournamentCaptainId } as any,
    } as any)
  }

  // Flag any month where the suggestion count already exceeds R3's real
  // cap, so a caller can tell the organiser only R3_MONTHLY_CAP of that
  // month's options can actually be booked.
  const overCapMonths = Object.entries(suggestedMonthCounts)
    .filter(([, count]) => count > R3_MONTHLY_CAP)
    .map(([month]) => month)
    .sort()

  // slot_time/format were only needed internally to validate and rank
  // candidates against R1-R6 — every suggested day is fully open, so any
  // slot_time on it would work. Exposing the one we happened to validate
  // against would wrongly read as "this is the time," so only the date
  // is returned.
  const suggestedDates: SuggestedDate[] = suggestions.map(s => ({ game_date: s.game_date, day: s.day }))

  return { ok: true, suggestions: suggestedDates, monthlyCap: R3_MONTHLY_CAP, overCapMonths }
}

// ── getSuggestedSlotDates — per-bucket suggestion engine ────────────────
//
// A newer, more specific sibling of getSuggestedOpenDates above, built for
// the organiser self-service flow. Rather than "here are some fully open
// days, any time would work," this suggests one specific date PER SLOT
// BUCKET (e.g. "Sat 10:30" or "Sun 07:30") that's currently below its even
// share of this tournament's total league games — mirroring the slot
// balance already shown in the internal Tournament Planner (see
// distributeSlotTargets / src/lib/slotTargets.ts) and the finalized mockup
// this was designed against.
//
// Because each suggestion names an exact slot_time, a day that already has
// a DIFFERENT slot booked is not excluded the way it is in
// getSuggestedOpenDates — only that one specific slot needs to be free and
// pass R1-R7. Suggestions are still selected incrementally (each accepted
// pick folded into the working set before the next bucket is checked) so
// two bucket suggestions can never jointly violate R1's weekend cap.

export interface SuggestedSlotBucket {
  day: 'Sat' | 'Sun'
  slot_time: SlotTime
  format: GameFormat
  game_date: string
  current: number
  target: number
}

export type SuggestedSlotDatesResult =
  | { ok: true; buckets: SuggestedSlotBucket[] }
  | { ok: false; error: string; status: number }

export async function getSuggestedSlotDates(tournamentId: string): Promise<SuggestedSlotDatesResult> {
  const supabase = createServiceClient()

  const { data: tournament, error: tErr } = await supabase
    .from('tournaments')
    .select('id, name, captain_id, total_league_games, captains!tournaments_captain_id_fkey(id, name)')
    .eq('id', tournamentId)
    .single()

  if (tErr || !tournament) return { ok: false, error: 'Tournament not found', status: 404 }

  const thisTournamentCaptainId = tournament.captain_id ?? null
  const captainName = (tournament.captains as any)?.name ?? 'This captain'
  const tournamentName = tournament.name

  const { data: ownGames, error: ownErr } = await supabase
    .from('bookings')
    .select('game_date, slot_time, format')
    .eq('tournament_id', tournamentId)
    .eq('status', 'confirmed')

  if (ownErr) return { ok: false, error: ownErr.message, status: 500 }

  const totalLeague = tournament.total_league_games ?? (ownGames ?? []).length
  const activeFormatsRaw = Array.from(
    new Set((ownGames ?? []).map(g => g.format).filter((f): f is GameFormat => !!f))
  )
  const activeFormats: GameFormat[] = activeFormatsRaw.length ? activeFormatsRaw : ['T20', 'T30']

  const validSlots = ALL_SLOTS.filter(s => s.validFor.some(f => activeFormats.includes(f)))
  const validKeys = validSlots.map(s => `${s.day}-${s.time}` as SlotKey)
  const targets = distributeSlotTargets(validKeys, totalLeague)

  const slotCounts = {} as Record<SlotKey, number>
  validKeys.forEach(k => { slotCounts[k] = 0 })
  for (const g of ownGames ?? []) {
    const dow = parseISO(g.game_date).getDay()
    const day = dow === 6 ? 'Sat' : dow === 0 ? 'Sun' : null
    if (!day) continue
    const k = `${day}-${g.slot_time}` as SlotKey
    if (slotCounts[k] !== undefined) slotCounts[k]++
  }

  const deficientSlots = validSlots.filter(s => {
    const k = `${s.day}-${s.time}` as SlotKey
    return slotCounts[k] < (targets[k] ?? 0)
  })

  if (deficientSlots.length === 0) return { ok: true, buckets: [] }

  const today = new Date()
  today.setHours(0, 0, 0, 0)
  let firstSat = addDays(today, (6 - today.getDay() + 7) % 7)
  if (toISODate(firstSat) === toISODate(today)) firstSat = addDays(firstSat, 7)
  const horizonEnd = addDays(firstSat, HORIZON_WEEKS * 7)

  const { data: existingRaw, error: existingErr } = await supabase
    .from('bookings')
    .select('*, tournament:tournaments!bookings_tournament_id_fkey(id, name, captain_id)')
    .neq('status', 'cancelled')
    .gte('game_date', toISODate(firstSat))
    .lte('game_date', toISODate(horizonEnd))

  if (existingErr) return { ok: false, error: existingErr.message, status: 500 }

  const existing = (existingRaw ?? []).map((b: any) => ({
    ...b,
    tournament: Array.isArray(b.tournament) ? b.tournament[0] ?? null : b.tournament,
  }))

  const working = [...existing]
  const buckets: SuggestedSlotBucket[] = []

  // At least one clear weekend gap between any two of this tournament's own
  // dates — seeded from its real confirmed games, then grown as each bucket
  // suggestion is accepted, so later buckets in this same run can't land
  // next to an earlier one either.
  const blockedWeeks = new Set<string>()
  for (const g of ownGames ?? []) blockSurroundingWeeks(blockedWeeks, g.game_date)

  for (const slotDef of deficientSlots) {
    const format = slotDef.validFor.find(f => activeFormats.includes(f)) ?? slotDef.validFor[0]
    let found: string | null = null

    for (let d = new Date(firstSat); d <= horizonEnd; d = addDays(d, 1)) {
      const dow = d.getDay()
      const dayLabel = dow === 6 ? 'Sat' : dow === 0 ? 'Sun' : null
      if (dayLabel !== slotDef.day) continue
      const dateStr = toISODate(d)
      if (blockedWeeks.has(weekendAnchor(dateStr))) continue

      const candidate: CreateBookingRequest = {
        game_date: dateStr, slot_time: slotDef.time, format, tournament_id: tournamentId,
      }
      const result = validateBooking(candidate, working, captainName, tournamentName, thisTournamentCaptainId)
      if (result.valid && result.warnings.length === 0) {
        found = dateStr
        break
      }
    }

    if (!found) continue // nothing compliant for this bucket within the horizon

    const k = `${slotDef.day}-${slotDef.time}` as SlotKey
    buckets.push({
      day: slotDef.day, slot_time: slotDef.time, format,
      game_date: found, current: slotCounts[k], target: targets[k],
    })
    blockSurroundingWeeks(blockedWeeks, found)
    working.push({
      id: `candidate-slot-${buckets.length}`,
      game_date: found, slot_time: slotDef.time, format,
      venue: null, tournament_id: tournamentId, status: 'confirmed',
      block_reason: null, notes: null,
      created_at: new Date().toISOString(), updated_at: new Date().toISOString(),
      tournament: { captain_id: thisTournamentCaptainId } as any,
    } as any)
  }

  return { ok: true, buckets }
}

// ── findNextSlotDate — single-bucket lookup for the "decline" step ──────
//
// Given a specific slot bucket already offered to an organiser (and any
// dates they've already declined for that same bucket), finds the next
// compliant date beyond those exclusions. Shares the same search logic as
// getSuggestedSlotDates' inner loop, but for exactly one bucket rather than
// every deficient one — used by /api/tournaments/[id]/organiser-next-slot,
// which has nothing else to recompute once the organiser is already mid-flow
// on one particular bucket.
//
// `avoidNearDates` carries the same weekend-gap rule getSuggestedSlotDates
// applies against this tournament's confirmed games — the caller passes
// both those and whatever other bucket cards are currently showing, so a
// decline can't produce a date that clusters with a sibling bucket's
// still-active suggestion.
export async function findNextSlotDate(
  tournamentId: string,
  day: 'Sat' | 'Sun',
  slotTime: SlotTime,
  format: GameFormat,
  excludeDates: string[],
  avoidNearDates: string[] = []
): Promise<{ ok: true; game_date: string | null } | { ok: false; error: string; status: number }> {
  const supabase = createServiceClient()

  const { data: tournament, error: tErr } = await supabase
    .from('tournaments')
    .select('id, name, captain_id, captains!tournaments_captain_id_fkey(id, name)')
    .eq('id', tournamentId)
    .single()

  if (tErr || !tournament) return { ok: false, error: 'Tournament not found', status: 404 }

  const captainName = (tournament.captains as any)?.name ?? 'This captain'
  const excluded = new Set(excludeDates)

  const { data: ownGames, error: ownErr } = await supabase
    .from('bookings')
    .select('game_date')
    .eq('tournament_id', tournamentId)
    .eq('status', 'confirmed')

  if (ownErr) return { ok: false, error: ownErr.message, status: 500 }

  const blockedWeeks = new Set<string>()
  for (const g of ownGames ?? []) blockSurroundingWeeks(blockedWeeks, g.game_date)
  for (const d of avoidNearDates) blockSurroundingWeeks(blockedWeeks, d)

  const today = new Date()
  today.setHours(0, 0, 0, 0)
  let firstSat = addDays(today, (6 - today.getDay() + 7) % 7)
  if (toISODate(firstSat) === toISODate(today)) firstSat = addDays(firstSat, 7)
  const horizonEnd = addDays(firstSat, HORIZON_WEEKS * 7)

  const { data: existingRaw, error: existingErr } = await supabase
    .from('bookings')
    .select('*, tournament:tournaments!bookings_tournament_id_fkey(id, name, captain_id)')
    .neq('status', 'cancelled')
    .gte('game_date', toISODate(firstSat))
    .lte('game_date', toISODate(horizonEnd))

  if (existingErr) return { ok: false, error: existingErr.message, status: 500 }

  const existing = (existingRaw ?? []).map((b: any) => ({
    ...b,
    tournament: Array.isArray(b.tournament) ? b.tournament[0] ?? null : b.tournament,
  }))

  for (let d = new Date(firstSat); d <= horizonEnd; d = addDays(d, 1)) {
    const dow = d.getDay()
    const dayLabel = dow === 6 ? 'Sat' : dow === 0 ? 'Sun' : null
    if (dayLabel !== day) continue
    const dateStr = toISODate(d)
    if (excluded.has(dateStr)) continue
    if (blockedWeeks.has(weekendAnchor(dateStr))) continue

    const candidate: CreateBookingRequest = {
      game_date: dateStr, slot_time: slotTime, format, tournament_id: tournamentId,
    }
    const result = validateBooking(candidate, existing, captainName, tournament.name, tournament.captain_id ?? null)
    if (result.valid && result.warnings.length === 0) {
      return { ok: true, game_date: dateStr }
    }
  }

  return { ok: true, game_date: null }
}
