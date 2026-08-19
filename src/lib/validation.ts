import { getISOWeek, getMonth, getYear, parseISO } from 'date-fns'
import type {
  Booking,
  CreateBookingRequest,
  ValidationResult,
  ValidationError,
  SlotTime,
  GameFormat,
} from '@/types'
import { KNOCKOUT_HOLD_REASON, isInformalFormat } from '@/types'

export function getWeekNumber(dateStr: string): number {
  return getISOWeek(parseISO(dateStr))
}

export function getYearMonth(dateStr: string): string {
  const d = parseISO(dateStr)
  return `${getYear(d)}-${String(getMonth(d) + 1).padStart(2, '0')}`
}

export function getWeekendDates(dateStr: string): string[] {
  const d = parseISO(dateStr)
  const day = d.getDay()
  const sat = new Date(d)
  sat.setDate(d.getDate() - (day === 0 ? 1 : day - 6))
  const sun = new Date(sat)
  sun.setDate(sat.getDate() + 1)
  return [
    sat.toISOString().split('T')[0],
    sun.toISOString().split('T')[0],
  ]
}

function isWeekend(dateStr: string): boolean {
  const day = parseISO(dateStr).getDay()
  return day === 0 || day === 6 // 0 = Sunday, 6 = Saturday
}

function hasT20T30Conflict(
  format: GameFormat,
  slotTime: SlotTime,
  sameDayBookings: Booking[]
): boolean {
  const active = sameDayBookings.filter(b => b.status === 'confirmed')
  if (format === 'T20' && slotTime === '10:30') {
    return active.some(b => b.format === 'T30')
  }
  if (format === 'T30' && (slotTime === '07:30' || slotTime === '12:30')) {
    return active.some(b => b.format === 'T20' && b.slot_time === '10:30')
  }
  return false
}

type BookingWithTournamentCaptain = Booking & {
  tournament?: {
    captain_id: string | null
    name?: string | null
  } | null
}

// One row from player_future_availability, pre-scoped by the caller to this
// tournament's own leading captain (see suggestedSlots.ts / bookings routes).
export interface CaptainFutureAvailabilityRow {
  game_date: string
  slot_time: string
  response:  string
}

