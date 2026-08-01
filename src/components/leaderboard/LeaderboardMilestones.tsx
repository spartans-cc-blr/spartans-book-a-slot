'use client'
// Milestone highlight cards — the "Milestones" tab on /leaderboard (the
// default landing tab, see src/app/leaderboard/page.tsx). Computed entirely
// from the same LeaderboardRow[] the page already fetched (no extra
// queries). Respects whatever year/tournament filter is active.
//
// Styled to match FixturesCard.tsx's match-card treatment (dark gradient,
// gold top accent bar, rounded corners, drop shadow) so the highlight strip
// reads as the same visual language as the rest of the Hub.
//
// Qualification thresholds keep small-sample outliers (a single big innings,
// a two-over spell) off the rate-stat cards — inspired by the equivalent
// cards on the retired spartans-dw-ui leaderboard, sized down for club-level
// match volume rather than copying its "min 20 innings" thresholds.
//
// Centuries and 5-wicket hauls are rare enough club-wide that a single
// "Most 100s" card crowning one player is often just an accident of who's
// tied at 1 with everyone else who's also cleared it once this year (see
// bestByAll() below) — so for a specific year (not "All Time"), those two
// categories drop the single-card treatment in favour of a collapsible,
// click-through-to-the-match list of every individual century/5-for. The
// "Most 100s" card only reappears when someone genuinely has more than one
// this year — a real lead, not a tie-break artifact.

import { useState } from 'react'
import { PlayerNameLink } from '@/lib/playerLink'
import { PlayerAvatar } from './PlayerAvatar'
import { BattingInningsRow, BowlingInningsRow } from './InningsRow'
import { BallIcon } from '@/components/matches/BallIcon'
import type { LeaderboardRow, MonthlyInnings, MonthlyBowlingInnings } from '@/types'

export const MIN_BALLS_FOR_ECONOMY = 30 // 5 overs — also used by LeaderboardMonthly.tsx

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
// tournaments. Exported so src/lib/leaderboardGlossary.ts can quote the
// exact number actually in effect.
export function minGamesThreshold(year: number | 'all', scoped: boolean): number {
  if (scoped) return 1
  const now = new Date()
  const currentYear = now.getFullYear()
  if (year === 'all' || year < currentYear) return 12
  if (year > currentYear) return 0
  const quartersCompleted = Math.floor(now.getMonth() / 3)
  return quartersCompleted * 3
}

