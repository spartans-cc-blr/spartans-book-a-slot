import { describe, it, expect } from 'vitest'
import { isCompletedMatch } from './matchCompletion'

const today = '2026-10-17'
const none = new Set<string>()

describe('isCompletedMatch', () => {
  it('earlier days are completed, later days are not', () => {
    expect(isCompletedMatch({ id: 'a', game_date: '2026-10-16', slot_time: '07:30', format: 'T20' }, today, none)).toBe(true)
    expect(isCompletedMatch({ id: 'b', game_date: '2026-10-18', slot_time: '07:30', format: 'T20' }, today, none)).toBe(false)
  })
  it('a synced scorecard completes a match regardless of the clock', () => {
    expect(isCompletedMatch({ id: 'c', game_date: '2099-01-01', slot_time: '14:30', format: 'T30' }, today, new Set(['c']))).toBe(true)
  })
})
