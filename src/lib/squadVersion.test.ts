import { describe, it, expect } from 'vitest'
import { computeSquadVersion, EMPTY_SQUAD_VERSION, type SquadVersionRow } from './squadVersion'

function row(overrides: Partial<SquadVersionRow> = {}): SquadVersionRow {
  return {
    player_id: 'p1',
    status: 'draft',
    is_captain: false,
    is_vc: false,
    is_wk: false,
    match_role: null,
    ...overrides,
  }
}

describe('computeSquadVersion', () => {
  it('is deterministic for the same row set', () => {
    const rows = [row({ player_id: 'p1' }), row({ player_id: 'p2' })]
    expect(computeSquadVersion(rows)).toBe(computeSquadVersion(rows))
  })

  it('is independent of row order (two fetches of the same DB state must agree)', () => {
    const a = [row({ player_id: 'p1' }), row({ player_id: 'p2' })]
    const b = [row({ player_id: 'p2' }), row({ player_id: 'p1' })]
    expect(computeSquadVersion(a)).toBe(computeSquadVersion(b))
  })

  it('changes when a player is added', () => {
    const before = [row({ player_id: 'p1' })]
    const after  = [row({ player_id: 'p1' }), row({ player_id: 'p2' })]
    expect(computeSquadVersion(before)).not.toBe(computeSquadVersion(after))
  })

  it('changes when a player is removed', () => {
    const before = [row({ player_id: 'p1' }), row({ player_id: 'p2' })]
    const after  = [row({ player_id: 'p1' })]
    expect(computeSquadVersion(before)).not.toBe(computeSquadVersion(after))
  })

  it('changes when status changes', () => {
    const before = [row({ status: 'draft' })]
    const after  = [row({ status: 'pending_approval' })]
    expect(computeSquadVersion(before)).not.toBe(computeSquadVersion(after))
  })

  it('changes when a role flag changes', () => {
    const before = [row({ is_captain: false })]
    const after  = [row({ is_captain: true })]
    expect(computeSquadVersion(before)).not.toBe(computeSquadVersion(after))
  })

  it('changes when match_role changes', () => {
    const before = [row({ match_role: 'bat' })]
    const after  = [row({ match_role: 'bowl' })]
    expect(computeSquadVersion(before)).not.toBe(computeSquadVersion(after))
  })

  it('empty squad has a stable, well-known version', () => {
    expect(computeSquadVersion([])).toBe(EMPTY_SQUAD_VERSION)
  })
})
