// Availability patterns: pure, client-safe analysis of each player's
// Y/O/E/L history. No server imports here (the fetch lives in
// availabilityPatterns.ts), so 'use client' components may import types and
// helpers from this file. See .claude/rules/features/availability-patterns.md.
//
// Unit of analysis: a player × a past confirmed booking that was "offered"
// to them, i.e. every booking from the date of their first response onward.
// A booking with no response counts as offered but not answered. "Yes" means
// Y, O or E (all three say the player would play that game).

export type PatternDimension = 'slot' | 'day' | 'format' | 'captain' | 'ground'

export const DIMENSION_LABEL: Record<PatternDimension, string> = {
  slot: 'Slot',
  day: 'Day',
  format: 'Format',
  captain: 'Captain',
  ground: 'Ground',
}

export interface PatternBooking {
  id: string
  gameDate: string          // YYYY-MM-DD
  slot: string              // '07:30'
  format: string            // 'T20' | 'T30' | ...
  dayType: 'Sat' | 'Sun' | 'Weekday' | 'Holiday'   // Holiday = Mon–Fri public holiday
  captainId: string | null
  captainName: string | null
  captainPlayerId: string | null
  groundId: string | null
  groundName: string | null
  // Response-timing inputs (ISO timestamps). bookedAt is when the booking was
  // created; cutoffAt is when player availability closes: Thursday 08:00 IST
  // before a weekend game, the start time for a weekday game.
  bookedAt?: string | null
  cutoffAt?: string | null
}

export interface PatternPlayer {
  id: string
  name: string
  status: string            // 'active' | 'inactive'
}

export interface PatternResponse {
  playerId: string
  bookingId: string
  response: string          // 'Y' | 'O' | 'E' | 'L'
}

export interface PatternInput {
  bookings: PatternBooking[]
  players: PatternPlayer[]
  responses: PatternResponse[]
  // playerId -> number of times the player switched a Y/O/E to L themselves
  withdrawals: Map<string, number>
  // `${playerId}|${bookingId}` for every announced squad row
  selected: Set<string>
  // `${playerId}|${bookingId}` -> ISO time of the player's own first response
  firstResponseAt?: Map<string, string>
  // Reminder response: playerId -> ISO times of reminder pushes logged as
  // sent, playerId -> ISO times of every response the player made themselves,
  // players with a push subscription now, and the current time.
  reminders?: Map<string, string[]>
  ownResponseTimes?: Map<string, string[]>
  pushSubscribed?: Set<string>
  now?: string
}

export interface ValueBreakdown {
  key: string
  label: string
  offered: number
  yes: number
  rate: number              // yes / offered
}

export interface PatternFinding {
  dim: PatternDimension
  key: string
  label: string
  kind: 'prefers' | 'avoids'
  strength: 'only' | 'mostly' | 'never' | 'rarely'
  yes: number
  offered: number
  rate: number              // yes rate for this value
  otherRate: number         // yes rate for every other value
  share: number             // share of the player's yes in this value
}

export type ReliabilityFlag = 'rarely_responds' | 'often_withdraws' | 'rarely_picked'

export type TimingLabel = 'plans_ahead' | 'leaves_it_late'

export type ReminderLabel = 'answers_after_reminders' | 'ignores_reminders'

export interface ReminderResponse {
  weeks: number                     // completed reminder weeks (Sun–Wed cycles)
  answeredWeeks: number             // answered within the week's reminder window
  label: ReminderLabel | null
  pushOff: boolean                  // no push subscription: reminders only reach the Home banner
}

export interface ResponseTiming {
  timed: number                     // responses with a usable booking window
  medianDaysBeforeCutoff: number | null
  label: TimingLabel | null
  asSoonAsBooked: boolean           // usually answers within 72h of booking
  bands: { ahead: number; week: number; lastDay: number; afterCutoff: number }
}

