import { describe, it, expect } from 'vitest'
import {
  buildRematchCopy,
  buildRematchReadyCopy,
  pickRematchReadyCandidate,
  formatNudgeDateTime,
  type NudgeBooking,
} from '@/lib/availabilityNudge'
import type { RematchRecallInfo } from '@/lib/nudgeRematch'

function makeBooking(overrides: Partial<NudgeBooking> = {}): NudgeBooking {
  return {
    id: 'upcoming-booking',
    game_date: '2026-11-07',
    slot_time: '07:30',
    match_time: '07:30',
    format: 'T20',
    tournament_id: null,
    tournament_name: null,
    opponent_id: 'opp-1',
    opponent_name: 'Royal Connect Logistics',
    ground_id: null,
    ground_name: 'Mario Sixers',
    tournament_is_practice: false,
    ...overrides,
  }
}

describe('buildRematchCopy', () => {
  it('names the opponent, the past performance, without a scorecard URL', () => {
    const info: RematchRecallInfo = {
      playerId: 'p1',
      opponentName: 'Royal Connect Logistics',
      batting: {
        runs: 51,
        balls: 42,
        notOut: false,
        bookingId: 'old-booking-id',
        gameDate: '2026-06-06',
        ground: 'Macushala',
      },
    }
    const booking = makeBooking()
    const { title, body } = buildRematchCopy(booking, info)

    expect(title).toContain('Rematch')
    expect(body).toContain('Royal Connect Logistics')
    expect(body).toContain('scored 51 off 42 balls')
    expect(body).toContain('Macushala')
    expect(body).toContain('6 Jun')
    expect(body).not.toContain('http') // no URL in a push body (Chrome spam signal)
    expect(body).toContain(formatNudgeDateTime(booking))
    expect(body).toContain('Mark your availability!')
    // No raw counts/comparisons beyond the player's own named achievement.
    expect(body).not.toMatch(/\d+ players?/)
  })

  it('marks a not-out score with an asterisk', () => {
    const info: RematchRecallInfo = {
      playerId: 'p1',
      opponentName: 'Royal Connect Logistics',
      batting: { runs: 51, balls: 42, notOut: true, bookingId: 'b', gameDate: '2026-06-06', ground: null },
    }
    const { body } = buildRematchCopy(makeBooking(), info)
    expect(body).toContain('51*')
  })

  it('combines a batting and a bowling highlight in one sentence', () => {
    const info: RematchRecallInfo = {
      playerId: 'p2',
      opponentName: 'Royal Connect Logistics',
      batting: { runs: 60, balls: 40, notOut: false, bookingId: 'bat-match', gameDate: '2026-06-06', ground: 'Macushala' },
      bowling: { wickets: 3, runsConceded: 20, bookingId: 'bowl-match', gameDate: '2026-05-01', ground: 'Blendin' },
    }
    const { body } = buildRematchCopy(makeBooking(), info)
    expect(body).toContain('scored 60 off 40 balls')
    expect(body).toContain('3-wicket haul')
    expect(body).not.toContain('bat-match')
    expect(body).not.toContain('bowl-match')
  })

  it('falls back to just the bowling highlight when there is no batting one', () => {
    const info: RematchRecallInfo = {
      playerId: 'p3',
      opponentName: 'Royal Connect Logistics',
      bowling: { wickets: 3, runsConceded: 18, bookingId: 'old-bowl', gameDate: '2026-06-06', ground: 'Macushala' },
    }
    const { body } = buildRematchCopy(makeBooking(), info)
    expect(body).toContain('3-wicket haul')
    expect(body).not.toContain('old-bowl')
  })

  it('degrades gracefully with no ground/date on record', () => {
    const info: RematchRecallInfo = {
      playerId: 'p4',
      opponentName: 'Royal Connect Logistics',
      batting: { runs: 55, balls: 30, notOut: false, bookingId: 'b', gameDate: null, ground: null },
    }
    const { body } = buildRematchCopy(makeBooking(), info)
    expect(body).toContain('last time we met!')
  })
})

