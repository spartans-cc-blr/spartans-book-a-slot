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
//
// A Tournament/Ground filter (scoped=true) takes this further: the sample
// is small enough — a single tournament might only run a handful of games
// all season — that even the year's ">1" gate doesn't rescue a "most"
// card from being a tie-break artifact most of the time. So when scoped,
// all four rare-performance categories (Centuries, Half-Centuries,
// 5-Wicket Hauls, 3-Wicket Hauls) drop the card/band treatment entirely in
// favour of the Monthly tab's always-open individual-list treatment —
// every qualifying performance listed, no "most" card, no collapsing.

import { useState } from 'react'
import { PlayerNameLink } from '@/lib/playerLink'
import { PlayerAvatar } from './PlayerAvatar'
import { BattingInningsRow, BowlingInningsRow } from './InningsRow'
import { BallIcon } from '@/components/matches/BallIcon'
import { WicketIcon } from './WicketIcon'
import { MIN_BALLS_FOR_ECONOMY, MIN_BALLS_FOR_STRIKE_RATE_OVERALL, minGamesThreshold, minDismissalsThreshold, bestByAll, totalDismissals } from '@/lib/leaderboardMilestones'
import type { LeaderboardRow, MonthlyInnings, MonthlyBowlingInnings } from '@/types'