export interface PlayerPattern {
  playerId: string
  name: string
  status: string
  offered: number
  answered: number
  yes: number
  leave: number
  withdrawals: number
  picked: number            // announced in the squad, among yes bookings
  firstResponse: string | null
  findings: PatternFinding[]
  flags: ReliabilityFlag[]
  breakdown: Record<PatternDimension, ValueBreakdown[]>
  timing: ResponseTiming
  reminders: ReminderResponse
}

// Thresholds — tune here and in the doc's table together.
export const MIN_YES_FOR_PREFERENCE = 6     // player must have said yes this often
export const PREFER_SHARE = 0.7            // ≥70% of their yes in one value
export const PREFER_LIFT = 1.5             // and ≥1.5× their rate elsewhere
export const ONLY_SHARE = 0.9              // ≥90% reads as "only"
export const MIN_OFFERED_FOR_AVOID = 6     // value offered at least this often
export const AVOID_MIN_OTHER_RATE = 0.3    // they do say yes elsewhere
export const AVOID_RATIO = 0.5             // rate here ≤ half their rate elsewhere
export const CONFOUND_RATIO = 0.5          // and ≤ half what their day/format habits predict
export const CONFOUND_PREFER_RATIO = 1.3   // prefers: ≥1.3× what day/format habits predict
export const CONFOUND_MIN_EXPECTED = 3     // avoids: habits must predict ≥3 available games
export const MIN_OFFERED_FOR_RESPONSE_FLAG = 10
export const RARELY_RESPONDS_RATE = 0.25
export const WITHDRAW_MIN = 3
export const WITHDRAW_RATE = 0.2
export const PICK_MIN_YES = 8
export const PICK_RATE = 0.25
// Response timing — measured from the player's own first response (captain
// proxy entries don't count) to the availability cutoff.
export const MIN_TIMED_RESPONSES = 6
export const MIN_WINDOW_HOURS = 72         // skip games booked < 3 days before cutoff
export const PLANS_AHEAD_DAYS = 7          // median ≥ a week before cutoff
export const LEAVES_LATE_DAYS = 2          // median ≤ last 2 days before cutoff
export const SOON_AFTER_BOOKING_HOURS = 72
export const SOON_AFTER_BOOKING_SHARE = 0.5
// Reminder response — reminders go out Sun–Wed evenings; a week counts as
// answered when the player responded themselves between the week's first
// reminder and 12h after its last one.
export const MIN_REMINDER_WEEKS = 4
export const REMINDER_GRACE_HOURS = 12
export const ANSWERS_AFTER_REMINDERS_RATE = 0.5

const YES = new Set(['Y', 'O', 'E'])
const DIMS: PatternDimension[] = ['slot', 'day', 'format', 'captain', 'ground']
// Dimensions that can be explained by day/format: a captain may lead only
// weekday T30 games, so "avoids that captain" is checked against what the
// player's day/format habits would predict before it is reported.
const CONFOUNDED = new Set<PatternDimension>(['captain', 'ground'])

function valueOf(b: PatternBooking, dim: PatternDimension, playerId: string): { key: string; label: string } | null {
  switch (dim) {
    case 'slot': return { key: b.slot, label: b.slot }
    case 'day': return { key: b.dayType, label: b.dayType === 'Weekday' ? 'Weekdays' : b.dayType === 'Holiday' ? 'Holidays' : b.dayType }
    case 'format': return b.format ? { key: b.format, label: b.format } : null
    case 'captain':
      // A player's own captaincy says nothing about their preference.
      if (!b.captainId || b.captainPlayerId === playerId) return null
      return { key: b.captainId, label: b.captainName ?? 'Unknown captain' }
    case 'ground':
      return b.groundId ? { key: b.groundId, label: b.groundName ?? 'Unknown ground' } : null
  }
}

const cellOf = (b: PatternBooking) => `${b.dayType}|${b.format}`

