import { describe, it, expect } from 'vitest'
import { isCommentarySide, validateCommentaryPdf, MAX_COMMENTARY_BYTES } from './commentary'

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
