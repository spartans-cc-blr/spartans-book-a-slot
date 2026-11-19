import { describe, it, expect } from 'vitest'
import { computeAvailabilityPatterns, describeFinding, type PatternBooking, type PatternResponse } from './availabilityPatternsCore'

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
