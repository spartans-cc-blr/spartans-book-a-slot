// Extracts the opposing team's display name from a CricHeroes match URL's
// own "<teamA>-vs-<teamB>" slug (the last path segment) — used by the
// admin booking form to prefill the Opponent field when a CricHeroes match
// URL is pasted in. Whichever side's slug contains "spartan" is assumed to
// be us; the other side is the opponent.
//
// Always case-insensitive. `/admin/bookings/new` and `/admin/bookings/[id]`
// used to each inline their own copy of this check, and only the [id] page
// lowercased teamA first — the new-booking page's `teamA.includes('spartans')`
// was case-sensitive. A CricHeroes slug segment isn't guaranteed to be
// all-lowercase, and when the case-sensitive check silently failed (teamA
// really was Spartans, just cased differently), it fell through to
// `opponent = teamA` — i.e. Spartans' own name landed in the Opponent
// field. That's the exact "Spartans as opponent" bug this shared,
// case-insensitive helper closes.
//
// Known remaining limitation: an intra-club practice/scrimmage match (e.g.
// "Spartans A" vs "Spartans B") has both sides containing "spartan", so
// this always resolves to teamB as "the opponent" even though it's still a
// Spartans squad — there is no way to tell that apart from the slug text
// alone, so a practice-game booking's opponent field may still need a
// manual correction.
export function opponentFromMatchSlug(slug: string): string | null {
  if (!slug.includes('-vs-')) return null
  const [teamA, teamB] = slug.split('-vs-')
  if (!teamA || !teamB) return null
  const opponent = teamA.toLowerCase().includes('spartan') ? teamB : teamA
  return opponent
    .split('-')
    .filter(Boolean)
    .map(w => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ')
}
