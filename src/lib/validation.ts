import { getISOWeek, getMonth, getYear, parseISO } from 'date-fns'
import type {
  Booking,
  CreateBookingRequest,
  ValidationResult,
  ValidationError,
  SlotTime,
  GameFormat,
} from '@/types'

// ── Helpers ──────────────────────────────────────────────────────

/** Returns ISO week number for a date string */
export function getWeekNumber(dateStr: string): number {
  return getISOWeek(parseISO(dateStr))
}

/** Returns 'YYYY-MM' for a date string */
export function getYearMonth(dateStr: string): string {
  const d = parseISO(dateStr)
  return `${getYear(d)}-${String(getMonth(d) + 1).padStart(2, '0')}`
}

/** Saturday and Sunday of the same ISO week as a given date */
export function getWeekendDates(dateStr: string): string[] {
  const d = parseISO(dateStr)
  const day = d.getDay() // 0=Sun, 6=Sat
  const sat = new Date(d)
  sat.setDate(d.getDate() - (day === 0 ? 1 : day - 6))
  const sun = new Date(sat)
  sun.setDate(sat.getDate() + 1)
  return [
    sat.toISOString().split('T')[0],
    sun.toISOString().split('T')[0],
  ]
}

// ── T20 10:30 conflict check ──────────────────────────────────────
// R5: A T20 at 10:30 blocks T30 slots (07:30 and 12:30) on the same day,
// and vice versa — T30 at 07:30 or 12:30 blocks T20 at 10:30.
function hasSlotConflict(
  format: GameFormat,
  slotTime: SlotTime,
  sameDayBookings: Booking[]
): boolean {
  const active = sameDayBookings.filter(b => b.status === 'confirmed')

  if (format === 'T20' && slotTime === '10:30') {
    // Booking a T20 at 10:30 — blocked if any T30 exists today
    return active.some(b => b.format === 'T30')
  }

  if (format === 'T30' && (slotTime === '07:30' || slotTime === '12:30')) {
    // Booking a T30 — blocked if a T20 at 10:30 exists today
    return active.some(b => b.format === 'T20' && b.slot_time === '10:30')
  }

  return false
}

// ── Main validation function ──────────────────────────────────────
export function validateBooking(
  booking: CreateBookingRequest,
  existingBookings: Booking[],
  captainName: string,
  tournamentName: string
): ValidationResult {
  const errors: ValidationError[] = []
  const active = existingBookings.filter(b => b.status !== 'cancelled')
  const weekend = getWeekendDates(booking.game_date)
  const month   = getYearMonth(booking.game_date)

  // ── R1: Max 3 games per weekend ──────────────────────────────
  const weekendGames = active.filter(b =>
    weekend.includes(b.game_date) && b.status === 'confirmed'
  )
  if (weekendGames.length >= 3) {
    errors.push({
      rule: 'R1',
      message: `The club already has 3 confirmed games this weekend (${weekend[0]} & ${weekend[1]}). Maximum reached.`,
    })
  }

  // ── R2: One game per captain per weekend ─────────────────────
  const captainWeekend = active.filter(b =>
    weekend.includes(b.game_date) &&
    b.captain_id === booking.captain_id &&
    b.status === 'confirmed'
  )
  if (captainWeekend.length > 0) {
    errors.push({
      rule: 'R2',
      message: `${captainName} is already playing this weekend. Each captain can only play once per weekend.`,
    })
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
      message: `${tournamentName} already has 2 confirmed games in ${month}. Maximum 2 games per tournament per month.`,
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

  // ── R5: T20 10:30 ↔ T30 conflict ────────────────────────────
  const sameDayBookings = active.filter(b => b.game_date === booking.game_date)
  if (hasSlotConflict(booking.format, booking.slot_time, sameDayBookings)) {
    errors.push({
      rule: 'R5',
      message:
        booking.format === 'T20' && booking.slot_time === '10:30'
          ? `A T30 game is already scheduled on ${booking.game_date}. T20 at 10:30 conflicts with T30 slots.`
          : `A T20 game at 10:30 is already scheduled on ${booking.game_date}. This T30 slot conflicts with it.`,
    })
  }

  return {
    valid: errors.length === 0,
    errors,
  }
}

// ── Availability computation for the public grid ─────────────────
export function computeSlotStatus(
  date: string,
  slotTime: SlotTime,
  bookings: Booking[]
): 'open' | 'booked' | 'soft_block' | 'clash' {
  const active = bookings.filter(
    b => b.game_date === date && b.status !== 'cancelled'
  )

  // Direct match first
  const direct = active.find(b => b.slot_time === slotTime)
  if (direct) {
    return direct.status === 'soft_block' ? 'soft_block' : 'booked'
  }

  // R5 clash — only apply if there's a confirmed T20 at 10:30
  const t20at1030 = active.find(
    b => b.format === 'T20' && b.slot_time === '10:30' && b.status === 'confirmed'
  )
  if (t20at1030 && (slotTime === '07:30' || slotTime === '12:30')) {
    return 'clash'
  }

  // R5 clash — only apply if there's a confirmed T30
  const t30exists = active.find(
    b => b.format === 'T30' && b.status === 'confirmed'
  )
  if (t30exists && slotTime === '10:30') {
    return 'clash'
  }

  return 'open'
}
