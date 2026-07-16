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

import { createServiceClient } from '@/lib/supabase'
import { validateBooking, getYearMonth } from '@/lib/validation'
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
    .select('id, name, captain_id, total_league_games, captains!tournaments_captain_id_fkey(id, name)')
    .eq('id', tournamentId)
    .single()

  if (tErr || !tournament) {
    return { ok: false, error: 'Tournament not found', status: 404 }
  }

  const thisTournamentCaptainId = tournament.captain_id ?? null
  const captainName = (tournament.captains as any)?.name ?? 'This captain'
  const tournamentName = tournament.name

  const today = new Date()
  today.setHours(0, 0, 0, 0)
  // Start from the next Saturday strictly after today — never suggest a same-day slot.
  let firstSat = addDays(today, (6 - today.getDay() + 7) % 7)
  if (toISODate(firstSat) === toISODate(today)) firstSat = addDays(firstSat, 7)
  const horizonEnd = addDays(firstSat, HORIZON_WEEKS * 7)

  // This tournament's own confirmed games — used only to rank candidate
  // slots by how under-used they are for THIS tournament specifically.
  const { data: ownGames, error: ownErr } = await supabase
    .from('bookings')
    .select('slot_time, format')
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
