import { describe, it, expect } from 'vitest'
import { oneDayTournamentDates, isWeekdayHoliday } from './holidays'

describe('holidays', () => {
  it('knows listed weekday holidays', () => {
    expect(isWeekdayHoliday('2026-09-14')).toBe(true)
    expect(isWeekdayHoliday('2026-09-15')).toBe(false)
  })

  it('detects a one-day tournament: 2+ games, same tournament and format, same date', () => {
    const dates = oneDayTournamentDates([
      { gameDate: '2026-10-21', tournamentId: 't1', format: 'T20' },
      { gameDate: '2026-10-21', tournamentId: 't1', format: 'T20' },
      // different formats in one tournament on one date: not a one-day event
      { gameDate: '2026-10-23', tournamentId: 't2', format: 'T20' },
      { gameDate: '2026-10-23', tournamentId: 't2', format: 'T30' },
      // two tournaments, one game each: not a one-day event
      { gameDate: '2026-10-30', tournamentId: 't3', format: 'T30' },
      { gameDate: '2026-10-30', tournamentId: 't4', format: 'T30' },
      // no tournament: ignored
      { gameDate: '2026-11-02', tournamentId: null, format: 'T20' },
      { gameDate: '2026-11-02', tournamentId: null, format: 'T20' },
    ])
    expect(Array.from(dates)).toEqual(['2026-10-21'])
  })
})
