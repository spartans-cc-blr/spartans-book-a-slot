import { describe, it, expect } from 'vitest'
import { mergeOpponentFields, displayOpponentName, normaliseOpponentName } from './opponents'

const base = { is_marquee: false, cricheroes_team_url: null, notes: null, auto_created: true }

describe('displayOpponentName / normaliseOpponentName', () => {
  it('keeps casing but collapses whitespace for display', () => {
    expect(displayOpponentName('  Royal   Aces CC ')).toBe('Royal Aces CC')
  })
  it('lowercases and collapses for the key', () => {
    expect(normaliseOpponentName('  Royal   Aces CC ')).toBe('royal aces cc')
  })
})

describe('mergeOpponentFields', () => {
  it('is marquee if either side was', () => {
    expect(mergeOpponentFields(base, { ...base, is_marquee: true }).is_marquee).toBe(true)
    expect(mergeOpponentFields({ ...base, is_marquee: true }, base).is_marquee).toBe(true)
  })
  it('prefers the target url, else falls back to the source', () => {
    expect(mergeOpponentFields({ ...base, cricheroes_team_url: 'a' }, { ...base, cricheroes_team_url: 'b' }).cricheroes_team_url).toBe('a')
    expect(mergeOpponentFields(base, { ...base, cricheroes_team_url: 'b' }).cricheroes_team_url).toBe('b')
  })
  it('joins distinct notes and drops blanks/duplicates', () => {
    expect(mergeOpponentFields({ ...base, notes: 'x' }, { ...base, notes: 'y' }).notes).toBe('x · y')
    expect(mergeOpponentFields({ ...base, notes: 'x' }, { ...base, notes: 'x' }).notes).toBe('x')
    expect(mergeOpponentFields({ ...base, notes: ' ' }, base).notes).toBeNull()
  })
  it('stays auto_created only if both sides were', () => {
    expect(mergeOpponentFields(base, base).auto_created).toBe(true)
    expect(mergeOpponentFields({ ...base, auto_created: false }, base).auto_created).toBe(false)
    expect(mergeOpponentFields(base, { ...base, auto_created: false }).auto_created).toBe(false)
  })
})
