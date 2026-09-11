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
//
// `theme` (default `'auto'`) follows the same convention `DateChipSlider`
// added for Light/Dark/System — 'auto' reads the `--fx-*` CSS variables so
// it matches the visitor's own theme choice on /fixtures; `/matches/history`
// passes `theme="light"` to pin the original Warm Light look, since that
// page's own body content hasn't been made theme-aware yet (see ui-theme.md).
const LIGHT = { trackBg: '#F8F4EE', trackBorder: '#D4C9B0', accent: '#D97706', accentText: '#fff', inactiveText: '#78716C' }
const AUTO  = { trackBg: 'var(--fx-card-header-bg)', trackBorder: 'var(--fx-border)', accent: 'var(--fx-accent)', accentText: '#fff', inactiveText: 'var(--fx-card-text-muted)' }

export function MatchesSegmentedTabs({ active, theme = 'auto' }: { active: 'upcoming' | 'past'; theme?: 'auto' | 'light' }) {
  const t = theme === 'light' ? LIGHT : AUTO
  return (
    <div className="flex rounded-full p-1 gap-1 max-w-xs" style={{ background: t.trackBg, border: `1px solid ${t.trackBorder}` }}>
      <Link
        href="/fixtures"
        className="flex-1 text-center font-rajdhani text-sm font-bold py-2 rounded-full transition-colors"
        style={active === 'upcoming'
          ? { background: t.accent, color: t.accentText }
          : { color: t.inactiveText }}
      >
        Upcoming
      </Link>
      <Link
        href="/matches/history"
        className="flex-1 text-center font-rajdhani text-sm font-bold py-2 rounded-full transition-colors"
        style={active === 'past'
          ? { background: t.accent, color: t.accentText }
          : { color: t.inactiveText }}
      >
        Past Matches
      </Link>
    </div>
  )
}
