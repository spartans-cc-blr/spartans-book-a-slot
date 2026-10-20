'use client'

// The ball-by-ball views behind the match tabs (Batting, Bowling, Fielding,
// Commentary). All numbers come from the pure helpers in src/lib/ballByBall.ts;
// this file only lays them out. "Spartans batting" is the innings where the
// Spartans bat (batting_side = 'spartans'); "Spartans bowling" is the opposition
// innings (batting_side = 'opponent'). Hub player links come from the linked
// view's *_player_id columns, so only Spartans players link to a profile.

import { useMemo, useState } from 'react'
import { PlayerNameLink } from '@/lib/playerLink'
import { BowlingOverChart } from '@/components/matches/BowlingOverChart'
import { BattingOverChart } from '@/components/matches/BattingOverChart'
import {
  type BallRow, type InningsSide, PHASE_KEYS, PHASE_LABEL,
  ballChip, ballLabel, ballsForSide, economy, formatOvers, groupOvers, hasDefinedPhases, howOut, phaseRangeLabel, phaseSplit,
  summariseBatters, summariseBowlers, summariseFielders, wicketRows,
} from '@/lib/ballByBall'

const TH = 'text-right px-1.5 py-1 font-semibold whitespace-nowrap'
const TD = 'text-right px-1.5 py-1 tabular-nums whitespace-nowrap'
const HEAD = 'font-rajdhani text-xs font-bold tracking-widest uppercase text-[var(--scorecard-text-faint)] mb-2'
const TABLE = 'w-full text-xs font-rajdhani'
const HEAD_ROW = 'text-[var(--scorecard-text-faint)] border-b border-[var(--scorecard-table-border)]'
const BODY_ROW = 'border-b border-[var(--scorecard-table-divider)] text-[var(--scorecard-text-2)]'

const fmt = (n: number | null, d = 1) => (n == null ? '–' : n.toFixed(d))
const pct = (n: number, d: number) => (d > 0 ? `${Math.round((n / d) * 100)}%` : '–')

function inningsTotal(balls: BallRow[]): string {
  const last = [...balls].sort((a, b) => b.seq - a.seq)[0]
  if (!last) return ''
  const runs = balls.reduce((s, b) => s + b.runs_total, 0)
  const wkts = balls.filter(b => b.is_wicket).length
  const legal = balls.filter(b => b.is_legal).length
  return `${runs}/${wkts} (${formatOvers(legal)} ov)`
}

function Name({ name, id }: { name: string; id: string | null }) {
  return <PlayerNameLink name={name} playerId={id} />
}

function Empty({ children }: { children: React.ReactNode }) {
  return <p className="font-rajdhani text-sm text-[var(--scorecard-text-faint)]">{children}</p>
}

// ── shared pieces ──────────────────────────────────────────────────────────

