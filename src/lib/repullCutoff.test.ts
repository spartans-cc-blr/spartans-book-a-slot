import { describe, it, expect } from 'vitest'
import { isBeforePlayerPendingFeeStart, isBeforePromptCutoff } from './repullCutoff'

describe('player pending-fee cutoff', () => {
  it('starts on 1 Nov 2026', () => {
    expect(isBeforePlayerPendingFeeStart('2026-10-31')).toBe(true)
    expect(isBeforePlayerPendingFeeStart('2026-11-01')).toBe(false)
    expect(isBeforePlayerPendingFeeStart('2026-11-07T00:00:00')).toBe(false)
  })
  it('is stricter than the admin reminder cutoff', () => {
    expect(isBeforePromptCutoff('2026-10-15')).toBe(false)
    expect(isBeforePlayerPendingFeeStart('2026-10-15')).toBe(true)
  })
})