export function validateBooking(
  booking: CreateBookingRequest,
  existingBookings: BookingWithTournamentCaptain[],
  captainName: string,
  tournamentName: string,
  thisTournamentCaptainId: string | null = null,
  overriddenRules: Set<string> = new Set(),
  captainFutureAvailability: CaptainFutureAvailabilityRow[] = []
): ValidationResult {
  // T10/T25 are rare, informal, admin-only quick games — they never go
  // through R1-R7 at all (no weekend cap, no clash checks, no knockout-day
  // priority). This is a deliberate exemption, not a gap: see
  // .claude/rules/architecture.md.
  if (isInformalFormat(booking.format)) {
    return { valid: true, errors: [], warnings: [], overridden: [] }
  }

  const errors: ValidationError[] = []
  const warnings: ValidationError[] = []
  const active = existingBookings.filter(b => b.status !== 'cancelled')
  const weekend = getWeekendDates(booking.game_date)
  const month   = getYearMonth(booking.game_date)
  const isWeekendGame = isWeekend(booking.game_date)

  // ── R1: Max 3 games per weekend (weekends only) ───────────────
  if (isWeekendGame) {
    const weekendGames = active.filter(b =>
      weekend.includes(b.game_date) && b.status === 'confirmed'
    )
    if (weekendGames.length >= 3) {
      errors.push({
        rule: 'R1',
        message: `The club already has 3 confirmed games this weekend. Maximum reached.`,
      })
    }
  }

  // ── R2: Captain leading another tournament same weekend (WARNING) ──
  if (isWeekendGame && thisTournamentCaptainId) {
    const captainWeekendConflict = active.filter(b =>
      weekend.includes(b.game_date) &&
      b.tournament_id !== booking.tournament_id &&
      b.tournament?.captain_id === thisTournamentCaptainId &&
      b.status === 'confirmed'
    )
    if (captainWeekendConflict.length > 0) {
      warnings.push({
        rule: 'R2',
        message: `${captainName} is already leading another tournament this weekend. Confirm only if they have agreed to play again.`,
      })
    }
  }

  // ── R3: Max 2 games per tournament per month ─────────────────
  const tournamentMonth = active.filter(b =>
    b.tournament_id === booking.tournament_id &&
    getYearMonth(b.game_date) === month &&
    b.status === 'confirmed'
  )
  if (tournamentMonth.length >= 2) {
    errors.push({
      rule: 'R3',
      message: `${tournamentName} already has 2 confirmed games in ${month}. Maximum 2 per tournament per month.`,
    })
  }

  // ── R4: No duplicate slot on same day ────────────────────────
  const slotConflict = active.find(b =>
    b.game_date === booking.game_date &&
    b.slot_time === booking.slot_time
  )
  if (slotConflict) {
    errors.push({
      rule: 'R4',
      message: `The ${booking.slot_time} slot on ${booking.game_date} is already booked or reserved.`,
    })
  }

  // ── R5/R6: Time overlap rules ────────────────────────────────
  const sameDayActive = active.filter(b => b.game_date === booking.game_date && b.status === 'confirmed')

  // ── NEW: T20 at 10:30 blocks the entire day ──────────────────
  // If a T20 at 10:30 already exists, no other slot can be booked that day.
  const t20at1030exists = sameDayActive.find(b => b.slot_time === '10:30' && b.format === 'T20')
  if (t20at1030exists && booking.slot_time !== '10:30') {
    errors.push({
      rule: 'R5',
      message: `A T20 at 10:30 is already booked. No back-to-back games — this day is fully blocked.`,
    })
  }

  // If trying to book T20 at 10:30 and anything else already exists that day, block it.
  if (booking.slot_time === '10:30' && booking.format === 'T20' && sameDayActive.length > 0) {
    errors.push({
      rule: 'R5',
      message: `A T20 at 10:30 cannot be added when other games are already booked on this day. No back-to-back games allowed.`,
    })
  }

  // ── NEW: T20 at 07:30 blocks T20 at 10:30 ───────────────────
  // Back-to-back T20s in the morning are not allowed.
  if (booking.slot_time === '10:30') {
    if (sameDayActive.find(b => b.slot_time === '07:30' && b.format === 'T20')) {
      errors.push({
        rule: 'R5',
        message: `A T20 at 07:30 is already booked. Back-to-back T20 games are not allowed — 10:30 slot is blocked.`,
      })
    }
  }
  // Reverse: if booking T20 at 07:30 and a T20 at 10:30 already exists, block it.
  if (booking.slot_time === '07:30' && booking.format === 'T20') {
    if (sameDayActive.find(b => b.slot_time === '10:30' && b.format === 'T20')) {
      errors.push({
        rule: 'R5',
        message: `A T20 at 10:30 is already booked. Back-to-back T20 games are not allowed — 07:30 slot is blocked.`,
      })
    }
  }

  // ── NEW: Max one T30 per day ─────────────────────────────────
  if (booking.format === 'T30') {
    const t30sToday = sameDayActive.filter(b => b.format === 'T30')
    if (t30sToday.length >= 1) {
      errors.push({
        rule: 'R5',
        message: `A T30 game is already booked on this day. Only one T30 per day is allowed.`,
      })
    }
  }

  // ── Pre-existing: T30 at 07:30 blocks 10:30 ─────────────────
  if (booking.slot_time === '10:30') {
    if (sameDayActive.find(b => b.slot_time === '07:30' && b.format === 'T30')) {
      errors.push({ rule: 'R5', message: `A T30 game at 07:30 runs past 10:30. This slot cannot be booked.` })
    }
  }

  // ── Pre-existing: T20 at 10:30 blocks 12:30 ─────────────────
  // (now redundant — covered by the "T20 at 10:30 blocks entire day" rule above,
  //  but kept for explicit message clarity if that check is ever relaxed)
  if (booking.slot_time === '12:30') {
    if (sameDayActive.find(b => b.slot_time === '10:30' && b.format === 'T20')) {
      errors.push({ rule: 'R5', message: `A T20 game at 10:30 runs until 12:30. This slot cannot be booked.` })
    }
  }

  // ── Pre-existing R6: Any game at 12:30 blocks 10:30 and 14:30 ──
  if (booking.slot_time === '10:30' || booking.slot_time === '14:30') {
    if (sameDayActive.find(b => b.slot_time === '12:30')) {
      errors.push({ rule: 'R6', message: `A game at 12:30 conflicts with the ${booking.slot_time} slot.` })
    }
  }

  // ── Pre-existing R6: T20 at 14:30 blocks 12:30 ───────────────
  if (booking.slot_time === '12:30') {
    if (sameDayActive.find(b => b.slot_time === '14:30' && b.format === 'T20')) {
      errors.push({ rule: 'R6', message: `A T20 game at 14:30 conflicts with the 12:30 slot.` })
    }
  }

  // ── R7: Knockout day priority ────────────────────────────────
  // Once any active booking on a date carries the Knockout hold reason, no
  // *new* booking may take a slot_time at or before it that same day — this
  // protects the day for a knockout fixture from the moment it's placed.
  // Applies every day, not just weekends (a knockout can land on a weekday).
  // slot_time strings ('07:30' etc.) sort correctly with plain string
  // comparison since they're all zero-padded 24h HH:MM.
  const sameDayAllActive = active.filter(b => b.game_date === booking.game_date)
  const isKnockoutCandidate = booking.block_reason === KNOCKOUT_HOLD_REASON

  if (isKnockoutCandidate) {
    // Placing the knockout hold itself — a warning, not a rejection, since
    // the organiser's date is a given and there may be no alternative.
    const earlierSameDay = sameDayAllActive
      .filter(b => b.slot_time < booking.slot_time)
      .sort((a, b) => a.slot_time.localeCompare(b.slot_time))[0]
    if (earlierSameDay) {
      const label = earlierSameDay.tournament?.name ?? 'Another booking'
      warnings.push({
        rule: 'R7',
        message: `${label} already has the ${earlierSameDay.slot_time} slot on ${booking.game_date}. Knockouts take precedence — consider asking them to reschedule later the same day.`,
      })
    }
  } else {
    const knockoutSameDay = sameDayAllActive.find(b =>
      b.block_reason === KNOCKOUT_HOLD_REASON && booking.slot_time <= b.slot_time
    )
    if (knockoutSameDay) {
      errors.push({
        rule: 'R7',
        message: `${booking.game_date} has a Knockout hold at ${knockoutSameDay.slot_time}. No slot at or before that time can be booked on this date.`,
      })
    }
  }

  // ── R8: Captain unavailable for this exact slot (WARNING) ──────
  // Slot-precise sibling of the day-level exclusion in
  // getSuggestedOpenDates() (src/lib/suggestedSlots.ts) — that check drops
  // an entire candidate day only when the captain is 'L' across all 4
  // slot_times; this one fires at actual booking time for the one exact
  // slot_time being booked. Non-blocking, same severity as R2 — the admin
  // sees the warning and can still confirm if the captain has agreed anyway.
  if (thisTournamentCaptainId) {
    const captainUnavailable = captainFutureAvailability.find(r =>
      r.game_date === booking.game_date &&
      r.slot_time === booking.slot_time &&
      r.response === 'L'
    )
    if (captainUnavailable) {
      warnings.push({
        rule: 'R8',
        message: `${captainName} marked themselves unavailable for ${booking.slot_time} on ${booking.game_date}. Confirm only if they've agreed to play anyway.`,
      })
    }
  }

  // Admin-only override: a rule that would otherwise block the booking can
  // be explicitly overridden (each override is logged with a reason — see
  // booking_rule_overrides / src/app/api/bookings/route.ts). Overridden
  // rules move out of `errors` (so `valid` reflects only what's still
  // actually blocking) into their own `overridden` list, keeping the
  // original rule + message intact for the audit log write. R7 goes through
  // this same split — an admin can override a knockout-day conflict too,
  // same as any other rule, as long as it's logged.
  const overridden = errors.filter(e => overriddenRules.has(e.rule))
  const blocking   = errors.filter(e => !overriddenRules.has(e.rule))

  return {
    valid: blocking.length === 0,
    errors: blocking,
    warnings,
    overridden,
  }
}

