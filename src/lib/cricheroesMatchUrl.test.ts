import { describe, it, expect } from 'vitest'
import { opponentFromMatchSlug, extractMatchIdFromUrl } from './cricheroesMatchUrl'

describe('opponentFromMatchSlug', () => {
  it('returns the opponent when Spartans CC Bengaluru is listed first', () => {
    expect(opponentFromMatchSlug('spartans-cc-bengaluru-vs-whackers-cricket-club'))
      .toBe('Whackers Cricket Club')
  })

  it('returns the opponent when Spartans CC Bengaluru is listed second', () => {
    expect(opponentFromMatchSlug('whackers-cricket-club-vs-spartans-cc-bengaluru'))
      .toBe('Whackers Cricket Club')
  })

  it('is case-insensitive, unlike the old new-booking-page check', () => {
    expect(opponentFromMatchSlug('Spartans-CC-Bengaluru-vs-Whackers-Cricket-Club'))
      .toBe('Whackers Cricket Club')
  })

  it('capitalises "CC" correctly instead of "Cc"', () => {
    expect(opponentFromMatchSlug('spartans-cc-bengaluru-vs-royal-challengers-cc'))
      .toBe('Royal Challengers CC')
  })

  it('does not misidentify a real opponent whose own name contains "spartan"', () => {
    // A hypothetical rival club literally named "Bangalore Spartans CC" —
    // the old loose `includes('spartan')` check would have wrongly treated
    // this as us and returned our own name as the opponent.
    expect(opponentFromMatchSlug('bangalore-spartans-cc-vs-spartans-cc-bengaluru'))
      .toBe('Bangalore Spartans CC')
  })

  it('resolves the other squad name for an intra-club practice match', () => {
    expect(opponentFromMatchSlug('spartans-cc-bengaluru-vs-spartans-united'))
      .toBe('Spartans United')
    expect(opponentFromMatchSlug('spartans-united-vs-spartans-cc-bengaluru'))
      .toBe('Spartans CC Bengaluru')
  })

  it('returns null when the slug has no "-vs-" separator', () => {
    expect(opponentFromMatchSlug('not-a-match-slug')).toBeNull()
  })
})

describe('extractMatchIdFromUrl', () => {
  it('extracts the match_id from a cricheroes.in scorecard URL', () => {
    expect(extractMatchIdFromUrl('https://cricheroes.in/scorecard/22422538/some-tournament/spartans-cc-bengaluru-vs-whackers-cricket-club'))
      .toBe('22422538')
  })

  it('extracts the match_id from a cricheroes.com scorecard URL', () => {
    expect(extractMatchIdFromUrl('https://cricheroes.com/scorecard/26452955/championship-league/a-vs-b'))
      .toBe('26452955')
  })

  it('returns null for a URL with no "scorecard" path segment', () => {
    expect(extractMatchIdFromUrl('https://cricheroes.in/player-profile/12345/some-name')).toBeNull()
  })

  it('returns null for a "scorecard" segment with nothing after it', () => {
    expect(extractMatchIdFromUrl('https://cricheroes.in/scorecard/')).toBeNull()
  })

  it('returns null for an invalid URL', () => {
    expect(extractMatchIdFromUrl('not a url')).toBeNull()
    expect(extractMatchIdFromUrl('22422538')).toBeNull()
  })
})
