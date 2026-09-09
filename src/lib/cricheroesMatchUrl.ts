// The club fields exactly two squads that ever appear as "us" in a
// CricHeroes match slug — the main squad for real tournament fixtures, and
// a second squad used for practice/scrimmage games. Matched against a
// normalised (hyphens stripped) slug segment so minor CricHeroes formatting
// differences ("spartans-cc-bengaluru" vs a hypothetical "spartans-cricket-
// club-bengaluru") don't need a second entry here — only the meaningful
// word sequence has to match.
const KNOWN_SPARTANS_SLUGS = ['spartansccbengaluru', 'spartansunited']

function normaliseSlugSegment(segment: string): string {
  return segment.toLowerCase().replace(/-/g, '')
}

// Whichever side's slug matches a known Spartans squad name is us. Checked
// against the exact roster above first — an opposing club whose own name
// happens to contain "spartan" (a plausible real team name, e.g. "Bangalore
// Spartans CC") must never be misidentified as us just because of that
// substring. Falls back to a loose "spartan" substring check only if
// *neither* side matches the known roster, so a real Spartans slug this
// list hasn't caught up with yet still resolves better than nothing.
function isSpartansSlug(segment: string): boolean {
  const normalised = normaliseSlugSegment(segment)
  return KNOWN_SPARTANS_SLUGS.some(known => normalised.includes(known))
}

// Common cricket-club abbreviation that title-casing alone gets wrong
// ("Cc" instead of "CC") — used both for our own "Spartans CC Bengaluru"
// name and for the many opponent clubs whose own name ends in "CC".
function titleCaseWord(word: string): string {
  return word.toLowerCase() === 'cc' ? 'CC' : word.charAt(0).toUpperCase() + word.slice(1)
}

// Matched case-insensitively — CricHeroes' own slug casing isn't something
// this app controls, and a bare `.includes('-vs-')`/`.split('-vs-')` would
// silently fail to even find the separator on a slug like
// "Spartans-CC-Bengaluru-VS-Whackers-Cricket-Club", leaving the Opponent
// field empty rather than wrong.
const VS_SEPARATOR = /-vs-/i

// Extracts the opposing team's display name from a CricHeroes match URL's
// own "<teamA>-vs-<teamB>" slug (the last path segment) — used by the
// admin booking form to prefill the Opponent field when a CricHeroes match
// URL is pasted in.
//
// Fully case-insensitive, top to bottom: the "-vs-" separator itself
// (`VS_SEPARATOR` above), the known-squad roster match (`isSpartansSlug()`,
// via `normaliseSlugSegment()`'s `.toLowerCase()`), the loose "spartan"
// substring fallback below, and `titleCaseWord()`'s "cc" special-case all
// lowercase before comparing. `/admin/bookings/new` and
// `/admin/bookings/[id]` used to each inline their own copy of the roster
// check, and only the [id] page lowercased teamA first — the new-booking
// page's `teamA.includes('spartans')` was case-sensitive. A CricHeroes
// slug segment isn't guaranteed to be all-lowercase, and when the
// case-sensitive check silently failed (teamA really was Spartans, just
// cased differently), it fell through to `opponent = teamA` — i.e.
// Spartans' own name landed in the Opponent field. That's the exact
// "Spartans as opponent" bug this shared, case-insensitive helper closes.
//
// Matching against the known-squad roster above (rather than a bare
// "spartan" substring) also means a practice match between the club's own
// two squads — "Spartans CC Bengaluru" vs "Spartans United" — still
// resolves cleanly: whichever side is listed first is recognised as us via
// the roster, and the other squad's real name becomes the Opponent field
// (e.g. "Spartans United"), rather than falling through to whatever the
// old loose substring check happened to pick.
export function opponentFromMatchSlug(slug: string): string | null {
  if (!VS_SEPARATOR.test(slug)) return null
  const [teamA, teamB] = slug.split(VS_SEPARATOR)
  if (!teamA || !teamB) return null

  const aIsSpartans = isSpartansSlug(teamA)
  const bIsSpartans = isSpartansSlug(teamB)
  // Both — or neither — side matched the known roster: fall back to the
  // original loose "spartan" substring check rather than guessing blindly.
  const opponent = aIsSpartans !== bIsSpartans
    ? (aIsSpartans ? teamB : teamA)
    : (teamA.toLowerCase().includes('spartan') ? teamB : teamA)

  return opponent
    .split('-')
    .filter(Boolean)
    .map(titleCaseWord)
    .join(' ')
}