describe('buildRematchReadyCopy', () => {
  it('names the achievement without asking the player to mark availability', () => {
    const info: RematchRecallInfo = {
      playerId: 'p1',
      opponentName: 'Royal Connect Logistics',
      batting: {
        runs: 51,
        balls: 42,
        notOut: false,
        bookingId: 'old-booking-id',
        gameDate: '2026-06-06',
        ground: 'Macushala',
      },
    }
    const booking = makeBooking()
    const { title, body } = buildRematchReadyCopy(booking, info)

    expect(title).toContain('🔥')
    expect(body).toContain('Royal Connect Logistics')
    expect(body).toContain('scored 51 off 42 balls')
    expect(body).toContain('Macushala')
    expect(body).toContain('6 Jun')
    expect(body).not.toContain('http')
    expect(body).toContain(formatNudgeDateTime(booking))
    // This player has already answered — never ask them to mark availability.
    expect(body).not.toContain('Mark your availability')
  })

  it('combines a batting and a bowling highlight', () => {
    const info: RematchRecallInfo = {
      playerId: 'p2',
      opponentName: 'Royal Connect Logistics',
      batting: { runs: 60, balls: 40, notOut: false, bookingId: 'bat-match', gameDate: '2026-06-06', ground: 'Macushala' },
      bowling: { wickets: 3, runsConceded: 20, bookingId: 'bowl-match', gameDate: '2026-05-01', ground: 'Blendin' },
    }
    const { body } = buildRematchReadyCopy(makeBooking(), info)
    expect(body).toContain('scored 60 off 40 balls')
    expect(body).toContain('3-wicket haul')
    expect(body).not.toContain('bat-match')
    expect(body).not.toContain('bowl-match')
  })

  it('degrades gracefully with no ground/date on record', () => {
    const info: RematchRecallInfo = {
      playerId: 'p4',
      opponentName: 'Royal Connect Logistics',
      batting: { runs: 55, balls: 30, notOut: false, bookingId: 'b', gameDate: null, ground: null },
    }
    const { body } = buildRematchReadyCopy(makeBooking(), info)
    expect(body).toContain('last time we met you scored 55 off 30 balls.')
  })
})

describe('pickRematchReadyCandidate', () => {
  const info: RematchRecallInfo = {
    playerId: 'p1',
    opponentName: 'Royal Connect Logistics',
    batting: { runs: 51, balls: 42, notOut: false, bookingId: 'old', gameDate: '2026-06-06', ground: 'Macushala' },
  }

  it('returns null with no already-answered bookings', () => {
    expect(pickRematchReadyCandidate('p1', [], new Map(), new Set(), new Set())).toBeNull()
  })

  it('returns null when the theme was already used this week', () => {
    const booking = makeBooking()
    const rematchRecalls = new Map([[booking.id, [info]]])
    const usedThemes = new Set<any>(['rematch_ready'])
    expect(pickRematchReadyCandidate('p1', [booking], rematchRecalls, usedThemes, new Set())).toBeNull()
  })

  it('returns null when none of the already-answered bookings have a recall for this player', () => {
    const booking = makeBooking()
    const rematchRecalls = new Map([[booking.id, [{ ...info, playerId: 'someone-else' }]]])
    expect(pickRematchReadyCandidate('p1', [booking], rematchRecalls, new Set(), new Set())).toBeNull()
  })

  it('returns a candidate for a matching already-answered booking', () => {
    const booking = makeBooking()
    const rematchRecalls = new Map([[booking.id, [info]]])
    const candidate = pickRematchReadyCandidate('p1', [booking], rematchRecalls, new Set(), new Set())
    expect(candidate).toEqual({ playerId: 'p1', theme: 'rematch_ready', booking, info })
  })

  it('prefers a booking not already referenced by an earlier nudge this week', () => {
    const bookingA = makeBooking({ id: 'a' })
    const bookingB = makeBooking({ id: 'b' })
    const infoA = { ...info, playerId: 'p1' }
    const infoB = { ...info, playerId: 'p1' }
    const rematchRecalls = new Map([[bookingA.id, [infoA]], [bookingB.id, [infoB]]])
    const candidate = pickRematchReadyCandidate('p1', [bookingA, bookingB], rematchRecalls, new Set(), new Set(['a']))
    expect(candidate?.booking.id).toBe('b')
  })
})
