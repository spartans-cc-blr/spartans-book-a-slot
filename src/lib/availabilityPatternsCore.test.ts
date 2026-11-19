import { describe, it, expect } from 'vitest'
import { computeAvailabilityPatterns, computeResponseTiming, computeReminderResponse, describeFinding, type PatternBooking, type PatternResponse } from './availabilityPatternsCore'

function bk(i: number, over: Partial<PatternBooking> = {}): PatternBooking {
  const d = new Date(Date.UTC(2026, 3, 4 + i)) // 4 Apr 2026 onward
  const gameDate = d.toISOString().slice(0, 10)
  const dow = d.getUTCDay()
  return {
    id: `b${i}`, gameDate, slot: '07:30', format: 'T20',
    dayType: dow === 6 ? 'Sat' : dow === 0 ? 'Sun' : 'Weekday',
    captainId: 'cA', captainName: 'Capt A', captainPlayerId: null,
    groundId: 'g1', groundName: 'Ground 1', ...over,
  }
}

const player = { id: 'p1', name: 'Player One', status: 'active' }
const run = (bookings: PatternBooking[], responses: PatternResponse[], extra: Partial<{ withdrawals: Map<string, number>; selected: Set<string> }> = {}) =>
  computeAvailabilityPatterns({
    bookings, players: [player], responses,
    withdrawals: extra.withdrawals ?? new Map(), selected: extra.selected ?? new Set(),
  })[0]

describe('computeAvailabilityPatterns', () => {
  it('flags a format the player mostly marks for', () => {
    const bookings = Array.from({ length: 20 }, (_, i) => bk(i, { format: i % 2 ? 'T30' : 'T20' }))
    const responses = bookings.filter(b => b.format === 'T20').map(b => ({ playerId: 'p1', bookingId: b.id, response: 'Y' }))
    const p = run(bookings, responses)
    const f = p.findings.find(x => x.dim === 'format' && x.kind === 'prefers')
    expect(f?.label).toBe('T20')
    expect(f?.strength).toBe('only')
    expect(describeFinding(f!)).toBe('Only available for T20')
  })

  it('flags a captain the player never marks under, when day/format do not explain it', () => {
    const bookings = Array.from({ length: 24 }, (_, i) => bk(i, { captainId: i % 2 ? 'cB' : 'cA', captainName: i % 2 ? 'Capt B' : 'Capt A' }))
    const responses = bookings.filter(b => b.captainId === 'cA').map(b => ({ playerId: 'p1', bookingId: b.id, response: 'Y' }))
    const p = run(bookings, responses)
    expect(p.findings.some(x => x.dim === 'captain' && x.kind === 'avoids' && x.label === 'Capt B' && x.strength === 'never')).toBe(true)
  })

  it('does not blame a captain when the format explains the gap', () => {
    // Capt B leads every T30 game; the player never plays T30 at all.
    const bookings = Array.from({ length: 24 }, (_, i) => bk(i, {
      format: i % 2 ? 'T30' : 'T20',
      captainId: i % 2 ? 'cB' : 'cA', captainName: i % 2 ? 'Capt B' : 'Capt A',
    }))
    const responses = bookings.filter(b => b.format === 'T20').map(b => ({ playerId: 'p1', bookingId: b.id, response: 'Y' }))
    const p = run(bookings, responses)
    expect(p.findings.some(x => x.dim === 'captain')).toBe(false)
    expect(p.findings.some(x => x.dim === 'format')).toBe(true)
  })

  it('ignores games the player captained themselves', () => {
    const bookings = Array.from({ length: 12 }, (_, i) => bk(i, { captainId: 'cA', captainPlayerId: 'p1' }))
    const p = run(bookings, [{ playerId: 'p1', bookingId: 'b0', response: 'Y' }])
    expect(p.breakdown.captain).toEqual([])
  })

  it('needs enough yes responses before calling a preference', () => {
    const bookings = Array.from({ length: 20 }, (_, i) => bk(i, { format: i % 2 ? 'T30' : 'T20' }))
    const responses = bookings.filter(b => b.format === 'T20').slice(0, 4).map(b => ({ playerId: 'p1', bookingId: b.id, response: 'Y' }))
    expect(run(bookings, responses).findings.filter(f => f.kind === 'prefers')).toEqual([])
  })

  it('only counts games from the first response onward', () => {
    const bookings = Array.from({ length: 10 }, (_, i) => bk(i))
    const p = run(bookings, [{ playerId: 'p1', bookingId: 'b6', response: 'Y' }])
    expect(p.offered).toBe(4)
    expect(p.firstResponse).toBe(bookings[6].gameDate)
  })

  it('treats weekday holidays as their own day type', () => {
    // Never plays working weekdays, always plays on holidays.
    const work = Array.from({ length: 8 }, (_, i) => bk(i, { id: `w${i}`, dayType: 'Weekday' }))
    const hol = Array.from({ length: 3 }, (_, i) => bk(i + 10, { id: `h${i}`, dayType: 'Holiday' }))
    const sat = Array.from({ length: 8 }, (_, i) => bk(i + 20, { id: `s${i}`, dayType: 'Sat' }))
    const bookings = [...hol, ...sat, ...work].map((b, i) => ({ ...b, gameDate: `2026-05-${String(i + 1).padStart(2, '0')}` }))
    const responses = [...hol, ...sat].map(b => ({ playerId: 'p1', bookingId: b.id, response: 'Y' }))
    const p = run(bookings, responses)
    const wk = p.findings.find(f => f.dim === 'day' && f.key === 'Weekday')
    expect(wk?.kind).toBe('avoids')
    expect(wk?.yes).toBe(0)
    expect(p.breakdown.day.find(v => v.key === 'Holiday')).toMatchObject({ yes: 3, offered: 3 })
  })

  it('sets reliability flags', () => {
    const bookings = Array.from({ length: 12 }, (_, i) => bk(i))
    const responses = bookings.slice(0, 10).map(b => ({ playerId: 'p1', bookingId: b.id, response: 'Y' }))
    const p = run(bookings, responses, { withdrawals: new Map([['p1', 4]]), selected: new Set(['p1|b0']) })
    expect(p.flags).toContain('often_withdraws')
    expect(p.flags).toContain('rarely_picked')
    expect(p.picked).toBe(1)
    const quiet = run(bookings, [{ playerId: 'p1', bookingId: 'b0', response: 'L' }])
    expect(quiet.flags).toContain('rarely_responds')
  })
})