export function computePlayerPattern(
  player: PatternPlayer,
  offeredBookings: PatternBooking[],       // already limited to the player's window
  responseByBooking: Map<string, string>,
  withdrawals: number,
  selected: Set<string>,
  firstResponse: string | null,
): PlayerPattern {
  const isYes = (b: PatternBooking) => YES.has(responseByBooking.get(b.id) ?? '')
  const offered = offeredBookings.length
  let answered = 0, yes = 0, leave = 0, picked = 0

  // Player's own yes rate per day-type × format cell, for the confound check.
  const cellOff = new Map<string, number>()
  const cellYes = new Map<string, number>()
  for (const b of offeredBookings) {
    const r = responseByBooking.get(b.id)
    if (r) answered++
    if (r === 'L') leave++
    const y = isYes(b)
    if (y) {
      yes++
      if (selected.has(`${player.id}|${b.id}`)) picked++
    }
    const c = cellOf(b)
    cellOff.set(c, (cellOff.get(c) ?? 0) + 1)
    if (y) cellYes.set(c, (cellYes.get(c) ?? 0) + 1)
  }
  const cellRate = (b: PatternBooking) => {
    const c = cellOf(b)
    const o = cellOff.get(c) ?? 0
    return o ? (cellYes.get(c) ?? 0) / o : 0
  }

  const findings: PatternFinding[] = []
  const breakdown = {} as Record<PatternDimension, ValueBreakdown[]>

  for (const dim of DIMS) {
    const groups = new Map<string, { label: string; offered: number; yes: number; expected: number }>()
    let dimOffered = 0, dimYes = 0
    for (const b of offeredBookings) {
      const v = valueOf(b, dim, player.id)
      if (!v) continue
      const g = groups.get(v.key) ?? { label: v.label, offered: 0, yes: 0, expected: 0 }
      g.offered++
      g.expected += cellRate(b)
      dimOffered++
      if (isYes(b)) { g.yes++; dimYes++ }
      groups.set(v.key, g)
    }

    breakdown[dim] = Array.from(groups.entries())
      .map(([key, g]) => ({ key, label: g.label, offered: g.offered, yes: g.yes, rate: g.offered ? g.yes / g.offered : 0 }))
      .sort((a, b) => b.offered - a.offered || a.label.localeCompare(b.label))

    // A dimension with only one value on offer can't show a preference.
    if (groups.size < 2) continue

    groups.forEach((g, key) => {
      const otherOffered = dimOffered - g.offered
      const otherYes = dimYes - g.yes
      const rate = g.yes / g.offered
      const otherRate = otherOffered ? otherYes / otherOffered : 0
      const share = dimYes ? g.yes / dimYes : 0
      const base = { dim, key, label: g.label, yes: g.yes, offered: g.offered, rate, otherRate, share }

      const prefers =
        dimYes >= MIN_YES_FOR_PREFERENCE &&
        share >= PREFER_SHARE &&
        otherOffered > 0 &&
        (otherRate === 0 || rate / otherRate >= PREFER_LIFT) &&
        (!CONFOUNDED.has(dim) || g.yes >= CONFOUND_PREFER_RATIO * g.expected)
      if (prefers) {
        findings.push({ ...base, kind: 'prefers', strength: share >= ONLY_SHARE ? 'only' : 'mostly' })
        return
      }

      const avoids =
        g.offered >= MIN_OFFERED_FOR_AVOID &&
        otherRate >= AVOID_MIN_OTHER_RATE &&
        rate <= AVOID_RATIO * otherRate &&
        (!CONFOUNDED.has(dim) || (g.expected >= CONFOUND_MIN_EXPECTED && g.yes <= CONFOUND_RATIO * g.expected))
      if (avoids) {
        findings.push({ ...base, kind: 'avoids', strength: g.yes === 0 ? 'never' : 'rarely' })
      }
    })
  }

  // Strongest first: "only"/"never" before "mostly"/"rarely", then by sample.
  const rank = { only: 0, never: 0, mostly: 1, rarely: 1 }
  findings.sort((a, b) => rank[a.strength] - rank[b.strength] || b.offered - a.offered)

  const flags: ReliabilityFlag[] = []
  if (offered >= MIN_OFFERED_FOR_RESPONSE_FLAG && answered / offered < RARELY_RESPONDS_RATE) flags.push('rarely_responds')
  if (withdrawals >= WITHDRAW_MIN && yes > 0 && withdrawals / (yes + withdrawals) >= WITHDRAW_RATE) flags.push('often_withdraws')
  if (yes >= PICK_MIN_YES && picked / yes <= PICK_RATE) flags.push('rarely_picked')

  return {
    playerId: player.id, name: player.name, status: player.status,
    offered, answered, yes, leave, withdrawals, picked, firstResponse,
    findings, flags, breakdown,
    timing: emptyTiming(),
    reminders: { weeks: 0, answeredWeeks: 0, label: null, pushOff: false },
  }
}

