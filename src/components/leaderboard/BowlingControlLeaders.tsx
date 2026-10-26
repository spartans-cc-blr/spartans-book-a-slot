// Detailed → Bowl only — two top-10 bar charts above the table:
//   1. Dot ball % (dot balls ÷ balls bowled), highest first.
//   2. Boundary % conceded ((fours + sixes) ÷ balls bowled), lowest first.
// Derived from the same pitch/filter-scoped LeaderboardRow[] as the table
// below, so it follows Year/Tournament/Ground/Format and the Pitch Type tabs.
// Bowlers need MIN_BALLS_FOR_ECONOMY balls bowled to qualify. Plain server
// component (no hooks); see features/leaderboard.md §6.5.

import { PlayerNameLink } from '@/lib/playerLink'
import { MIN_BALLS_FOR_ECONOMY } from '@/lib/leaderboardMilestones'
import type { LeaderboardRow } from '@/types'

interface Entry { row: LeaderboardRow; pct: number; count: number; balls: number }

function build(rows: LeaderboardRow[], count: (r: LeaderboardRow) => number, asc: boolean): Entry[] {
  return rows
    .filter(r => r.stats.ballsBowled >= MIN_BALLS_FOR_ECONOMY && r.stats.bowlDots != null)
    .map(r => ({ row: r, count: count(r), balls: r.stats.ballsBowled, pct: (count(r) / r.stats.ballsBowled) * 100 }))
    .sort((a, b) => (asc ? a.pct - b.pct : b.pct - a.pct) || b.balls - a.balls || a.row.playerName.localeCompare(b.row.playerName))
    .slice(0, 10)
}

function Chart({ title, subtitle, entries, unit }: { title: string; subtitle: string; entries: Entry[]; unit: string }) {
  const max = Math.max(...entries.map(e => e.pct), 1)
  return (
    <div className="bg-[var(--stats-card-bg)] dark:bg-ink-3 border border-[var(--stats-card-border)] dark:border-ink-5 rounded p-4 mb-4">
      <h3 className="font-cinzel text-sm text-[var(--stats-accent)] dark:text-gold font-semibold mb-1">{title}</h3>
      <p className="font-rajdhani text-xs text-[var(--stats-text-muted)] dark:text-zinc-500 mb-4">{subtitle}</p>
      <div className="space-y-2">
        {entries.map((e, i) => (
          <div key={e.row.playerId} className="flex items-center gap-2">
            <span className="font-cinzel text-xs text-[var(--stats-text-muted)] dark:text-zinc-500 w-7 flex-shrink-0 text-right">{i + 1}</span>
            <div className="flex-1 relative h-7 bg-[var(--stats-row-bg)] dark:bg-ink-4 rounded overflow-hidden">
              <div className="absolute inset-y-0 left-0 bg-gold/40 rounded" style={{ width: `${Math.max((e.pct / max) * 100, 6)}%` }} />
              <div className="absolute inset-0 flex items-center gap-2 px-2.5">
                <span className="font-rajdhani text-xs font-semibold text-[var(--stats-text)] dark:text-parchment truncate flex-1 min-w-0">
                  <PlayerNameLink name={e.row.playerName} playerId={e.row.playerId} cricHeroesUrl={e.row.cricheroesUrl} />
                </span>
                <span
                  className="font-rajdhani text-[10px] leading-none font-semibold text-[var(--stats-text-muted)] dark:text-zinc-400 flex-shrink-0 whitespace-nowrap w-24 text-right"
                  title={`${e.count} ${unit} in ${e.balls} balls bowled`}
                >
                  {e.count} / {e.balls} balls
                </span>
                <span className="font-rajdhani text-xs font-bold text-[var(--stats-accent)] dark:text-gold flex-shrink-0 w-12 text-right">{e.pct.toFixed(1)}%</span>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

export function BowlingControlLeaders({ rows }: { rows: LeaderboardRow[] }) {
  const dots = build(rows, r => r.stats.bowlDots ?? 0, false)
  const boundaries = build(rows, r => (r.stats.bowlFours ?? 0) + (r.stats.bowlSixes ?? 0), true)
  if (dots.length === 0) return null
  const minOvers = MIN_BALLS_FOR_ECONOMY / 6
  return (
    <>
      <Chart
        title="Dot Ball % — Top 10"
        subtitle={`Share of balls bowled that were dots. Minimum ${minOvers} overs, for the current filter.`}
        entries={dots}
        unit="dot balls"
      />
      <Chart
        title="Least Boundaries Conceded % — Top 10"
        subtitle={`Share of balls bowled hit for four or six, lowest first. Minimum ${minOvers} overs, for the current filter.`}
        entries={boundaries}
        unit="boundaries"
      />
    </>
  )
}