describe('computeResponseTiming', () => {
  const H = 3_600_000
  // Game i: booked 20 days before its cutoff.
  const games = Array.from({ length: 8 }, (_, i) => {
    const cutoff = Date.UTC(2026, 5, 1 + i * 7, 2, 30) // Thu 08:00 IST
    return { ...bk(i), id: `t${i}`, cutoffAt: new Date(cutoff).toISOString(), bookedAt: new Date(cutoff - 20 * 24 * H).toISOString() }
  })
  const answeredAt = (daysBefore: number) => new Map(games.map(g => [`p1|${g.id}`, new Date(Date.parse(g.cutoffAt!) - daysBefore * 24 * H).toISOString()]))

  it('labels a player who answers a week or more ahead', () => {
    const t = computeResponseTiming('p1', games, answeredAt(10))
    expect(t.timed).toBe(8)
    expect(t.label).toBe('plans_ahead')
    expect(t.bands.ahead).toBe(8)
    expect(t.asSoonAsBooked).toBe(false)
  })

  it('labels a player who answers in the last 2 days', () => {
    const t = computeResponseTiming('p1', games, answeredAt(0.5))
    expect(t.label).toBe('leaves_it_late')
    expect(t.bands.lastDay).toBe(8)
  })

  it('flags answering as soon as a game is booked', () => {
    const t = computeResponseTiming('p1', games, answeredAt(19.5))
    expect(t.asSoonAsBooked).toBe(true)
  })

  it('counts answers after the cutoff and needs 6 timed answers for a label', () => {
    const t = computeResponseTiming('p1', games.slice(0, 5), answeredAt(-1))
    expect(t.bands.afterCutoff).toBe(5)
    expect(t.label).toBeNull()
  })

  it('skips games booked after the cutoff (backfilled) or too close to it', () => {
    const odd = games.map((g, i) => i < 4
      ? { ...g, bookedAt: new Date(Date.parse(g.cutoffAt!) + 24 * H).toISOString() }
      : { ...g, bookedAt: new Date(Date.parse(g.cutoffAt!) - 48 * H).toISOString() })
    expect(computeResponseTiming('p1', odd, answeredAt(1)).timed).toBe(0)
  })
})

describe('computeReminderResponse', () => {
  // Reminder weeks: Sun–Wed 20:45 IST = 15:15 UTC, starting Sun 5 Jul 2026.
  const week = (w: number) => [0, 1, 2, 3].map(d => new Date(Date.UTC(2026, 6, 5 + w * 7 + d, 15, 15)).toISOString())
  const reminders = [0, 1, 2, 3, 4].flatMap(week)
  const now = '2026-09-01T00:00:00.000Z'
  // An answer on the Monday night after the reminder (1h later).
  const answerIn = (w: number) => new Date(Date.UTC(2026, 6, 6 + w * 7, 16, 15)).toISOString()

  it('labels a player who usually answers after reminders', () => {
    const r = computeReminderResponse(reminders, [0, 1, 2].map(answerIn), true, now)
    expect(r).toMatchObject({ weeks: 5, answeredWeeks: 3, label: 'answers_after_reminders', pushOff: false })
  })

  it('labels a player who never answers in a reminder week', () => {
    const r = computeReminderResponse(reminders, [], false, now)
    expect(r).toMatchObject({ weeks: 5, answeredWeeks: 0, label: 'ignores_reminders', pushOff: true })
  })

  it('does not count an answer before the first reminder of the week', () => {
    const early = new Date(Date.UTC(2026, 6, 4, 10)).toISOString() // Sat before week 0
    expect(computeReminderResponse(week(0), [early], true, now).answeredWeeks).toBe(0)
  })

  it('leaves out a week whose window is still open, and needs 4 weeks for a label', () => {
    const r = computeReminderResponse(reminders, [], true, '2026-08-05T20:00:00.000Z') // during week 4
    expect(r.weeks).toBe(4)
    expect(computeReminderResponse(week(0), [], true, now).label).toBeNull()
  })
})