interface Milestone {
  key: string
  label: string
  icon: string
  row: LeaderboardRow
  valueText: string
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

// Exported for reuse by LeaderboardMonthly.tsx, which needs the same
// "find the qualifying row with the best value" primitive but with a much
// simpler (single-month) qualification bar than minGamesThreshold() below.
// Kept single-winner (first tied row) for that call site — ties are rarer
// on the monthly view and it wasn't part of this fix.
export function bestBy(rows: LeaderboardRow[], value: (r: LeaderboardRow) => number | null, qualifies: (r: LeaderboardRow) => boolean, lowerIsBetter = false): LeaderboardRow | null {
  return bestByAll(rows, value, qualifies, lowerIsBetter)[0] ?? null
}

// Collapsed by default — these bands are supplementary detail underneath
// the cards, not the primary content, and a whole year's centuries/5-fors
// list is longer than the Monthly view's always-open equivalent
// (InningsPanel in LeaderboardMonthly.tsx) is designed for.
function CollapsibleInningsPanel({ icon, label, count, children }: { icon: React.ReactNode; label: string; count: number; children: React.ReactNode }) {
  const [open, setOpen] = useState(false)
  if (count === 0) return null

  return (
    <div className="bg-ink-3 border border-ink-5 rounded-lg overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        aria-expanded={open}
        className="w-full flex items-center gap-2 px-4 py-2.5 text-left hover:bg-ink-4 transition-colors">
        <span className="inline-flex items-center leading-none">{icon}</span>
        <span className="font-rajdhani text-xs font-bold tracking-wide text-parchment flex-1">{label}</span>
        <span className="font-cinzel text-[10px] text-gold bg-gold/10 border border-gold-dim rounded-full px-2 py-0.5">{count}</span>
        <span className={`text-zinc-500 text-xs transition-transform ${open ? 'rotate-180' : ''}`}>▾</span>
      </button>
      {open && <div className="border-t border-ink-5">{children}</div>}
    </div>
  )
}

export function LeaderboardMilestones({ rows, year, scoped, centuries, fiveWicketHauls }: {
  rows: LeaderboardRow[]
  year: number | 'all'
  scoped: boolean
  // Individual centuries / 5-wicket hauls for the collapsible bands below
  // the cards — only fetched by the page for a specific year (not "All
  // Time"); null means "not applicable", not "none scored".
  centuries?: MonthlyInnings[] | null
  fiveWicketHauls?: MonthlyBowlingInnings[] | null
}) {
  const showInningsBands = year !== 'all' && (centuries != null || fiveWicketHauls != null)

  if (rows.length === 0 && !showInningsBands) {
    return (
      <p className="font-rajdhani text-sm text-zinc-500 py-8 text-center">No stats for this filter yet.</p>
    )
  }

  const minGames = minGamesThreshold(year, scoped)
  const qualifiesOnGames = (r: LeaderboardRow) => r.stats.matches >= minGames

  const topMVP     = bestByAll(rows, r => r.stats.mvpPoints, qualifiesOnGames)
  const topRuns     = bestByAll(rows, r => r.stats.runs, qualifiesOnGames)
  const topWickets  = bestByAll(rows, r => r.stats.wickets, qualifiesOnGames)
  const mostCenturies     = bestByAll(rows, r => r.centuries, r => r.centuries > 0 && qualifiesOnGames(r))
  const mostHalfCenturies = bestByAll(rows, r => r.halfCenturies, r => r.halfCenturies > 0 && qualifiesOnGames(r))
  const bestAverage = bestByAll(rows, r => r.stats.battingAverage, qualifiesOnGames)
  const bestSR       = bestByAll(rows, r => r.stats.strikeRate, qualifiesOnGames)
  const bestEconomy = bestByAll(rows, r => r.stats.economy, r => r.stats.ballsBowled >= MIN_BALLS_FOR_ECONOMY && qualifiesOnGames(r), true)

  // "Most 100s" only earns a card when someone genuinely has more than one
  // this year — otherwise every qualifying centurion is tied at 1 and the
  // card would just be crowning whoever happened to sort first, which is
  // exactly the misleading behaviour this was built to avoid. When a year
  // filter isn't in effect (showInningsBands false — "All Time"), there's
  // no collapsible list as a fallback, so the tied-cards treatment stays.
  const centuryCardRows = !showInningsBands || (mostCenturies[0]?.centuries ?? 0) > 1 ? mostCenturies : []

  // One card per tied player, not one card per category — a genuine tie on
  // centuries (both players with 2+) still renders as multiple "Most 100s"
  // cards instead of silently picking a single "winner".
  function toMilestones(label: string, icon: string, tied: LeaderboardRow[], valueText: (r: LeaderboardRow) => string): Milestone[] {
    return tied.map(row => ({ key: `${label}-${row.playerId}`, label, icon, row, valueText: valueText(row) }))
  }

  const milestones: Milestone[] = [
    ...toMilestones('Leading MVP',          '🏆', topMVP,     r => `${r.stats.mvpPoints.toFixed(2)} pts`),
    ...toMilestones('Leading Run Scorer',   '🏏', topRuns,     r => `${r.stats.runs} runs`),
    ...toMilestones('Leading Wicket Taker', '🎯', topWickets,  r => `${r.stats.wickets} wkts`),
    ...toMilestones('Most 100s',            '💯', centuryCardRows,   r => `${r.centuries} centuries`),
    ...toMilestones('Most 50s',             '5️⃣0️⃣', mostHalfCenturies, r => `${r.halfCenturies} fifties`),
    ...toMilestones('Best Average',         '📊', bestAverage, r => `Avg ${r.stats.battingAverage!.toFixed(2)}`),
    ...toMilestones('Highest S/R',          '⚡', bestSR,       r => `SR ${r.stats.strikeRate!.toFixed(2)}`),
    ...toMilestones('Best Economy',         '🛡️', bestEconomy, r => `Econ ${r.stats.economy!.toFixed(2)}`),
  ]

  if (milestones.length === 0 && !showInningsBands) {
    return (
      <p className="font-rajdhani text-sm text-zinc-500 py-8 text-center">No stats for this filter yet.</p>
    )
  }

  return (
    <div className="space-y-4">
      {milestones.length > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {milestones.map(m => (
            <div key={m.key} style={{
              background: 'linear-gradient(135deg, #1C2333 0%, #111827 100%)',
              border: '1px solid #2D3748',
              borderRadius: '12px',
              padding: '12px',
              boxShadow: '0 4px 20px rgba(0,0,0,0.4)',
              position: 'relative',
              overflow: 'hidden',
            }}>
              {/* Gold top accent bar — matches FixturesCard.tsx */}
              <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: '3px', background: 'linear-gradient(90deg, #C9A84C, #F5D78E, #C9A84C)' }} />

              <div className="flex items-center justify-between mb-2">
                <p className="font-rajdhani text-[10px] font-bold tracking-widest uppercase text-zinc-500">{m.label}</p>
                <span className="text-sm leading-none">{m.icon}</span>
              </div>

              <div className="flex items-center gap-2">
                <PlayerAvatar photoUrl={m.row.photoUrl} name={m.row.playerName} />
                <div className="min-w-0">
                  <p className="font-rajdhani text-sm font-semibold text-parchment truncate">
                    <PlayerNameLink name={m.row.playerName} playerId={m.row.playerId} cricHeroesUrl={m.row.cricheroesUrl} />
                  </p>
                  <p className="font-cinzel text-xs text-gold mt-0.5">{m.valueText}</p>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {showInningsBands && (
        <div className="space-y-3">
          <CollapsibleInningsPanel icon="💯" label="Centuries" count={centuries?.length ?? 0}>
            {(centuries ?? []).map(i => <BattingInningsRow key={i.playerId + i.gameDate} innings={i} />)}
          </CollapsibleInningsPanel>

          <CollapsibleInningsPanel icon={<BallIcon type="gold" size={16} />} label="5-Wicket Hauls" count={fiveWicketHauls?.length ?? 0}>
            {(fiveWicketHauls ?? []).map(i => <BowlingInningsRow key={i.playerId + i.gameDate} innings={i} />)}
          </CollapsibleInningsPanel>
        </div>
      )}
    </div>
  )
}
