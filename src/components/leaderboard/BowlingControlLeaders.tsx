// Detailed → Bowl only — two top-10 bar charts above the table:
//   1. Dot ball % (dot balls ÷ balls bowled), highest first.
//   2. Boundary % conceded ((fours + sixes) ÷ balls bowled), lowest first.
// Ranked within the 15 bowlers with the most balls bowled (rankControl()). The
// items come from the leaderboard rows (scorecard data) or, when a phase tab is
// selected, from ball-by-ball commentary. Plain server component (no hooks);
// see features/leaderboard.md §6.2.2 and §6.2.3.

import { PlayerNameLink } from '@/lib/playerLink'
import { PHASE_KEYS, PHASE_LABEL, type PhaseKey } from '@/lib/ballByBall'
import { CONTROL_COHORT_SIZE, rankControl, type ControlEntry, type ControlItem } from '@/lib/bowlingPhaseLeaders'

// Segment colours for the stacked "All" view (white text on each reads in both themes).
const PHASE_COLOUR: Record<PhaseKey, string> = { pp: '#2563EB', mid: '#D97706', death: '#0D9488' }
const PHASE_SHORT: Record<PhaseKey, string> = { pp: 'PP', mid: 'Mid', death: 'Death' }

function Chart({ title, subtitle, entries, unit, metric }: { title: string; subtitle: string; entries: ControlEntry[]; unit: string; metric: 'dots' | 'boundaries' }) {
  const stacked = entries.some(e => e.item.phases)
  const max = Math.max(...entries.map(e => e.pct), 1)
  return (
    <div className="bg-[var(--stats-card-bg)] dark:bg-ink-3 border border-[var(--stats-card-border)] dark:border-ink-5 rounded p-4 mb-4">
      <h3 className="font-cinzel text-sm text-[var(--stats-accent)] dark:text-gold font-semibold mb-1">{title}</h3>
      <p className="font-rajdhani text-xs text-[var(--stats-text-muted)] dark:text-zinc-500 mb-2">{subtitle}</p>
      {stacked && (
        <div className="flex items-center gap-3 mb-3 font-rajdhani text-[11px] text-[var(--stats-text-muted)] dark:text-zinc-400">
          {PHASE_KEYS.map(k => (
            <span key={k} className="inline-flex items-center gap-1">
              <span className="inline-block w-2.5 h-2.5 rounded-sm" style={{ background: PHASE_COLOUR[k] }} />{PHASE_LABEL[k]}
            </span>
          ))}
        </div>
      )}
      <div className="space-y-2">
        {entries.map((e, i) => (
          <div key={e.item.playerId} className="flex items-center gap-2">
            <span className="font-cinzel text-xs text-[var(--stats-text-muted)] dark:text-zinc-500 w-7 flex-shrink-0 text-right">{i + 1}</span>
            <div className="flex-1 relative h-7 bg-[var(--stats-row-bg)] dark:bg-ink-4 rounded overflow-hidden">
              {e.item.phases ? (
                <div className="absolute inset-y-0 left-0 flex rounded overflow-hidden" style={{ width: `${Math.max((e.pct / max) * 100, 6)}%` }}>
                  {PHASE_KEYS.map(k => {
                    const t = e.item.phases![k]
                    const c = t[metric]
                    if (c === 0 || e.count === 0) return null
                    const pct = t.balls > 0 ? (c / t.balls) * 100 : 0
                    return (
                      <div
                        key={k}
                        className="h-full flex items-center justify-center overflow-hidden font-rajdhani text-[10px] font-bold text-white"
                        style={{ width: `${(c / e.count) * 100}%`, background: PHASE_COLOUR[k], opacity: 0.85 }}
                        title={`${PHASE_LABEL[k]}: ${c} ${unit} in ${t.balls} balls (${pct.toFixed(1)}%)`}
                      >
                        {(c / e.count) * (Math.max((e.pct / max) * 100, 6)) >= 14 ? `${PHASE_SHORT[k]} ${pct.toFixed(0)}%` : ''}
                      </div>
                    )
                  })}
                </div>
              ) : (
                <div className="absolute inset-y-0 left-0 bg-gold/40 rounded" style={{ width: `${Math.max((e.pct / max) * 100, 6)}%` }} />
              )}
              <div className="absolute inset-0 flex items-center gap-2 px-2.5">
                <span className="font-rajdhani text-xs font-semibold text-[var(--stats-text)] dark:text-parchment truncate flex-1 min-w-0">
                  <PlayerNameLink name={e.item.playerName} playerId={e.item.playerId} cricHeroesUrl={e.item.cricheroesUrl} />
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

export function BowlingControlLeaders({
  items, minBalls, phaseLabel = null, source = null,
}: {
  items: ControlItem[]
  /** Smallest sample that can qualify at all (balls bowled overall, or in the selected phase). */
  minBalls: number
  /** e.g. "Powerplay (overs 1–6)" when a phase tab is selected. */
  phaseLabel?: string | null
  /** Caption for the stacked "All" view, e.g. which commentary it is built from. */
  source?: string | null
}) {
  const { dots, boundaries } = rankControl(items, minBalls)
  if (dots.length === 0) return null
  const scope = phaseLabel
    ? `${phaseLabel} only. Among the ${CONTROL_COHORT_SIZE} bowlers with the most balls bowled in it, for the current filter.`
    : source
      ? `Stacked by phase. ${source} Among the ${CONTROL_COHORT_SIZE} bowlers with the most balls bowled, for the current filter.`
      : `Among the ${CONTROL_COHORT_SIZE} bowlers with the most balls bowled, for the current filter.`
  return (
    <>
      <Chart
        title={phaseLabel ? `Dot Ball % — ${phaseLabel.split(' (')[0]}` : 'Dot Ball % — Top 10'}
        subtitle={`Share of balls bowled that were dots. ${scope}`}
        entries={dots}
        unit="dot balls"
        metric="dots"
      />
      <Chart
        title={phaseLabel ? `Least Boundaries Conceded % — ${phaseLabel.split(' (')[0]}` : 'Least Boundaries Conceded % — Top 10'}
        subtitle={`Share of balls bowled hit for four or six, lowest first. ${scope}`}
        entries={boundaries}
        unit="boundaries"
        metric="boundaries"
      />
    </>
  )
}