interface Milestone {
  key: string
  label: string
  icon: string
  row: LeaderboardRow
  valueText: string
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

// Always-open counterpart to CollapsibleInningsPanel above — same visual
// shell, no toggle, matches LeaderboardMonthly.tsx's InningsPanel (a
// tournament/ground-scoped sample is small enough that hiding the list
// behind a tap isn't warranted, same reasoning as the Monthly tab).
function ScopedInningsPanel({ icon, label, count, children }: { icon: React.ReactNode; label: string; count: number; children: React.ReactNode }) {
  return (
    <div className="bg-ink-3 border border-ink-5 rounded-lg overflow-hidden">
      <div className="flex items-center gap-2 px-4 py-2.5 border-b border-ink-5">
        <span className="inline-flex items-center leading-none">{icon}</span>
        <span className="font-rajdhani text-xs font-bold tracking-wide text-parchment flex-1">{label}</span>
        <span className="font-cinzel text-[10px] text-gold bg-gold/10 border border-gold-dim rounded-full px-2 py-0.5">{count}</span>
      </div>
      {count === 0
        ? <p className="font-rajdhani text-sm text-zinc-600 text-center py-6">No {label.toLowerCase()} for this filter yet.</p>
        : children}
    </div>
  )
}

export function LeaderboardMilestones({ rows, year, scoped, centuries, halfCenturies, fiveWicketHauls, threeWicketHauls }: {
  rows: LeaderboardRow[]
  year: number | 'all'
  scoped: boolean
  // Individual performances for the bands/lists below the cards — only
  // fetched by the page for a specific year or a scoped (tournament/ground)
  // filter; null means "not applicable", not "none scored".
  centuries?: MonthlyInnings[] | null
  halfCenturies?: MonthlyInnings[] | null
  fiveWicketHauls?: MonthlyBowlingInnings[] | null
  threeWicketHauls?: MonthlyBowlingInnings[] | null
}) {
  // Scoped (Tournament/Ground filter) always wins over the year-band
  // treatment — see the header comment. Monthly-style always-open lists
  // for all four categories, no "most" card for any of them.
  const showScopedLists = scoped && centuries != null
  const showYearBands = !scoped && year !== 'all' && (centuries != null || fiveWicketHauls != null)
  const showInningsBands = showScopedLists || showYearBands

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
  const mostDismissals    = bestByAll(rows, totalDismissals, r => totalDismissals(r) > 0 && qualifiesOnGames(r))
  const mostCenturies     = bestByAll(rows, r => r.centuries, r => r.centuries > 0 && qualifiesOnGames(r))
  const mostHalfCenturies = bestByAll(rows, r => r.halfCenturies, r => r.halfCenturies > 0 && qualifiesOnGames(r))
  // Batting average is an innings-level stat — gating it on games played
  // (qualifiesOnGames) lets a player who only batted a handful of times
  // (e.g. 6 games played, 4 innings batted) qualify off a small, possibly
  // lucky sample just because their games-played count cleared the bar.
  // Reusing the same minGames number against battingInnings instead keeps
  // the qualification bar's size logic (the quarterly ratchet, the scoped
  // floor) but applies it to the stat the card is actually about.
  const bestAverage = bestByAll(rows, r => r.stats.battingAverage, r => r.stats.battingInnings >= minGames)
  const bestSR       = bestByAll(rows, r => r.stats.strikeRate, r => r.stats.balls >= MIN_BALLS_FOR_STRIKE_RATE_OVERALL && qualifiesOnGames(r))
  const bestEconomy = bestByAll(rows, r => r.stats.economy, r => r.stats.ballsBowled >= MIN_BALLS_FOR_ECONOMY && qualifiesOnGames(r), true)

  // "Most 100s" only earns a card when someone genuinely has more than one
  // this year — otherwise every qualifying centurion is tied at 1 and the
  // card would just be crowning whoever happened to sort first, which is
  // exactly the misleading behaviour this was built to avoid. When a year
  // filter isn't in effect (showYearBands false — "All Time"), there's
  // no collapsible list as a fallback, so the tied-cards treatment stays.
  // Scoped always drops the card outright — see showScopedLists above.
  const centuryCardRows = scoped ? [] : (!showYearBands || (mostCenturies[0]?.centuries ?? 0) > 1 ? mostCenturies : [])

  // "Most 50s" keeps the tied-cards treatment unless scoped — half-centuries
  // are common enough club-wide/year-wide that a tie-break card is still
  // meaningful there, but a single tournament/ground's sample is small
  // enough that the Half-Centuries list is the more honest presentation.
  const halfCenturyCardRows = scoped ? [] : mostHalfCenturies

  // "Most Dismissals" only earns a card once the leader clears
  // minDismissalsThreshold() — same idea as the century gate above, applied
  // unconditionally (not just for a specific year) since there's no
  // collapsible list fallback for fielding dismissals to defer to.
  const dismissalsThreshold = minDismissalsThreshold(year, scoped)
  const topDismissalsValue = mostDismissals[0] ? totalDismissals(mostDismissals[0]) : 0
  const dismissalsCardRows = topDismissalsValue >= dismissalsThreshold ? mostDismissals : []

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
    ...toMilestones('Most Dismissals',      '🧤', dismissalsCardRows, r => `${totalDismissals(r)} dismissals`),
    ...toMilestones('Most 100s',            '💯', centuryCardRows,   r => `${r.centuries} centuries`),
    ...toMilestones('Most 50s',             '5️⃣0️⃣', halfCenturyCardRows, r => `${r.halfCenturies} fifties`),
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

      {showScopedLists && (
        <div className="space-y-3">
          <ScopedInningsPanel icon="💯" label="Centuries" count={centuries?.length ?? 0}>
            {(centuries ?? []).map(i => <BattingInningsRow key={i.playerId + i.gameDate} innings={i} />)}
          </ScopedInningsPanel>

          <ScopedInningsPanel icon="5️⃣0️⃣" label="Half-Centuries" count={halfCenturies?.length ?? 0}>
            {(halfCenturies ?? []).map(i => <BattingInningsRow key={i.playerId + i.gameDate} innings={i} />)}
          </ScopedInningsPanel>

          <ScopedInningsPanel icon={<BallIcon type="gold" size={16} />} label="5-Wicket Hauls" count={fiveWicketHauls?.length ?? 0}>
            {(fiveWicketHauls ?? []).map(i => <BowlingInningsRow key={i.playerId + i.gameDate} innings={i} />)}
          </ScopedInningsPanel>

          <ScopedInningsPanel icon={<WicketIcon size={16} />} label="3-Wicket Hauls" count={threeWicketHauls?.length ?? 0}>
            {(threeWicketHauls ?? []).map(i => <BowlingInningsRow key={i.playerId + i.gameDate} innings={i} />)}
          </ScopedInningsPanel>
        </div>
      )}

      {showYearBands && (
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