export function computeSlotStatus(
  date: string,
  slotTime: SlotTime,
  bookings: Booking[]
): 'open' | 'booked' | 'soft_block' | 'clash' | 't20only' {
  const active = bookings.filter(
    b => b.game_date === date && b.status !== 'cancelled'
  )

  // Direct match — slot is directly booked or soft-blocked
  const direct = active.find(b => b.slot_time === slotTime)
  if (direct) {
    return direct.status === 'soft_block' ? 'soft_block' : 'booked'
  }

  const confirmed = active.filter(b => b.status === 'confirmed')

  // ── T20 at 10:30 blocks all other slots — 07:30, 12:30, 14:30 ──
  // No other game can be booked on a day with a T20 at 10:30.
  const t20at1030 = confirmed.find(b => b.slot_time === '10:30' && b.format === 'T20')
  if (t20at1030) return 'clash'

  // ── T20 at 07:30 blocks T20 at 10:30 (back-to-back T20s) ────
  if (slotTime === '10:30') {
    const t20at0730 = confirmed.find(b => b.slot_time === '07:30' && b.format === 'T20')
    if (t20at0730) return 'clash'
  }

  // ── T30 at 07:30 blocks 10:30 and 12:30 ─────────────────────
  // 10:30: game overruns. 12:30: second T30 not allowed.
  if (slotTime === '10:30' || slotTime === '12:30') {
    const t30at0730 = confirmed.find(b => b.slot_time === '07:30' && b.format === 'T30')
    if (t30at0730) return 'clash'
  }

  // ── T30 at 12:30 blocks 07:30 for T30, but T20 is still allowed ──
  // Return 't20only' so the grid can show the slot as partially available.
  if (slotTime === '07:30') {
    const t30at1230 = confirmed.find(b => b.slot_time === '12:30' && b.format === 'T30')
    if (t30at1230) return 't20only'
  }

  // ── Any game at 12:30 blocks 10:30 and 14:30 ────────────────
  if (slotTime === '10:30' || slotTime === '14:30') {
    const gameat1230 = confirmed.find(b => b.slot_time === '12:30')
    if (gameat1230) return 'clash'
  }

  // ── T20 at 14:30 blocks 12:30 ───────────────────────────────
  if (slotTime === '10:30' || slotTime === '12:30') {
    const t20at1430 = confirmed.find(b => b.slot_time === '14:30' && b.format === 'T20')
    if (t20at1430) return 'clash'
  }

  return 'open'
}
