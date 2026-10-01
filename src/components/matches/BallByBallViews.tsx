'use client'

// The ball-by-ball views behind the match tabs (Batting, Bowling, Fielding,
// Commentary). All numbers come from the pure helpers in src/lib/ballByBall.ts;
// this file only lays them out. "Spartans batting" is the innings where the
// Spartans bat (batting_side = 'spartans'); "Spartans bowling" is the opposition
// innings (batting_side = 'opponent'). Hub player links come from the linked
// view's *_player_id columns, so only Spartans players link to a profile.

import { useMemo, useState } from 'react'
import { PlayerNameLink } from '@/lib/playerLink'
import {
  type BallRow, type InningsSide, type OverGroup, PHASE_KEYS, PHASE_LABEL,
  ballChip, ballLabel, ballsForSide, economy, formatOvers, groupOvers, howOut, phaseRangeLabel, phaseSplit,
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

/** Runs per over as bars, wickets as red dots above the bar. */
function OverBars({ overs }: { overs: OverGroup[] }) {
  const max = Math.max(1, ...overs.map(o => o.runs))
  return (
    <div>
      <p className={HEAD}>Over by over</p>
      <div className="flex items-end gap-[3px] h-24" role="img"
        aria-label={`Runs per over: ${overs.map(o => `over ${o.over_no} ${o.runs}`).join(', ')}`}>
        {overs.map(o => (
          <div key={o.over_no} className="flex-1 min-w-0 flex flex-col items-center justify-end h-full"
            title={`Over ${o.over_no}: ${o.runs} runs${o.wickets ? `, ${o.wickets} wkt${o.wickets > 1 ? 's' : ''}` : ''}`}>
            <span className="text-[9px] font-rajdhani text-[var(--scorecard-text-faint)] leading-none mb-0.5">{o.runs}</span>
            <div className="w-full rounded-t bg-gold/50"
              style={{ height: `${Math.max((o.runs / max) * 62, 3)}px` }} />
            <div className="h-2 flex items-center">
              {o.wickets > 0 && <span className="h-1.5 w-1.5 rounded-full" style={{ background: 'var(--fx-danger-text)' }} />}
            </div>
            <span className="text-[9px] font-rajdhani text-[var(--scorecard-text-faint)] leading-none">{o.over_no}</span>
          </div>
        ))}
      </div>
      <p className="text-[10px] font-rajdhani text-[var(--scorecard-text-faint)] mt-1">
        Red dot = a wicket fell in that over.
      </p>
    </div>
  )
}

function PhaseTable({ balls, totalOvers, bowling }: { balls: BallRow[]; totalOvers: number; bowling?: boolean }) {
  const lines = phaseSplit(balls, totalOvers)
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
    </div>
  )
}

// ── Batting ────────────────────────────────────────────────────────────────

const PHASE_SHORT: Record<string, string> = { pp: 'PP', mid: 'Mid', death: 'Death' }

export function BattingView({ balls, totalOvers }: { balls: BallRow[]; totalOvers: number }) {
  const side = useMemo(() => ballsForSide(balls, 'spartans'), [balls])
  const batters = useMemo(() => summariseBatters(side, totalOvers), [side, totalOvers])
  const overs = useMemo(() => groupOvers(side), [side])
  if (side.length === 0) return <Empty>No ball-by-ball for the Spartans innings.</Empty>

  return (
    <div className="space-y-5">
      <p className="font-rajdhani text-sm text-[var(--scorecard-heading-text)]">
        Spartans batting <span className="text-[var(--scorecard-text-faint)]">· {inningsTotal(side)}</span>
      </p>
      <OverBars overs={overs} />
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

export function BowlingView({ balls, totalOvers }: { balls: BallRow[]; totalOvers: number }) {
  const side = useMemo(() => ballsForSide(balls, 'opponent'), [balls])
  const bowlers = useMemo(() => summariseBowlers(side, totalOvers), [side, totalOvers])
  const overs = useMemo(() => groupOvers(side), [side])
  if (side.length === 0) return <Empty>No ball-by-ball for the opposition innings.</Empty>

  const spell = (l: { legalBalls: number; runs: number; wickets: number }) =>
    l.legalBalls || l.runs ? `${formatOvers(l.legalBalls)}-${l.runs}-${l.wickets}` : '–'

  return (
    <div className="space-y-5">
      <p className="font-rajdhani text-sm text-[var(--scorecard-heading-text)]">
        Spartans bowling <span className="text-[var(--scorecard-text-faint)]">· opposition {inningsTotal(side)}</span>
      </p>
      <OverBars overs={overs} />
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

const CHIP_STYLE: Record<string, { bg: string; fg: string }> = {
  dot:    { bg: '#9CA3AF', fg: '#fff' },
  run:    { bg: '#374151', fg: '#fff' },
  four:   { bg: '#E8A23B', fg: '#fff' },
  six:    { bg: '#8FB82B', fg: '#fff' },
  wide:   { bg: '#C98379', fg: '#fff' },
  noball: { bg: '#C98379', fg: '#fff' },
  bye:    { bg: '#6B7280', fg: '#fff' },
  wicket: { bg: '#DC2626', fg: '#fff' },
}

function Chip({ ball }: { ball: BallRow }) {
  const chip = ballChip(ball)
  const s = CHIP_STYLE[chip.kind]
  return (
    <span title={`${ballLabel(ball)}  ${ball.bowler} to ${ball.batter}: ${ball.outcome ?? chip.label}`}
      className="inline-flex h-7 min-w-[28px] px-1 items-center justify-center rounded-full text-[11px] font-bold font-rajdhani"
      style={{ background: s.bg, color: s.fg }}>
      {chip.label}
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

      <div className="divide-y divide-[var(--scorecard-table-divider)]">
        {overs.map(o => {
          const last = o.balls[o.balls.length - 1]
          const wickets = o.balls.filter(b => b.is_wicket)
          return (
            <div key={o.over_no} className="py-2.5">
              <div className="flex items-baseline justify-between gap-3">
                <p className="font-rajdhani text-sm text-[var(--scorecard-heading-text)] min-w-0">
                  <span className="font-bold mr-2">Ov {o.over_no}</span>
                  {o.bowlers.join(', ')} <span className="text-[var(--scorecard-text-faint)]">to {o.batters.join(', ')}</span>
                </p>
                <p className="font-rajdhani text-xs text-[var(--scorecard-text-faint)] whitespace-nowrap">
                  {o.runs} run{o.runs === 1 ? '' : 's'}{o.wickets ? ` · ${o.wickets} wkt${o.wickets > 1 ? 's' : ''}` : ''}
                  {last?.score_after != null ? ` · ${last.score_after}/${last.wickets_after ?? ''}` : ''}
                </p>
              </div>
              <div className="flex flex-wrap gap-1.5 mt-1.5">
                {o.balls.map(b => <Chip key={b.seq} ball={b} />)}
              </div>
              {wickets.map(w => (
                <p key={w.seq} className="font-rajdhani text-xs mt-1" style={{ color: 'var(--fx-danger-text)' }}>
                  {w.dismissed_batter ?? w.batter} {howOut(w.dismissed_batter ?? w.batter, w.dismissal_text, w.dismissal_kind)}
                  {w.shot ? ` · ${w.shot}${w.direction ? ` to ${w.direction}` : ''}` : ''}
                </p>
              ))}
            </div>
          )
        })}
      </div>
    </div>
  )
}
