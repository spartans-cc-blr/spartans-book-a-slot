// Milestone highlight cards for /leaderboard — a quick "who's on top" strip
// above the sortable table, computed entirely from the same LeaderboardRow[]
// the page already fetched (no extra queries). Respects whatever
// year/tournament filter is active, same as the table below it.
//
// Qualification thresholds keep small-sample outliers (a single big innings,
// a two-over spell) off the rate-stat cards — inspired by the equivalent
// cards on the retired spartans-dw-ui leaderboard, sized down for club-level
// match volume rather than copying its "min 20 innings" thresholds.

import { PlayerNameLink } from '@/lib/playerLink'
import type { LeaderboardRow } from '@/types'

const MIN_MATCHES_FOR_RATE = 5
const MIN_BALLS_FOR_ECONOMY = 30 // 5 overs

interface Milestone {
  label: string
  icon: string
  row: LeaderboardRow | null
  valueText: string
}

function bestBy<T>(rows: LeaderboardRow[], value: (r: LeaderboardRow) => number | null, qualifies: (r: LeaderboardRow) => boolean, lowerIsBetter = false): LeaderboardRow | null {
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

export function LeaderboardMilestones({ rows }: { rows: LeaderboardRow[] }) {
  if (rows.length === 0) return null

  const topMVP     = bestBy(rows, r => r.stats.mvpPoints, () => true)
  const topRuns     = bestBy(rows, r => r.stats.runs, () => true)
  const topWickets  = bestBy(rows, r => r.stats.wickets, () => true)
  const mostCenturies     = bestBy(rows, r => r.centuries, r => r.centuries > 0)
  const mostHalfCenturies = bestBy(rows, r => r.halfCenturies, r => r.halfCenturies > 0)
  const bestAverage = bestBy(rows, r => r.stats.battingAverage, r => r.stats.matches >= MIN_MATCHES_FOR_RATE)
  const bestSR       = bestBy(rows, r => r.stats.strikeRate, r => r.stats.matches >= MIN_MATCHES_FOR_RATE)
  const bestEconomy = bestBy(rows, r => r.stats.economy, r => r.stats.ballsBowled >= MIN_BALLS_FOR_ECONOMY, true)

  const milestones: Milestone[] = [
    { label: 'Top MVP',        icon: '🏆', row: topMVP,     valueText: topMVP ? `${topMVP.stats.mvpPoints.toFixed(1)} pts` : '' },
    { label: 'Top Scorer',     icon: '🏏', row: topRuns,     valueText: topRuns ? `${topRuns.stats.runs} runs` : '' },
    { label: 'Top Wickets',    icon: '🎯', row: topWickets,  valueText: topWickets ? `${topWickets.stats.wickets} wkts` : '' },
    { label: 'Most 100s',      icon: '💯', row: mostCenturies,     valueText: mostCenturies ? `${mostCenturies.centuries} centuries` : '' },
    { label: 'Most 50s',       icon: '5️⃣0️⃣', row: mostHalfCenturies, valueText: mostHalfCenturies ? `${mostHalfCenturies.halfCenturies} fifties` : '' },
    { label: 'Best Average',   icon: '📊', row: bestAverage, valueText: bestAverage ? `Avg ${bestAverage.stats.battingAverage!.toFixed(1)}` : '' },
    { label: 'Highest S/R',    icon: '⚡', row: bestSR,       valueText: bestSR ? `SR ${bestSR.stats.strikeRate!.toFixed(1)}` : '' },
    { label: 'Best Economy',   icon: '🔒', row: bestEconomy, valueText: bestEconomy ? `Econ ${bestEconomy.stats.economy!.toFixed(2)}` : '' },
  ].filter(m => m.row)

  if (milestones.length === 0) return null

  return (
    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-5">
      {milestones.map(m => (
        <div key={m.label} className="bg-ink-3 border border-ink-5 rounded p-3">
          <div className="flex items-center justify-between mb-1.5">
            <p className="font-rajdhani text-[10px] font-bold tracking-widest uppercase text-zinc-500">{m.label}</p>
            <span className="text-sm leading-none">{m.icon}</span>
          </div>
          <p className="font-rajdhani text-sm font-semibold text-parchment truncate">
            <PlayerNameLink name={m.row!.playerName} playerId={m.row!.playerId} cricHeroesUrl={m.row!.cricheroesUrl} />
          </p>
          <p className="font-cinzel text-xs text-gold mt-0.5">{m.valueText}</p>
        </div>
      ))}
    </div>
  )
}
