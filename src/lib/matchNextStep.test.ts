import { describe, it, expect } from 'vitest'
import { computeNextStep, type NextStepInput } from './matchNextStep'

const base: NextStepInput = {
  status: 'confirmed', match_id: '123', is_practice: false,
  scorecard_status: null, fees_reconciled_externally: false, needs_reconciliation: false,
}

describe('computeNextStep', () => {
  it('ignores non-confirmed bookings', () => {
    expect(computeNextStep({ ...base, status: 'soft_block' })).toBeNull()
  })
  it('walks the scorecard → sync → fee sequence', () => {
    expect(computeNextStep(base)?.kind).toBe('no_scorecard')
    expect(computeNextStep({ ...base, match_id: null })?.kind).toBe('no_match_id')
    expect(computeNextStep({ ...base, scorecard_status: 'pending_parse' })?.kind).toBe('no_scorecard')
    expect(computeNextStep({ ...base, scorecard_status: 'parsed' })?.kind).toBe('awaiting_sync')
    expect(computeNextStep({ ...base, scorecard_status: 'synced' })?.kind).toBe('fee_due')
    expect(computeNextStep({ ...base, scorecard_status: 'fees_applied' })).toBeNull()
  })
  it('never asks for a fee on practice or externally-settled games', () => {
    expect(computeNextStep({ ...base, scorecard_status: 'synced', is_practice: true })).toBeNull()
    expect(computeNextStep({ ...base, scorecard_status: 'synced', fees_reconciled_externally: true })).toBeNull()
  })
  it('flagged stats take priority', () => {
    expect(computeNextStep({ ...base, scorecard_status: 'fees_applied', needs_reconciliation: true })?.kind).toBe('flagged')
  })
})
