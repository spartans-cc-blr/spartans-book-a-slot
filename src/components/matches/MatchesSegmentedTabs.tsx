import Link from 'next/link'

// Shared "Upcoming / Past Matches" segmented control sitting atop both
// /fixtures and /matches/history — the two pages are now one "Matches"
// destination in the bottom tab bar (see navigation.md §4.1), and this is
// what lets a viewer flip between them. Deliberately two real routes, not
// one merged page: each side already carries its own substantial live
// architecture (Fixtures' shared weekend availability state; Matches
// History's client-paginated filter/list) that would be riskier to merge
// than to link between. A plain server component — no client state, just
// two <Link>s with an `active` prop passed in from whichever page renders
// it, styled to match the DateChipSlider/filter-bar segmented look.
export function MatchesSegmentedTabs({ active }: { active: 'upcoming' | 'past' }) {
  return (
    <div className="flex rounded-full p-1 gap-1 max-w-xs" style={{ background: '#F8F4EE', border: '1px solid #D4C9B0' }}>
      <Link
        href="/fixtures"
        className="flex-1 text-center font-rajdhani text-sm font-bold py-2 rounded-full transition-colors"
        style={active === 'upcoming'
          ? { background: '#D97706', color: '#fff' }
          : { color: '#78716C' }}
      >
        Upcoming
      </Link>
      <Link
        href="/matches/history"
        className="flex-1 text-center font-rajdhani text-sm font-bold py-2 rounded-full transition-colors"
        style={active === 'past'
          ? { background: '#D97706', color: '#fff' }
          : { color: '#78716C' }}
      >
        Past Matches
      </Link>
    </div>
  )
}
