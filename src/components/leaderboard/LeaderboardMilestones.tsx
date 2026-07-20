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

import { PlayerNameLink } from '@/lib/playerLink'
import type { LeaderboardRow } from '@/types'

const MIN_BALLS_FOR_ECONOMY = 30 // 5 overs

// YTD qualification bar: 3 games per completed calendar quarter of the
// selected season. Ratchets up as the season progresses (0 through Mar,
// 3 from Apr, 6 from Jul, 9 from Oct) so early-season small samples don't
// dominate a card, without needing a fixed flat minimum. A past, fully
// completed season (or "All time") qualifies at the full-year bar (12).
function minGamesThreshold(year: number | 'all'): number {
  const now = new Date()
  const currentYear = now.getFullYear()
  if (year === 'all' || year < currentYear) return 12
  if (year > currentYear) return 0
  const quartersCompleted = Math.floor(now.getMonth() / 3)
  return quartersCompleted * 3
}

interface Milestone {
  label: string
  icon: string
  row: LeaderboardRow | null
  valueText: string
}

function bestBy(rows: LeaderboardRow[], value: (r: LeaderboardRow) => number | null, qualifies: (r: LeaderboardRow) => boolean, lowerIsBetter = false): LeaderboardRow | null {
  let best: LeaderboardRow | null = null
  let bestVal: number | null = null
  for (const r of rows) {
    if (!qualifies(r)) continue
    const v = value(r)
    if (v == null) continue
    if (bestVal == null || (lowerIsBetter ? v < bestVal : v > bestVal)) {
      best = r
      bestVal = v
    }
  }
  return best
}

export function LeaderboardMilestones({ rows, year }: { rows: LeaderboardRow[]; year: number | 'all' }) {
  if (rows.length === 0) {
    return (
      <p className="font-rajdhani text-sm text-zinc-500 py-8 text-center">No stats for this filter yet.</p>
    )
  }

  const minGames = minGamesThreshold(year)
  const qualifiesOnGames = (r: LeaderboardRow) => r.stats.matches >= minGames

  const topMVP     = bestBy(rows, r => r.stats.mvpPoints, qualifiesOnGames)
  const topRuns     = bestBy(rows, r => r.stats.runs, qualifiesOnGames)
  const topWickets  = bestBy(rows, r => r.stats.wickets, qualifiesOnGames)
  const mostCenturies     = bestBy(rows, r => r.centuries, r => r.centuries > 0 && qualifiesOnGames(r))
  const mostHalfCenturies = bestBy(rows, r => r.halfCenturies, r => r.halfCenturies > 0 && qualifiesOnGames(r))
  const bestAverage = bestBy(rows, r => r.stats.battingAverage, qualifiesOnGames)
  const bestSR       = bestBy(rows, r => r.stats.strikeRate, qualifiesOnGames)
  const bestEconomy = bestBy(rows, r => r.stats.economy, r => r.stats.ballsBowled >= MIN_BALLS_FOR_ECONOMY && qualifiesOnGames(r), true)

  const milestones: Milestone[] = [
    { label: 'Leading MVP',         icon: '🏆', row: topMVP,     valueText: topMVP ? `${topMVP.stats.mvpPoints.toFixed(1)} pts` : '' },
    { label: 'Leading Run Scorer',  icon: '🏏', row: topRuns,     valueText: topRuns ? `${topRuns.stats.runs} runs` : '' },
    { label: 'Leading Wicket Taker', icon: '🎯', row: topWickets,  valueText: topWickets ? `${topWickets.stats.wickets} wkts` : '' },
    { label: 'Most 100s',      icon: '💯', row: mostCenturies,     valueText: mostCenturies ? `${mostCenturies.centuries} centuries` : '' },
    { label: 'Most 50s',       icon: '5️⃣0️⃣', row: mostHalfCenturies, valueText: mostHalfCenturies ? `${mostHalfCenturies.halfCenturies} fifties` : '' },
    { label: 'Best Average',   icon: '📊', row: bestAverage, valueText: bestAverage ? `Avg ${bestAverage.stats.battingAverage!.toFixed(1)}` : '' },
    { label: 'Highest S/R',    icon: '⚡', row: bestSR,       valueText: bestSR ? `SR ${bestSR.stats.strikeRate!.toFixed(1)}` : '' },
    { label: 'Best Economy',   icon: '🔒', row: bestEconomy, valueText: bestEconomy ? `Econ ${bestEconomy.stats.economy!.toFixed(2)}` : '' },
  ].filter(m => m.row)

  if (milestones.length === 0) {
    return (
      <p className="font-rajdhani text-sm text-zinc-500 py-8 text-center">No stats for this filter yet.</p>
    )
  }

  return (
    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
      {milestones.map(m => (
        <div key={m.label} style={{
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
            <img
              src={m.row!.photoUrl ?? '/default-avatar.png'}
              alt={m.row!.playerName}
              className="w-8 h-8 rounded-full object-cover border border-gold-dim flex-shrink-0"
            />
            <div className="min-w-0">
              <p className="font-rajdhani text-sm font-semibold text-parchment truncate">
                <PlayerNameLink name={m.row!.playerName} playerId={m.row!.playerId} cricHeroesUrl={m.row!.cricheroesUrl} />
              </p>
              <p className="font-cinzel text-xs text-gold mt-0.5">{m.valueText}</p>
            </div>
          </div>
        </div>
      ))}
    </div>
  )
}
