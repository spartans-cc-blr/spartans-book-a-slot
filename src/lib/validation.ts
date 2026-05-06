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

  // ── R2: One game per captain per weekend (weekends only, WARNING) ──
  if (isWeekendGame) {
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

  // Direct match — slot is directly booked or soft-blocked
  const direct = active.find(b => b.slot_time === slotTime)
  if (direct) {
    return direct.status === 'soft_block' ? 'soft_block' : 'booked'
  }

  const confirmed = active.filter(b => b.status === 'confirmed')

  // ── NEW: T20 at 10:30 blocks entire day ──────────────────────
  const t20at1030 = confirmed.find(b => b.slot_time === '10:30' && b.format === 'T20')
  if (t20at1030) return 'clash'

  // ── NEW: T20 at 07:30 blocks 10:30 ───────────────────────────
  if (slotTime === '10:30') {
    const t20at0730 = confirmed.find(b => b.slot_time === '07:30' && b.format === 'T20')
    if (t20at0730) return 'clash'
  }

  // ── NEW: Second T30 on same day is blocked ───────────────────
  if (slotTime === '07:30' || slotTime === '12:30') {
    // These are the T30-eligible slots — if one T30 already exists, mark the other as clash
    const t30exists = confirmed.find(b => b.format === 'T30')
    if (t30exists) return 'clash'
  }

  // ── Pre-existing: T30 at 07:30 blocks 10:30 ─────────────────
  if (slotTime === '10:30') {
    const t30at0730 = confirmed.find(b => b.slot_time === '07:30' && b.format === 'T30')
    if (t30at0730) return 'clash'
  }

  // ── Pre-existing: Any game at 12:30 blocks 10:30 and 14:30 ──
  if (slotTime === '10:30' || slotTime === '14:30') {
    const gameat1230 = confirmed.find(b => b.slot_time === '12:30')
    if (gameat1230) return 'clash'
  }

  // ── Pre-existing: T20 at 14:30 blocks 12:30 ─────────────────
  if (slotTime === '12:30') {
    const t20at1430 = confirmed.find(b => b.slot_time === '14:30' && b.format === 'T20')
    if (t20at1430) return 'clash'
  }

  return 'open'
}