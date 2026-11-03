import { describe, it, expect } from 'vitest'
import { buildRematchCopy, formatNudgeDateTime, type NudgeBooking } from '@/lib/availabilityNudge'
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
  it('names the opponent, the past performance, and links the old scorecard', () => {
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
    expect(body).toContain('https://hub.spartanscricketclub.in/matches/history/old-booking-id')
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

  it('combines a batting and a bowling highlight in one sentence, linking the batting scorecard', () => {
    const info: RematchRecallInfo = {
      playerId: 'p2',
      opponentName: 'Royal Connect Logistics',
      batting: { runs: 60, balls: 40, notOut: false, bookingId: 'bat-match', gameDate: '2026-06-06', ground: 'Macushala' },
      bowling: { wickets: 3, runsConceded: 20, bookingId: 'bowl-match', gameDate: '2026-05-01', ground: 'Blendin' },
    }
    const { body } = buildRematchCopy(makeBooking(), info)
    expect(body).toContain('scored 60 off 40 balls')
    expect(body).toContain('3-wicket haul')
    expect(body).toContain('bat-match')
    expect(body).not.toContain('bowl-match')
  })

  it('falls back to just the bowling highlight and its own scorecard when there is no batting one', () => {
    const info: RematchRecallInfo = {
      playerId: 'p3',
      opponentName: 'Royal Connect Logistics',
      bowling: { wickets: 3, runsConceded: 18, bookingId: 'old-bowl', gameDate: '2026-06-06', ground: 'Macushala' },
    }
    const { body } = buildRematchCopy(makeBooking(), info)
    expect(body).toContain('3-wicket haul')
    expect(body).toContain('old-bowl')
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