// Sunday (IST) that starts the reminder week an instant belongs to.
function reminderWeekKey(iso: string): string {
  const ist = new Date(Date.parse(iso) + 5.5 * 3_600_000)
  ist.setUTCDate(ist.getUTCDate() - ist.getUTCDay())
  return ist.toISOString().slice(0, 10)
}

export function computeReminderResponse(
  reminderTimes: string[],
  ownResponseTimes: string[],
  pushSubscribed: boolean,
  now: string,
): ReminderResponse {
  const weeks = new Map<string, { first: number; last: number }>()
  for (const t of reminderTimes) {
    const k = reminderWeekKey(t), ms = Date.parse(t)
    const w = weeks.get(k)
    if (!w) weeks.set(k, { first: ms, last: ms })
    else { w.first = Math.min(w.first, ms); w.last = Math.max(w.last, ms) }
  }
  const grace = REMINDER_GRACE_HOURS * 3_600_000
  const nowMs = Date.parse(now)
  const answers = ownResponseTimes.map(t => Date.parse(t))
  let count = 0, answered = 0
  weeks.forEach(w => {
    if (w.last + grace > nowMs) return          // this week's window is still open
    count++
    if (answers.some(a => a > w.first && a <= w.last + grace)) answered++
  })
  let label: ReminderLabel | null = null
  if (count >= MIN_REMINDER_WEEKS) {
    if (answered / count >= ANSWERS_AFTER_REMINDERS_RATE) label = 'answers_after_reminders'
    else if (answered === 0) label = 'ignores_reminders'
  }
  return { weeks: count, answeredWeeks: answered, label, pushOff: !pushSubscribed }
}

function emptyTiming(): ResponseTiming {
  return { timed: 0, medianDaysBeforeCutoff: null, label: null, asSoonAsBooked: false, bands: { ahead: 0, week: 0, lastDay: 0, afterCutoff: 0 } }
}

const HOUR = 3_600_000

export function computeResponseTiming(
  playerId: string,
  offeredBookings: PatternBooking[],
  firstResponseAt: Map<string, string>,
): ResponseTiming {
  const t = emptyTiming()
  const daysBefore: number[] = []
  let soon = 0
  for (const b of offeredBookings) {
    if (!b.bookedAt || !b.cutoffAt) continue
    const at = firstResponseAt.get(`${playerId}|${b.id}`)
    if (!at) continue
    const booked = Date.parse(b.bookedAt), cutoff = Date.parse(b.cutoffAt), resp = Date.parse(at)
    // Backfilled bookings (created after the game) and late bookings have no
    // real window to answer in, so they say nothing about the player.
    if (!(cutoff - booked > MIN_WINDOW_HOURS * HOUR)) continue
    t.timed++
    const d = (cutoff - resp) / (24 * HOUR)
    daysBefore.push(d)
    if (d < 0) t.bands.afterCutoff++
    else if (d <= 1) t.bands.lastDay++
    else if (d < PLANS_AHEAD_DAYS) t.bands.week++
    else t.bands.ahead++
    if (resp - booked <= SOON_AFTER_BOOKING_HOURS * HOUR) soon++
  }
  if (t.timed === 0) return t
  daysBefore.sort((a, b) => a - b)
  const mid = Math.floor(daysBefore.length / 2)
  const median = daysBefore.length % 2 ? daysBefore[mid] : (daysBefore[mid - 1] + daysBefore[mid]) / 2
  t.medianDaysBeforeCutoff = median
  if (t.timed >= MIN_TIMED_RESPONSES) {
    if (median >= PLANS_AHEAD_DAYS) t.label = 'plans_ahead'
    else if (median <= LEAVES_LATE_DAYS) t.label = 'leaves_it_late'
    t.asSoonAsBooked = soon / t.timed >= SOON_AFTER_BOOKING_SHARE
  }
  return t
}

