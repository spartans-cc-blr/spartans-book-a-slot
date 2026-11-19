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
  dayType: 'Sat' | 'Sun' | 'Weekday'
  captainId: string | null
  captainName: string | null
  captainPlayerId: string | null
  groundId: string | null
  groundName: string | null
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

const YES = new Set(['Y', 'O', 'E'])
const DIMS: PatternDimension[] = ['slot', 'day', 'format', 'captain', 'ground']
// Dimensions that can be explained by day/format: a captain may lead only
// weekday T30 games, so "avoids that captain" is checked against what the
// player's day/format habits would predict before it is reported.
const CONFOUNDED = new Set<PatternDimension>(['captain', 'ground'])

function valueOf(b: PatternBooking, dim: PatternDimension, playerId: string): { key: string; label: string } | null {
  switch (dim) {
    case 'slot': return { key: b.slot, label: b.slot }
    case 'day': return { key: b.dayType, label: b.dayType === 'Weekday' ? 'Weekdays' : b.dayType }
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
  }
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
    out.push(computePlayerPattern(
      p, offered, byPlayer.get(p.id) ?? new Map(),
      input.withdrawals.get(p.id) ?? 0, input.selected, first,
    ))
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
