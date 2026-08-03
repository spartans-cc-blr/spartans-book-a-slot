// Pure, framework-agnostic helpers shared by the /leaderboard Milestones
// card logic. Deliberately NOT in LeaderboardMilestones.tsx (a 'use client'
// component, needed for the collapsible innings panels' useState) — this
// file is imported by src/lib/leaderboardGlossary.ts, which runs
// server-side inside src/app/leaderboard/page.tsx (a Server Component).
// Importing plain utility functions out of a 'use client' module into
// server-only code crosses the RSC client boundary and can throw at
// runtime — real incident: exactly this shape of import, once
// LeaderboardMilestones.tsx gained 'use client', broke /leaderboard in
// production with a server-side exception. Keep this file free of 'use
// client' and free of any JSX/React import.

import type { LeaderboardRow } from '@/types'

export const MIN_BALLS_FOR_ECONOMY = 30 // 5 overs

// Same spirit as MIN_BALLS_FOR_ECONOMY, for the Monthly "Highest S/R" card
// — a couple of balls faced shouldn't be able to win "highest strike rate"
// off an unrepresentative sample.
export const MIN_BALLS_FOR_STRIKE_RATE = 10

// YTD qualification bar: 3 games per completed calendar quarter of the
// selected season. Ratchets up as the season progresses (0 through Mar,
// 3 from Apr, 6 from Jul, 9 from Oct) so early-season small samples don't
// dominate a card, without needing a fixed flat minimum. A past, fully
// completed season (or "All time") qualifies at the full-year bar (12).
//
// That ratchet assumes club-wide pace (every game the club plays, not one
// tournament's worth) — scoped to a single tournament or ground, most
// players would never clear it, since a tournament might only run 6-10
// games all season. `scoped` (true once a Tournament/Ground filter is
// applied) drops the bar to the same "played at least once" floor the
// Monthly view already uses, rather than showing empty cards for most
// tournaments.
export function minGamesThreshold(year: number | 'all', scoped: boolean): number {
  if (scoped) return 1
  const now = new Date()
  const currentYear = now.getFullYear()
  if (year === 'all' || year < currentYear) return 12
  if (year > currentYear) return 0
  const quartersCompleted = Math.floor(now.getMonth() / 3)
  return quartersCompleted * 3
}

// Same shape as minGamesThreshold() above, but for "Most Dismissals"
// (catches + run outs + stumpings): 50 fielding dismissals across a full
// season is a genuinely good year behind the stumps/in the field, prorated
// to 12 per completed calendar quarter for a season still in progress
// (50 / 4 = 12.5, rounded down so the bar stays honest rather than
// generous). Without this, "Most Dismissals" would crown whoever has the
// most catches in the first few weeks of a new year off a trivially small
// sample — the same problem the century-card gating exists to avoid.
// `scoped` drops to a token floor of 1 — a single tournament/ground is too
// short a sample for a 50-dismissal target to ever realistically clear.
export function minDismissalsThreshold(year: number | 'all', scoped: boolean): number {
  if (scoped) return 1
  const now = new Date()
  const currentYear = now.getFullYear()
  if (year === 'all' || year < currentYear) return 50
  if (year > currentYear) return 0
  const quartersCompleted = Math.floor(now.getMonth() / 3)
  return quartersCompleted * 12
}

// Returns every row tied for the best value, not just the first one
// encountered — a plain single-winner reduce silently picks whichever tied
// player happens to come first in `rows`' iteration order (an accident of
// the analytics DB query, not a real ranking), which is exactly what
// produced a misleading "Most 100s" card when three players were tied on
// centuries. Ties on the same value are collected together and reset on
// any strictly better value.
export function bestByAll(rows: LeaderboardRow[], value: (r: LeaderboardRow) => number | null, qualifies: (r: LeaderboardRow) => boolean, lowerIsBetter = false): LeaderboardRow[] {
  let best: LeaderboardRow[] = []
  let bestVal: number | null = null
  for (const r of rows) {
    if (!qualifies(r)) continue
    const v = value(r)
    if (v == null) continue
    if (bestVal == null || (lowerIsBetter ? v < bestVal : v > bestVal)) {
      best = [r]
      bestVal = v
    } else if (v === bestVal) {
      best.push(r)
    }
  }
  return best
}

// Kept single-winner (first tied row) — used by LeaderboardMonthly.tsx,
// where ties are rarer and weren't part of the tie-handling fix.
export function bestBy(rows: LeaderboardRow[], value: (r: LeaderboardRow) => number | null, qualifies: (r: LeaderboardRow) => boolean, lowerIsBetter = false): LeaderboardRow | null {
  return bestByAll(rows, value, qualifies, lowerIsBetter)[0] ?? null
}

export function totalDismissals(r: LeaderboardRow): number {
  return r.stats.catches + r.stats.runOuts + r.stats.stumpings
}
