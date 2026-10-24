import { describe, it, expect } from 'vitest'
import { detectRecordBreaks, computeRecordBook, MIN_PRIOR_ENTRIES, type RecordMatch } from './recordBreaks'

function match(over: Partial<RecordMatch> & { bookingId: string }): RecordMatch {
  return {
    gameDate: '2026-10-10', format: 'T20', isPractice: false, opponentName: 'Rival CC',
    result: 'won', battedFirst: true, teamTotal: 150, teamWickets: 6, teamOvers: 20,
    batting: [], bowling: [], fallOfWickets: [],
    ...over,
  }
}

// Six earlier matches so every scope clears MIN_PRIOR_ENTRIES.
const history = (): RecordMatch[] =>
  Array.from({ length: MIN_PRIOR_ENTRIES + 1 }, (_, i) =>
    match({ bookingId: `h${i}`, gameDate: `2026-0${i + 1}-10`, teamTotal: 140 + i, battedFirst: true }))

describe('detectRecordBreaks', () => {
  it('flags a new highest team total at the widest scope only', () => {
    const target = match({ bookingId: 't', teamTotal: 200 })
    const breaks = detectRecordBreaks(target, [...history(), target])
    const total = breaks.filter(b => b.recordKey === 'highest_total')
    expect(total).toHaveLength(1)
    expect(total[0].scopeKey).toBe('alltime|T20')
    expect(total[0].prevValue).toBe(145)
    expect(total[0].message).toContain('New Spartans record')
  })

  it('does not announce a tie', () => {
    const target = match({ bookingId: 't', teamTotal: 145 })
    expect(detectRecordBreaks(target, [...history(), target]).filter(b => b.recordKey === 'highest_total')).toEqual([])
  })

  it('stays silent when the scope has too few earlier entries', () => {
    const few = history().slice(0, MIN_PRIOR_ENTRIES - 1)
    const target = match({ bookingId: 't', teamTotal: 300 })
    expect(detectRecordBreaks(target, [...few, target])).toEqual([])
  })

  it('does not announce a match a later match has already overtaken', () => {
    const target = match({ bookingId: 't', gameDate: '2026-08-01', teamTotal: 200 })
    const later = match({ bookingId: 'later', gameDate: '2026-09-01', teamTotal: 220 })
    expect(detectRecordBreaks(target, [...history(), target, later]).filter(b => b.recordKey === 'highest_total')).toEqual([])
  })

  it('keeps T20 and T30 separate and ignores practice games', () => {
    const t30 = Array.from({ length: 6 }, (_, i) => match({ bookingId: `x${i}`, format: 'T30', teamTotal: 250 }))
    const practice = match({ bookingId: 'p', isPractice: true, teamTotal: 999 })
    const target = match({ bookingId: 't', teamTotal: 200 })
    const breaks = detectRecordBreaks(target, [...history(), ...t30, practice, target])
    expect(breaks.find(b => b.recordKey === 'highest_total')?.prevValue).toBe(145)
  })

  it('treats a lower successful defence as a record', () => {
    const base = Array.from({ length: 6 }, (_, i) => match({ bookingId: `d${i}`, teamTotal: 120 + i, result: 'won', battedFirst: true }))
    const target = match({ bookingId: 't', teamTotal: 90, result: 'won', battedFirst: true })
    const b = detectRecordBreaks(target, [...base, target]).find(r => r.recordKey === 'lowest_defended')
    expect(b?.display).toContain('90')
  })

  it('detects a highest individual score and best bowling', () => {
    const base = Array.from({ length: 6 }, (_, i) => match({
      bookingId: `b${i}`,
      batting: [{ player_name: 'Old', runs: 60 + i, balls: 40, batted: true, not_out: 'N' }],
      bowling: [{ player_name: 'Old B', wickets: 3, runs: 20, did_bowl: true }],
    }))
    const target = match({
      bookingId: 't',
      batting: [{ player_name: 'Kushal V', runs: 101, balls: 60, batted: true, not_out: 'Y' }],
      bowling: [{ player_name: 'Siva', wickets: 4, runs: 15, did_bowl: true }],
    })
    const breaks = detectRecordBreaks(target, [...base, target])
    expect(breaks.find(b => b.recordKey === 'highest_score')?.display).toBe('101* (60)')
    expect(breaks.find(b => b.recordKey === 'best_bowling')?.display).toBe('4/15')
  })

  it('detects a wicket-specific partnership record', () => {
    const batting = (a: string, b: string) => [
      { player_name: a, batting_order: 1, batted: true },
      { player_name: b, batting_order: 2, batted: true },
      { player_name: 'C', batting_order: 3, batted: true },
    ]
    // first wicket falls at `runs`; the opening stand is `runs`
    const stand = (id: string, runs: number, a = 'A', b = 'B') => match({
      bookingId: id, teamTotal: runs + 10, teamWickets: 1, teamOvers: 10,
      batting: batting(a, b),
      fallOfWickets: [{ wicket_number: 1, team_score: runs, over: 8, player_name: a }],
    })
    const base = Array.from({ length: 6 }, (_, i) => stand(`s${i}`, 40 + i))
    const target = stand('t', 90, 'Kushal V', 'Siva')
    const b = detectRecordBreaks(target, [...base, target]).find(r => r.recordKey === 'partnership_w1')
    expect(b?.title).toBe('1st-wicket partnership')
    expect(b?.holder).toBe('Kushal V & Siva')
    expect(b?.prevValue).toBe(45)
  })

  it('record book lists the standing record and agrees with what detection validates against', () => {
    const base = history()
    const book = computeRecordBook(base)
    const top = book.find(b => b.recordKey === 'highest_total' && b.year === null && b.format === 'T20')!
    expect(top.display).toContain('145')
    expect(top.entries).toBe(base.length)
    expect(top.armed).toBe(true)
    // a new match must beat exactly that baseline value
    const target = match({ bookingId: 't', teamTotal: 146 })
    const b = detectRecordBreaks(target, [...base, target]).find(r => r.recordKey === 'highest_total')
    expect(b?.prevDisplay).toBe(top.display)
  })

  it('record book marks thin scopes as not armed and ignores practice games', () => {
    const few = history().slice(0, 2)
    const practice = match({ bookingId: 'p', isPractice: true, teamTotal: 999 })
    const book = computeRecordBook([...few, practice])
    const row = book.find(b => b.recordKey === 'highest_total' && b.year === null)!
    expect(row.armed).toBe(false)
    expect(row.display).not.toContain('999')
  })

  it('record book shows an all-time record set this year and what it beat', () => {
    const old = Array.from({ length: 6 }, (_, i) => match({ bookingId: `o${i}`, gameDate: `2025-0${i + 1}-10`, teamTotal: 140 + i }))
    const fresh = match({ bookingId: 'n', gameDate: '2026-03-10', teamTotal: 190 })
    const row = computeRecordBook([...old, fresh]).find(b => b.recordKey === 'highest_total' && b.year === null)!
    expect(row.setInYear).toBe('2026')
    expect(row.beat?.year).toBe('2025')
    expect(row.beat?.display).toContain('145')
  })
})
