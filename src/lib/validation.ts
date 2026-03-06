import { getISOWeek, getMonth, getYear, parseISO } from 'date-fns'
import type {
  Booking,
  CreateBookingRequest,
  ValidationResult,
  ValidationError,
  SlotTime,
  GameFormat,
} from '@/types'

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

export function validateBooking(
  booking: CreateBookingRequest,
  existingBookings: Booking[],
  captainName: string,
  tournamentName: string
): ValidationResult {
  const errors: ValidationError[] = []
  const warnings: ValidationError[] = []
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
      message: `The club already has 3 confirmed games this weekend. Maximum reached.`,
    })
  }

  // ── R2: One game per captain per weekend (WARNING only) ──────
  const captainWeekend = active.filter(b =>
    weekend.includes(b.game_date) &&
    b.captain_id === booking.captain_id &&
    b.status === 'confirmed'
  )
  if (captainWeekend.length > 0) {
    warnings.push({
      rule: 'R2',
      message: `${captainName} is already playing this weekend. Confirm only if the captain has agreed to play again.`,
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

  // ── R5: T20 10:30 ↔ T30 conflict ────────────────────────────
  const sameDayBookings = active.filter(b => b.game_date === booking.game_date)
  if (hasT20T30Conflict(booking.format, booking.slot_time, sameDayBookings)) {
    errors.push({
      rule: 'R5',
      message:
        booking.format === 'T20' && booking.slot_time === '10:30'
          ? `A T30 game is already scheduled on ${booking.game_date}. T20 at 10:30 conflicts with T30 slots.`
          : `A T20 game at 10:30 is already scheduled on ${booking.game_date}. This T30 slot conflicts with it.`,
    })
  }

  // ── R6: 12:30 blocks 14:30 (game runs till evening) ─────────
  if (booking.slot_time === '14:30') {
    const noon = active.find(b =>
      b.game_date === booking.game_date &&
      b.slot_time === '12:30' &&
      b.status === 'confirmed'
    )
    if (noon) {
      errors.push({
        rule: 'R6',
        message: `A game is already scheduled at 12:30 on ${booking.game_date}. It runs until evening, blocking the 14:30 slot.`,
      })
    }
  }
  if (booking.slot_time === '12:30') {
    const afternoon = active.find(b =>
      b.game_date === booking.game_date &&
      b.slot_time === '14:30' &&
      b.status === 'confirmed'
    )
    if (afternoon) {
      errors.push({
        rule: 'R6',
        message: `A game is already scheduled at 14:30 on ${booking.game_date}. Booking 12:30 would conflict as it runs until evening.`,
      })
    }
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
  }
}

export function computeSlotStatus(
  date: string,
  slotTime: SlotTime,
  bookings: Booking[]
): 'open' | 'booked' | 'soft_block' | 'clash' {
  const active = bookings.filter(
    b => b.game_date === date && b.status !== 'cancelled'
  )

  // Direct match
  const direct = active.find(b => b.slot_time === slotTime)
  if (direct) {
    return direct.status === 'soft_block' ? 'soft_block' : 'booked'
  }

  // R5: T20 10:30 blocks T30 adjacent slots
  const t20at1030 = active.find(
    b => b.format === 'T20' && b.slot_time === '10:30' && b.status === 'confirmed'
  )
  if (t20at1030 && (slotTime === '07:30' || slotTime === '12:30')) {
    return 'clash'
  }
  const t30exists = active.find(
    b => b.format === 'T30' && b.status === 'confirmed'
  )
  if (t30exists && slotTime === '10:30') {
    return 'clash'
  }

  // R6: 12:30 blocks 14:30
  const noonGame = active.find(
    b => b.slot_time === '12:30' && b.status === 'confirmed'
  )
  if (noonGame && slotTime === '14:30') {
    return 'clash'
  }

  return 'open'
}