export function computeAvailabilityPatterns(input: PatternInput): PlayerPattern[] {
  const bookingsById = new Map(input.bookings.map(b => [b.id, b]))
  const byPlayer = new Map<string, Map<string, string>>()
  const firstDate = new Map<string, string>()
  for (const r of input.responses) {
    const b = bookingsById.get(r.bookingId)
    if (!b) continue
    const m = byPlayer.get(r.playerId) ?? new Map<string, string>()
    m.set(r.bookingId, r.response)
    byPlayer.set(r.playerId, m)
    const f = firstDate.get(r.playerId)
    if (!f || b.gameDate < f) firstDate.set(r.playerId, b.gameDate)
  }

  const sorted = [...input.bookings].sort((a, b) => a.gameDate.localeCompare(b.gameDate))
  const out: PlayerPattern[] = []
  for (const p of input.players) {
    const first = firstDate.get(p.id) ?? null
    const offered = first ? sorted.filter(b => b.gameDate >= first) : []
    const pattern = computePlayerPattern(
      p, offered, byPlayer.get(p.id) ?? new Map(),
      input.withdrawals.get(p.id) ?? 0, input.selected, first,
    )
    if (input.firstResponseAt) pattern.timing = computeResponseTiming(p.id, offered, input.firstResponseAt)
    if (input.reminders && input.now) {
      pattern.reminders = computeReminderResponse(
        input.reminders.get(p.id) ?? [], input.ownResponseTimes?.get(p.id) ?? [],
        input.pushSubscribed?.has(p.id) ?? false, input.now,
      )
    }
    out.push(pattern)
  }
  return out.sort((a, b) => a.name.localeCompare(b.name))
}

export function describeFinding(f: PatternFinding): string {
  const what = f.dim === 'captain' ? `under ${f.label}`
    : f.dim === 'ground' ? `at ${f.label}`
    : f.dim === 'day' ? `on ${f.label}`
    : f.dim === 'slot' ? `at ${f.label}`
    : `for ${f.label}`
  if (f.kind === 'prefers') return `${f.strength === 'only' ? 'Only' : 'Mostly'} available ${what}`
  return `${f.strength === 'never' ? 'Never' : 'Rarely'} available ${what}`
}

export const FLAG_LABEL: Record<ReliabilityFlag, string> = {
  rarely_responds: 'Rarely responds',
  often_withdraws: 'Often withdraws',
  rarely_picked: 'Rarely picked when available',
}

export const pct = (n: number) => `${Math.round(n * 100)}%`

export function formatDays(d: number): string {
  if (d < 0) return 'after the cutoff'
  if (d < 1) return `${Math.max(1, Math.round(d * 24))}h before the cutoff`
  return `${d < 10 ? d.toFixed(1) : Math.round(d)} days before the cutoff`
}

export const REMINDER_LABEL: Record<ReminderLabel, string> = {
  answers_after_reminders: 'Answers after reminders',
  ignores_reminders: "Doesn't answer reminders",
}

export const TIMING_LABEL: Record<TimingLabel, string> = {
  plans_ahead: 'Plans ahead',
  leaves_it_late: 'Leaves it late',
}
