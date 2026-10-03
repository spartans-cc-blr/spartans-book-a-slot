import { describe, it, expect } from 'vitest'
import { isCommentarySide, validateCommentaryPdf, matchesNeedingCommentary, MAX_COMMENTARY_BYTES } from './commentary'

const PDF = Buffer.from('%PDF-1.4 rest')

describe('isCommentarySide', () => {
  it('accepts only the two innings sides', () => {
    expect(isCommentarySide('spartans')).toBe(true)
    expect(isCommentarySide('opponent')).toBe(true)
    expect(isCommentarySide('both')).toBe(false)
    expect(isCommentarySide(undefined)).toBe(false)
    expect(isCommentarySide(null)).toBe(false)
  })
})

describe('validateCommentaryPdf', () => {
  it('accepts a small PDF', () => {
    expect(validateCommentaryPdf(700_000, PDF)).toBeNull()
  })

  it('rejects an empty file', () => {
    expect(validateCommentaryPdf(0, PDF)).toMatch(/empty/i)
  })

  it('rejects anything over the Vercel-safe limit and says how to shrink it', () => {
    const msg = validateCommentaryPdf(7.2 * 1024 * 1024, PDF)
    expect(msg).toMatch(/7\.2MB/)
    expect(msg).toMatch(/phone|Background graphics/)
    expect(validateCommentaryPdf(MAX_COMMENTARY_BYTES, PDF)).toBeNull()
    expect(validateCommentaryPdf(MAX_COMMENTARY_BYTES + 1, PDF)).not.toBeNull()
  })

  it('checks magic bytes, not the file name or content type', () => {
    expect(validateCommentaryPdf(1000, Buffer.from('<html>'))).toMatch(/valid PDF/)
  })
})

describe('matchesNeedingCommentary', () => {
  const base = { booking_id: 'b', match_id: 'm', game_date: '2026-09-01', format: 'T20', opponent_name: 'X' }
  it('keeps none/partial/mismatch, drops complete and unknown status', () => {
    const list = [
      { ...base, booking_id: '1', bbb_status: 'none' as const },
      { ...base, booking_id: '2', bbb_status: 'partial' as const },
      { ...base, booking_id: '3', bbb_status: 'mismatch' as const },
      { ...base, booking_id: '4', bbb_status: 'complete' as const },
      { ...base, booking_id: '5' },
    ]
    expect(matchesNeedingCommentary(list).map(m => m.booking_id)).toEqual(['1', '2', '3'])
  })
})
