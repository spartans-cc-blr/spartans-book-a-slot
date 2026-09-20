import Link from 'next/link'

// "Yours Statistically | Team Record" — the two-pill control atop both
// stats pages, the same shape MatchesSegmentedTabs gives Upcoming / Past
// Matches. Two real routes (player stats and team stats carry unrelated
// filter bars and data layers — see features/team-stats.md §1), so this is
// just two <Link>s with `active` passed in by whichever page renders it.
// Reads the shared --stats-* tokens so it follows Light/Dark/System with
// the rest of the stats area; the active pill flips its text colour for
// contrast against the muted dark-theme gold.

export function StatsSegmentedTabs({ active }: { active: 'players' | 'team' }) {
  const base = 'flex-1 text-center font-rajdhani text-sm font-bold py-2 rounded-full transition-colors whitespace-nowrap'
  const on   = 'bg-[var(--stats-accent)] text-white dark:text-ink'
  const off  = 'text-[var(--stats-text-muted)] hover:text-[var(--stats-text)]'
  return (
    // transform-gpu + will-change-transform: promotes this control onto its
    // own GPU compositor layer. Without this, iOS WebKit can leave a stale
    // painted frame of the *previous* page's version of this control
    // (e.g. /leaderboard's "Yours Statistically" pill) visible over the new
    // page after a client-side route change between the two stats pages —
    // a ghost-frame variant of the same rendering-layer bug fixed for
    // SiteNav/MobileTabBar. Safe here specifically because this element is
    // a sibling of SiteNav, not an ancestor — see navigation.md §4.1's note
    // on why the same hint can't be applied to a shared ancestor instead.
    <div className="flex rounded-full p-1 gap-1 max-w-xs mt-4 bg-[var(--stats-row-bg)] border border-[var(--stats-card-border)] transform-gpu will-change-transform">
      <Link href="/leaderboard" className={`${base} ${active === 'players' ? on : off}`}>Yours Statistically</Link>
      <Link href="/team-stats" className={`${base} ${active === 'team' ? on : off}`}>Team Record</Link>
    </div>
  )
}