function PhaseTable({ balls, totalOvers, bowling }: { balls: BallRow[]; totalOvers: number; bowling?: boolean }) {
  const lines = phaseSplit(balls, totalOvers, bowling ? 'bowl' : 'bat')
  return (
    <div>
      <p className={HEAD}>By phase</p>
      <div className="overflow-x-auto">
        <table className={TABLE}>
          <thead>
            <tr className={HEAD_ROW}>
              <th className="text-left py-1 pr-2 font-semibold">Phase</th>
              <th className={TH}>Runs</th><th className={TH}>Wkts</th>
              <th className={TH}>{bowling ? 'Econ' : 'RR'}</th><th className={TH}>Dot%</th>
            </tr>
          </thead>
          <tbody>
            {lines.map(l => (
              <tr key={l.phase} className={BODY_ROW}>
                <td className="py-1 pr-2">
                  {PHASE_LABEL[l.phase]} <span className="text-[var(--scorecard-text-faint)]">· {phaseRangeLabel(l.phase, totalOvers)}</span>
                </td>
                <td className={TD}>{l.legalBalls || l.runs ? l.runs : '–'}</td>
                <td className={TD}>{l.legalBalls || l.runs ? l.wickets : '–'}</td>
                <td className={TD}>{fmt(l.runRate, 2)}</td>
                <td className={TD}>{pct(l.dots, l.legalBalls)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {!hasDefinedPhases(totalOvers) && (
        <p className="text-[10px] font-rajdhani text-[var(--scorecard-text-faint)] mt-1">
          Phases for a {totalOvers}-over game are scaled from the T20 phases.
        </p>
      )}
    </div>
  )
}

// ── Batting ────────────────────────────────────────────────────────────────

const PHASE_SHORT: Record<string, string> = { pp: 'PP', mid: 'Mid', death: 'Death' }

export function BattingView({ balls, totalOvers, battedFirst = null, opponentTotal, opponentName }: { balls: BallRow[]; totalOvers: number; battedFirst?: boolean | null; opponentTotal?: number | null; opponentName?: string | null }) {
  const side = useMemo(() => ballsForSide(balls, 'spartans'), [balls])
  const batters = useMemo(() => summariseBatters(side, totalOvers), [side, totalOvers])
  const oppRuns = useMemo(() => ballsForSide(balls, 'opponent').reduce((s, b) => s + b.runs_total, 0), [balls])
  if (side.length === 0) return <Empty>No ball-by-ball for the Spartans innings.</Empty>

  return (
    <div className="space-y-5">
      <p className="font-rajdhani text-sm text-[var(--scorecard-heading-text)]">
        Spartans batting <span className="text-[var(--scorecard-text-faint)]">· {inningsTotal(side)}</span>
      </p>
      <BattingOverChart side={side} batters={batters} totalOvers={totalOvers} battedFirst={battedFirst} opponentTotal={opponentTotal}
        opponentRuns={oppRuns} opponentName={opponentName} />
      <PhaseTable balls={side} totalOvers={totalOvers} />
      <div>
        <p className={HEAD}>Batters</p>
        <table className={TABLE}>
          <thead>
            <tr className={HEAD_ROW}>
              <th className="text-left py-1 pr-2 font-semibold">Player</th>
              <th className={TH}>R</th><th className={TH}>B</th><th className={TH}>SR</th>
              <th className={TH}>4s</th><th className={TH}>6s</th>
            </tr>
          </thead>
          <tbody>
            {batters.map(b => (
              <tr key={b.name} className={BODY_ROW}>
                <td className="py-1 pr-2">
                  <Name name={b.name} id={b.playerId} />
                  <div className="text-[10px] text-[var(--scorecard-text-faint)]">
                    {b.out ? howOut(b.name, b.out.text, b.out.kind) : b.balls > 0 ? 'not out' : 'did not face'}
                  </div>
                </td>
                <td className={`${TD} font-bold`}>{b.runs}</td>
                <td className={TD}>{b.balls}</td>
                <td className={TD}>{fmt(b.strikeRate)}</td>
                <td className={TD}>{b.fours}</td>
                <td className={TD}>{b.sixes}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="text-[10px] font-rajdhani text-[var(--scorecard-text-faint)] mt-1">B excludes wides.</p>
      </div>
      <div>
        <p className={HEAD}>Dot balls and phases</p>
        <table className={TABLE}>
          <thead>
            <tr className={HEAD_ROW}>
              <th className="text-left py-1 pr-2 font-semibold">Player</th>
              <th className={TH}>Dot%</th>
              {PHASE_KEYS.map(p => <th key={p} className={TH} title={PHASE_LABEL[p]}>{PHASE_SHORT[p]}</th>)}
            </tr>
          </thead>
          <tbody>
            {batters.filter(b => b.balls > 0).map(b => (
              <tr key={b.name} className={BODY_ROW}>
                <td className="py-1 pr-2">{b.name}</td>
                <td className={TD}>{pct(b.dots, b.balls)}</td>
                {PHASE_KEYS.map(p => (
                  <td key={p} className={TD}>
                    {b.byPhase[p].balls || b.byPhase[p].runs ? `${b.byPhase[p].runs} (${b.byPhase[p].balls})` : '–'}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
        <p className="text-[10px] font-rajdhani text-[var(--scorecard-text-faint)] mt-1">Phase columns show runs (balls faced).</p>
      </div>
    </div>
  )
}

// ── Bowling ────────────────────────────────────────────────────────────────

export function BowlingView({ balls, totalOvers, battedFirst = null, spartansTotal, opponentName }: {
  balls: BallRow[]
  totalOvers: number
  battedFirst?: boolean | null    // Spartans batted first, so they were defending: the chart then shows the required rate
  spartansTotal?: number | null
  opponentName?: string | null
}) {
  const side = useMemo(() => ballsForSide(balls, 'opponent'), [balls])
  const bowlers = useMemo(() => summariseBowlers(side, totalOvers), [side, totalOvers])
  const spartansRuns = useMemo(() => ballsForSide(balls, 'spartans').reduce((n, b) => n + b.runs_total, 0), [balls])
  if (side.length === 0) return <Empty>No ball-by-ball for the opposition innings.</Empty>

  const spell = (l: { legalBalls: number; runs: number; wickets: number }) =>
    l.legalBalls || l.runs ? `${formatOvers(l.legalBalls)}-${l.runs}-${l.wickets}` : '–'

  return (
    <div className="space-y-5">
      <p className="font-rajdhani text-sm text-[var(--scorecard-heading-text)]">
        Spartans bowling <span className="text-[var(--scorecard-text-faint)]">· opposition {inningsTotal(side)}</span>
      </p>
      <BowlingOverChart side={side} bowlers={bowlers} totalOvers={totalOvers} battedFirst={battedFirst}
        spartansTotal={spartansTotal} spartansRuns={spartansRuns} opponentName={opponentName} />
      <PhaseTable balls={side} totalOvers={totalOvers} bowling />
      <div>
        <p className={HEAD}>Bowlers</p>
        <table className={TABLE}>
          <thead>
            <tr className={HEAD_ROW}>
              <th className="text-left py-1 pr-2 font-semibold">Player</th>
              <th className={TH}>O</th><th className={TH}>M</th><th className={TH}>R</th><th className={TH}>W</th>
              <th className={TH}>Econ</th><th className={TH}>Dot%</th>
            </tr>
          </thead>
          <tbody>
            {bowlers.map(b => (
              <tr key={b.name} className={BODY_ROW}>
                <td className="py-1 pr-2"><Name name={b.name} id={b.playerId} /></td>
                <td className={TD}>{formatOvers(b.legalBalls)}</td>
                <td className={TD}>{b.maidens}</td>
                <td className={TD}>{b.runs}</td>
                <td className={`${TD} font-bold`}>{b.wickets}</td>
                <td className={TD}>{fmt(economy(b.runs, b.legalBalls), 2)}</td>
                <td className={TD}>{pct(b.dots, b.legalBalls)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="text-[10px] font-rajdhani text-[var(--scorecard-text-faint)] mt-1">
          Runs include wides and no-balls, not byes.
        </p>
      </div>
      <div>
        <p className={HEAD}>Boundaries and extras conceded</p>
        <table className={TABLE}>
          <thead>
            <tr className={HEAD_ROW}>
              <th className="text-left py-1 pr-2 font-semibold">Player</th>
              <th className={TH}>4s</th><th className={TH}>6s</th><th className={TH}>Wd</th><th className={TH}>NB</th>
            </tr>
          </thead>
          <tbody>
            {bowlers.map(b => (
              <tr key={b.name} className={BODY_ROW}>
                <td className="py-1 pr-2">{b.name}</td>
                <td className={TD}>{b.fours}</td><td className={TD}>{b.sixes}</td>
                <td className={TD}>{b.wides}</td><td className={TD}>{b.noBalls}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div>
        <p className={HEAD}>Spells by phase</p>
        <table className={TABLE}>
          <thead>
            <tr className={HEAD_ROW}>
              <th className="text-left py-1 pr-2 font-semibold">Player</th>
              {PHASE_KEYS.map(p => <th key={p} className={TH} title={PHASE_LABEL[p]}>{PHASE_SHORT[p]}</th>)}
            </tr>
          </thead>
          <tbody>
            {bowlers.map(b => (
              <tr key={b.name} className={BODY_ROW}>
                <td className="py-1 pr-2">{b.name}</td>
                {PHASE_KEYS.map(p => <td key={p} className={TD}>{spell(b.byPhase[p])}</td>)}
              </tr>
            ))}
          </tbody>
        </table>
        <p className="text-[10px] font-rajdhani text-[var(--scorecard-text-faint)] mt-1">Overs-runs-wickets in each phase.</p>
      </div>
    </div>
  )
}

// ── Fielding ───────────────────────────────────────────────────────────────

export function FieldingView({ balls }: { balls: BallRow[] }) {
  const side = useMemo(() => ballsForSide(balls, 'opponent'), [balls])
  const fielders = useMemo(() => summariseFielders(side), [side])
  const wickets = useMemo(() => wicketRows(side), [side])
  if (side.length === 0) return <Empty>No ball-by-ball for the opposition innings.</Empty>

  return (
    <div className="space-y-5">
      <p className="font-rajdhani text-sm text-[var(--scorecard-heading-text)]">
        Spartans fielding <span className="text-[var(--scorecard-text-faint)]">· {wickets.length} wicket{wickets.length === 1 ? '' : 's'} taken</span>
      </p>
      <div>
        <p className={HEAD}>Fielders</p>
        {fielders.length === 0 ? (
          <Empty>No catches, stumpings or run-outs recorded.</Empty>
        ) : (
          <div className="overflow-x-auto">
            <table className={TABLE}>
              <thead>
                <tr className={HEAD_ROW}>
                  <th className="text-left py-1 pr-2 font-semibold">Player</th>
                  <th className={TH}>Ct</th><th className={TH} title="Caught behind">Ct†</th>
                  <th className={TH}>St</th><th className={TH}>RO</th><th className={TH}>Total</th>
                </tr>
              </thead>
              <tbody>
                {fielders.map(f => (
                  <tr key={f.name} className={BODY_ROW}>
                    <td className="py-1 pr-2 whitespace-nowrap"><Name name={f.name} id={f.playerId} /></td>
                    <td className={TD}>{f.catches}</td><td className={TD}>{f.caughtBehind}</td>
                    <td className={TD}>{f.stumpings}</td><td className={TD}>{f.runOuts}</td>
                    <td className={`${TD} font-bold`}>{f.total}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
      <div>
        <p className={HEAD}>Wickets</p>
        {wickets.length === 0 ? <Empty>No wickets fell.</Empty> : (
          <div className="overflow-x-auto">
            <table className={TABLE}>
              <thead>
                <tr className={HEAD_ROW}>
                  <th className="text-left py-1 pr-2 font-semibold">Ov</th>
                  <th className="text-left py-1 pr-2 font-semibold">Batter</th>
                  <th className="text-left py-1 pr-2 font-semibold">How out</th>
                  <th className={TH}>Score</th>
                </tr>
              </thead>
              <tbody>
                {wickets.map(w => (
                  <tr key={w.seq} className={BODY_ROW}>
                    <td className="py-1 pr-2 tabular-nums whitespace-nowrap">{w.overLabel}</td>
                    <td className="py-1 pr-2 whitespace-nowrap">{w.batter}</td>
                    <td className="py-1 pr-2">{howOut(w.batter, w.text, w.kind)}</td>
                    <td className={TD}>{w.scoreAfter != null ? `${w.scoreAfter}/${w.wicketsAfter ?? ''}` : '–'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}

// ── Commentary ─────────────────────────────────────────────────────────────

// Pastel tiles with coloured text, like CricHeroes' Overs tab. Status chips,
// so literal colours with dark: pairs rather than --scorecard-* tokens.
const CHIP_CLASS: Record<string, string> = {
  dot:    'bg-stone-200/70 text-stone-900 dark:bg-white/10 dark:text-zinc-100',
  run:    'bg-stone-200/70 text-stone-900 dark:bg-white/10 dark:text-zinc-100',
  four:   'bg-amber-100 text-amber-800 dark:bg-amber-500/25 dark:text-amber-200',
  six:    'bg-teal-100 text-teal-700 dark:bg-teal-500/25 dark:text-teal-200',
  wide:   'bg-rose-100 text-stone-900 dark:bg-rose-500/20 dark:text-rose-100',
  noball: 'bg-rose-100 text-stone-900 dark:bg-rose-500/20 dark:text-rose-100',
  bye:    'bg-stone-200/70 text-stone-700 dark:bg-white/10 dark:text-zinc-300',
  wicket: 'bg-red-100 text-red-600 dark:bg-red-500/25 dark:text-red-200',
}

function Chip({ ball }: { ball: BallRow }) {
  const chip = ballChip(ball)
  const isDot = chip.kind === 'dot'
  const label = isDot ? '•' : chip.label.toUpperCase()
  const long = label.length > 2
  return (
    <span title={`${ballLabel(ball)}  ${ball.bowler} to ${ball.batter}: ${ball.outcome ?? chip.label}`}
      className={`inline-flex h-9 min-w-[2.25rem] px-1.5 items-center justify-center rounded-xl font-semibold tabular-nums ${long ? 'text-xs' : isDot ? 'text-lg leading-none' : 'text-base'} ${CHIP_CLASS[chip.kind]}`}>
      {label}
    </span>
  )
}

const SIDE_OPTIONS: { value: InningsSide; label: string }[] = [
  { value: 'spartans', label: 'Spartans batting' },
  { value: 'opponent', label: 'Spartans bowling' },
]

export function CommentaryView({ balls }: { balls: BallRow[] }) {
  const [side, setSide] = useState<InningsSide>('spartans')
  const innings = useMemo(() => ballsForSide(balls, side), [balls, side])
  const overs = useMemo(() => groupOvers(innings).reverse(), [innings]) // newest first, like CricHeroes

  return (
    <div className="space-y-4">
      <div>
        <label htmlFor="commentary-innings" className="sr-only">Innings</label>
        <select id="commentary-innings" value={side} onChange={e => setSide(e.target.value as InningsSide)}
          className="font-rajdhani text-sm px-3 py-2 rounded border bg-[var(--scorecard-table-bg)] text-[var(--scorecard-heading-text)] border-[var(--scorecard-table-border)] focus:outline-none focus:border-[var(--fx-accent)]">
          {SIDE_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
        {innings.length > 0 && (
          <span className="ml-3 font-rajdhani text-xs text-[var(--scorecard-text-faint)]">
            {side === 'spartans' ? 'Spartans' : 'Opposition'} {inningsTotal(innings)}
          </span>
        )}
      </div>

      {overs.length === 0 && <Empty>No ball-by-ball for this innings.</Empty>}

      <div className="space-y-2.5">
        {overs.map(o => {
          const last = o.balls[o.balls.length - 1]
          const wickets = o.balls.filter(b => b.is_wicket)
          return (
            <div key={o.over_no}
              className="flex items-stretch rounded-2xl border border-[var(--scorecard-table-border)] bg-white dark:bg-[var(--scorecard-table-bg)] overflow-hidden font-sans">
              <div className="w-[4.5rem] flex-shrink-0 flex flex-col items-center justify-center py-3 border-r border-[var(--scorecard-table-divider)]">
                <span className="text-base font-bold text-[var(--scorecard-heading-text)] whitespace-nowrap">Ov {o.over_no}</span>
                {last?.score_after != null && (
                  <span className="text-sm tabular-nums text-[var(--scorecard-text-2)]">
                    {last.score_after}-{last.wickets_after ?? 0}
                  </span>
                )}
              </div>
              <div className="flex-1 min-w-0 px-3 py-2.5">
                <p className="text-sm leading-snug text-[var(--scorecard-heading-text)]">
                  {o.bowlers.join(', ')} to {o.batters.join(', ')}
                </p>
                <div className="flex flex-wrap gap-1.5 mt-2">
                  {o.balls.map(b => <Chip key={b.seq} ball={b} />)}
                </div>
                {side === 'spartans' && (
                  <p className="text-xs mt-2 text-[var(--scorecard-text-2)]">
                    {o.batterScores.map((s, i) => (
                      <span key={s.name}>
                        {i > 0 && <span className="text-[var(--scorecard-text-faint)]"> · </span>}
                        {s.name} <span className="font-semibold tabular-nums">{s.runs}</span>
                        <span className="text-[var(--scorecard-text-faint)] tabular-nums"> ({s.balls})</span>
                      </span>
                    ))}
                  </p>
                )}
                {wickets.map(w => (
                  <p key={w.seq} className="text-xs mt-1" style={{ color: 'var(--fx-danger-text)' }}>
                    {w.dismissed_batter ?? w.batter} {howOut(w.dismissed_batter ?? w.batter, w.dismissal_text, w.dismissal_kind)}
                    {w.shot ? ` · ${w.shot}${w.direction ? ` to ${w.direction}` : ''}` : ''}
                  </p>
                ))}
              </div>
              <div className="w-[4.5rem] flex-shrink-0 flex flex-col items-center justify-center my-1.5 mr-1.5 rounded-xl bg-stone-100 dark:bg-white/5">
                <span className="text-lg font-bold tabular-nums text-[var(--scorecard-heading-text)]">{o.runs}</span>
                <span className="text-sm text-[var(--scorecard-text-2)]">Run{o.runs === 1 ? '' : 's'}</span>
                {o.wickets > 0 && (
                  <span className="text-xs font-semibold text-red-600 dark:text-red-300">{o.wickets} wkt{o.wickets > 1 ? 's' : ''}</span>
                )}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
