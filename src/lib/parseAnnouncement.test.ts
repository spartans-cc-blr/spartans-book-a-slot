import { describe, it, expect } from 'vitest'
import { parseAnnouncement } from './parseAnnouncement'

describe('parseAnnouncement', () => {
  it('extracts booking_id_from_link from a /fixtures/<uuid> link', () => {
    const text = [
      '📅 *5th July (Sunday)*',
      'Format: T20',
      '',
      '*Team*',
      '1. John Doe',
      '',
      `🔗 Match card: https://hub.spartanscricketclub.in/fixtures/a1b2c3d4-e5f6-7890-abcd-ef1234567890`,
    ].join('\n')

    const result = parseAnnouncement(text)
    expect(result.booking_id_from_link).toBe('a1b2c3d4-e5f6-7890-abcd-ef1234567890')
  })

  it('extracts match_id from a CricHeroes scorecard link when there is no fixtures link', () => {
    const text = [
      '📅 *5th July (Sunday)*',
      'Format: T20',
      '',
      '*Team*',
      '1. John Doe',
      '',
      '*Match Link:*',
      'https://cricheroes.in/scorecard/98765432/spartans-vs-opponents',
    ].join('\n')

    const result = parseAnnouncement(text)
    expect(result.booking_id_from_link).toBeNull()
    expect(result.match_id).toBe('98765432')
  })

  it('extracts date_raw and format_raw', () => {
    const text = [
      '📅 *5th July (Sunday)*',
      'Format: T30',
      '',
      '*Team*',
      '1. John Doe',
    ].join('\n')

    const result = parseAnnouncement(text)
    expect(result.date_raw).toBe('5th July')
    expect(result.format_raw).toBe('T30')
  })

  it('parses a basic numbered Team block and stops at the Opponent line', () => {
    const text = [
      '*Team*',
      '1. John Doe',
      '2. Jane Smith',
      '*Opponent:* Rising Phoenix CC',
    ].join('\n')

    const result = parseAnnouncement(text)
    expect(result.players.map(p => p.name)).toEqual(['John Doe', 'Jane Smith'])
  })

  it('skips "OPEN" slot entries', () => {
    const text = [
      '*Team*',
      '1. John Doe',
      '12. _OPEN — one slot available_',
      '',
    ].join('\n')

    const result = parseAnnouncement(text)
    expect(result.players.map(p => p.name)).toEqual(['John Doe'])
  })

  it('strips a single role tag and reports it in roles[]', () => {
    const text = [
      '*Team*',
      '1. John Doe (C)',
    ].join('\n')

    const result = parseAnnouncement(text)
    expect(result.players[0].name).toBe('John Doe')
    expect(result.players[0].roles).toEqual(['C'])
  })

  it('strips markdown asterisks from a player name', () => {
    const text = [
      '*Team*',
      '1. *John Doe*',
    ].join('\n')

    const result = parseAnnouncement(text)
    expect(result.players[0].name).toBe('John Doe')
  })

  // Fix 2 — strikethrough substitution: the struck player is dropped
  // entirely, only the replacement name after it survives.
  it('resolves a strikethrough substitution to only the replacement name', () => {
    const text = [
      '*Team*',
      '6. ~Rohit Raj~ DS Sakketha',
    ].join('\n')

    const result = parseAnnouncement(text)
    expect(result.players).toHaveLength(1)
    expect(result.players[0].name).toBe('DS Sakketha')
    expect(result.players[0].name).not.toContain('Rohit Raj')
  })

  // Fix 3 — multiple role tags on one player.
  it('captures multiple role tags on a single player', () => {
    const text = [
      '*Team*',
      '3. Harsha Konka (WK, VC)',
    ].join('\n')

    const result = parseAnnouncement(text)
    expect(result.players[0].name).toBe('Harsha Konka')
    expect(result.players[0].roles).toEqual(expect.arrayContaining(['WK', 'VC']))
    expect(result.players[0].roles).toHaveLength(2)
  })

  it('leaves a non-role parenthetical untouched in the name', () => {
    const text = [
      '*Team*',
      '1. John Doe (Junior)',
    ].join('\n')

    const result = parseAnnouncement(text)
    expect(result.players[0].name).toBe('John Doe (Junior)')
    expect(result.players[0].roles).toEqual([])
  })

  it('deduplicates a repeated role token', () => {
    const text = [
      '*Team*',
      '1. John Doe (C, C)',
    ].join('\n')

    const result = parseAnnouncement(text)
    expect(result.players[0].roles).toEqual(['C'])
  })

  it('returns null booking signals and empty players when nothing matches', () => {
    const result = parseAnnouncement('just some unrelated text')
    expect(result.booking_id_from_link).toBeNull()
    expect(result.match_id).toBeNull()
    expect(result.date_raw).toBeNull()
    expect(result.format_raw).toBeNull()
    expect(result.players).toEqual([])
  })
})
