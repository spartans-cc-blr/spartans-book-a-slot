import { describe, it, expect } from 'vitest'
import {
  normaliseMatchResultKind, deriveBattedFirst, buildTossLine, buildOrderedScoreLine,
  computeMatchMargin, buildResultLine,
} from './matchResultDisplay'

describe('normaliseMatchResultKind', () => {
  it('recognises won/lost/tied/nr, case-insensitively', () => {
    expect(normaliseMatchResultKind('WON')).toBe('won')
    expect(normaliseMatchResultKind('Lost')).toBe('lost')
    expect(normaliseMatchResultKind('Tied')).toBe('tied')
    expect(normaliseMatchResultKind('No Result')).toBe('nr')
    expect(normaliseMatchResultKind(null)).toBeNull()
    expect(normaliseMatchResultKind('rained out')).toBeNull()
  })
})

describe('deriveBattedFirst', () => {
  it('we won the toss and batted -> batted first', () => {
    expect(deriveBattedFirst('Y', 'bat')).toBe(true)
  })
  it('we won the toss and fielded -> did not bat first', () => {
    expect(deriveBattedFirst('Y', 'field')).toBe(false)
  })
  it('opponent won the toss and elected to bat -> we did not bat first', () => {
    expect(deriveBattedFirst('N', 'bat')).toBe(false)
  })
  it('opponent won the toss and elected to field -> we batted first', () => {
    expect(deriveBattedFirst('N', 'field')).toBe(true)
  })
  it('missing data returns null', () => {
    expect(deriveBattedFirst(null, 'bat')).toBeNull()
    expect(deriveBattedFirst('Y', null)).toBeNull()
  })
})

describe('buildTossLine', () => {
  it('describes a won toss as our own elected action', () => {
    expect(buildTossLine('Y', 'bat')).toBe('Spartans CC won the toss and elected to bat')
    expect(buildTossLine('Y', 'field')).toBe('Spartans CC won the toss and elected to field')
  })
  it('describes a lost toss as being put in to the opposite of what the opponent chose', () => {
    expect(buildTossLine('N', 'bat')).toBe('Spartans CC lost the toss and was put in to field')
    expect(buildTossLine('N', 'field')).toBe('Spartans CC lost the toss and was put in to bat')
  })
  it('returns null without toss data', () => {
    expect(buildTossLine(null, null)).toBeNull()
  })
})

describe('buildOrderedScoreLine', () => {
  it('puts our own score first when we batted first', () => {
    expect(buildOrderedScoreLine(true, 150, 5, 20, 120, 10, 18.4)).toBe('150/5 (20 ov) vs 120/10 (18.4 ov)')
  })
  it('puts the opponent score first when they batted first', () => {
    expect(buildOrderedScoreLine(false, 150, 5, 20, 120, 10, 18.4)).toBe('120/10 (18.4 ov) vs 150/5 (20 ov)')
  })
  it('falls back to own-first order when battedFirst is unknown', () => {
    expect(buildOrderedScoreLine(null, 150, 5, 20, 120, 10, 18.4)).toBe('150/5 (20 ov) vs 120/10 (18.4 ov)')
  })
})

describe('computeMatchMargin', () => {
  it('a win batting first is a runs margin (defended)', () => {
    expect(computeMatchMargin('won', true, 150, 5, 120, 10)).toEqual({ kind: 'runs', value: 30 })
  })
  it('a win batting second is a wickets margin (chased)', () => {
    expect(computeMatchMargin('won', false, 121, 4, 120, 10)).toEqual({ kind: 'wickets', value: 6 })
  })
  it('a loss batting first is a wickets margin (opponent chased)', () => {
    expect(computeMatchMargin('lost', true, 120, 10, 121, 4)).toEqual({ kind: 'wickets', value: 6 })
  })
  it('a loss batting second is a runs margin (we fell short)', () => {
    expect(computeMatchMargin('lost', false, 120, 10, 150, 5)).toEqual({ kind: 'runs', value: 30 })
  })
  it('a tie has no margin', () => {
    expect(computeMatchMargin('tied', true, 120, 10, 120, 8)).toBeNull()
  })
})

describe('buildResultLine', () => {
  it('a win with a margin is a pill-worthy "WON BY N RUNS/WICKETS" line', () => {
    expect(buildResultLine('WON', { kind: 'runs', value: 30 })).toEqual({ kind: 'won', label: 'WON BY 30 RUNS' })
    expect(buildResultLine('WON', { kind: 'wickets', value: 6 })).toEqual({ kind: 'won', label: 'WON BY 6 WICKETS' })
  })
  it('a loss with a margin is plain-text "LOST BY N RUNS/WICKETS"', () => {
    expect(buildResultLine('LOST', { kind: 'wickets', value: 6 })).toEqual({ kind: 'lost', label: 'LOST BY 6 WICKETS' })
    expect(buildResultLine('LOST', { kind: 'runs', value: 30 })).toEqual({ kind: 'lost', label: 'LOST BY 30 RUNS' })
  })
  it('falls back to a bare WON/LOST when no margin can be computed yet', () => {
    expect(buildResultLine('WON', null)).toEqual({ kind: 'won', label: 'WON' })
    expect(buildResultLine('LOST', null)).toEqual({ kind: 'lost', label: 'LOST' })
  })
  it('a tie is always just "MATCH TIED", margin or not', () => {
    expect(buildResultLine('TIED', null)).toEqual({ kind: 'tied', label: 'MATCH TIED' })
  })
  it('an unrecognised result falls back to the raw uppercased string', () => {
    expect(buildResultLine('rained out', null)).toEqual({ kind: null, label: 'RAINED OUT' })
  })
  it('no result string at all renders nothing', () => {
    expect(buildResultLine(null, null)).toBeNull()
    expect(buildResultLine(undefined, null)).toBeNull()
  })
})
