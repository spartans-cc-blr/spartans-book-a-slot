'use client'

// The Insights tab of the match views: a run-rate worm (cumulative runs by over for each innings,
// wickets marked) with a constant required-rate line for the chase. Built from ball-by-ball rows,
// so it only exists when commentary has been uploaded. Maths lives in src/lib/matchInsights.ts.
// Plain inline SVG, no chart library (limitations.md H-6).

import { useMemo } from 'react'
import type { BallRow, InningsSide } from '@/lib/ballByBall'
import { phaseBounds } from '@/lib/ballByBall'
import { buildWorm, type WormInnings } from '@/lib/matchInsights'

const W = 360, H = 230
const PAD = { l: 34, r: 10, t: 12, b: 28 }

const COLOUR: Record<InningsSide, string> = { spartans: '#0F766E', opponent: '#DC2626' }
const HEAD = 'font-rajdhani text-xs font-bold tracking-widest uppercase text-[var(--scorecard-text-faint)] mb-2'

function niceCeil(n: number): number {
  const step = n > 150 ? 50 : n > 60 ? 20 : 10
  return Math.max(step, Math.ceil(n / step) * step)
}

export function InsightsView({ balls, totalOvers, battedFirst, opponentName, scorecardTotals }: {
  balls: BallRow[]
  totalOvers: number
  battedFirst: boolean | null
  opponentName?: string | null
  scorecardTotals?: { spartans?: number | null; opponent?: number | null }
}) {
  const model = useMemo(() => buildWorm(balls, totalOvers, battedFirst, scorecardTotals), [balls, totalOvers, battedFirst, scorecardTotals])
  if (model.ordered.length === 0) return <p className="font-rajdhani text-sm text-[var(--scorecard-text-faint)]">No ball-by-ball data to chart.</p>

  const label = (side: InningsSide) => (side === 'spartans' ? 'Spartans' : opponentName || 'Opposition')
  const xMax = Math.max(totalOvers, ...model.ordered.map(i => i.points[i.points.length - 1].over))
  const yMax = niceCeil(Math.max(model.target ?? 0, ...model.ordered.map(i => i.total)))
  const x = (over: number) => PAD.l + (over / xMax) * (W - PAD.l - PAD.r)
  const y = (runs: number) => H - PAD.b - (runs / yMax) * (H - PAD.t - PAD.b)
  const path = (inn: WormInnings) => inn.points.map((p, i) => `${i ? 'L' : 'M'}${x(p.over).toFixed(1)},${y(p.runs).toFixed(1)}`).join(' ')

  const { ppEnd, deathStart } = phaseBounds(totalOvers)
  const yTicks = [0, 1, 2, 3, 4].map(i => (yMax / 4) * i)
  const xTicks = Array.from({ length: Math.floor(xMax / 5) + 1 }, (_, i) => i * 5)
  const chase = model.second && model.chaseSide ? model.second : null
  const chaseColour = model.chaseSide ? COLOUR[model.chaseSide] : null
  const alt = model.ordered.map(i => `${label(i.side)} ${i.total}`).join(', ')

  return (
    <div className="space-y-5">
      <div>
        <p className={HEAD}>Run-rate worm</p>
        <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-auto" role="img"
          aria-label={`Cumulative runs by over. ${alt}.${model.target ? ` Target ${model.target}, required rate ${model.requiredRate?.toFixed(2)} an over.` : ''}`}>
          {/* phase bands */}
          <rect x={x(0)} y={PAD.t} width={x(ppEnd) - x(0)} height={H - PAD.t - PAD.b} style={{ fill: 'var(--scorecard-divider)', opacity: 0.35 }} />
          <rect x={x(deathStart - 1)} y={PAD.t} width={x(xMax) - x(deathStart - 1)} height={H - PAD.t - PAD.b} style={{ fill: 'var(--scorecard-divider)', opacity: 0.35 }} />

          {yTicks.map(t => (
            <g key={t}>
              <line x1={PAD.l} x2={W - PAD.r} y1={y(t)} y2={y(t)} style={{ stroke: 'var(--scorecard-table-divider)' }} strokeWidth={1} />
              <text x={PAD.l - 4} y={y(t) + 3} textAnchor="end" fontSize={9} style={{ fill: 'var(--scorecard-text-faint)' }}>{Math.round(t)}</text>
            </g>
          ))}
          {xTicks.map(t => (
            <text key={t} x={x(t)} y={H - PAD.b + 13} textAnchor="middle" fontSize={9} style={{ fill: 'var(--scorecard-text-faint)' }}>{t}</text>
          ))}
          <text x={(PAD.l + W - PAD.r) / 2} y={H - 3} textAnchor="middle" fontSize={9} style={{ fill: 'var(--scorecard-text-faint)' }}>Overs</text>

          {/* constant required-rate line for the chase */}
          {model.target != null && (
            <g>
              <line x1={x(0)} y1={y(0)} x2={x(totalOvers)} y2={y(model.target)} strokeWidth={1.5} strokeDasharray="5 4"
                style={{ stroke: 'var(--fx-accent)' }} />
              <text x={x(totalOvers) - 3} y={y(model.target) - 4} textAnchor="end" fontSize={9} fontWeight={700} style={{ fill: 'var(--fx-accent)' }}>
                Target {model.target}
              </text>
            </g>
          )}

          {model.ordered.map(inn => (
            <g key={inn.side}>
              <path d={path(inn)} fill="none" strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" style={{ stroke: COLOUR[inn.side] }} />
              {inn.points.filter(p => p.wickets > 0).map(p => (
                <g key={p.over}>
                  {Array.from({ length: p.wickets }, (_, i) => (
                    <circle key={i} cx={x(p.over)} cy={y(p.runs) - i * 5} r={3} strokeWidth={1.5}
                      style={{ fill: 'var(--scorecard-card-bg, #fff)', stroke: COLOUR[inn.side] }} />
                  ))}
                </g>
              ))}
            </g>
          ))}
        </svg>

        <div className="flex flex-wrap gap-x-4 gap-y-1 mt-1 font-rajdhani text-xs text-[var(--scorecard-text-2)]">
          {model.ordered.map(inn => (
            <span key={inn.side} className="inline-flex items-center gap-1.5">
              <span className="inline-block h-0.5 w-4 rounded" style={{ background: COLOUR[inn.side] }} />
              {label(inn.side)} <span className="text-[var(--scorecard-text-faint)]">· {inn.total}</span>
            </span>
          ))}
          {model.target != null && (
            <span className="inline-flex items-center gap-1.5">
              <span className="inline-block w-4 border-t-2 border-dashed" style={{ borderColor: 'var(--fx-accent)' }} />
              Required rate <span className="text-[var(--scorecard-text-faint)]">· {model.requiredRate?.toFixed(2)} an over</span>
            </span>
          )}
          <span className="inline-flex items-center gap-1.5">
            <span className="inline-block h-2 w-2 rounded-full border-2" style={{ borderColor: 'var(--scorecard-text-faint)' }} />
            Wicket
          </span>
        </div>
        <p className="text-[10px] font-rajdhani text-[var(--scorecard-text-faint)] mt-1">
          Shaded bands are the powerplay and death overs.
          {model.target != null && chase && chaseColour && (
            <> Above the dashed line, {label(chase.side)} are ahead of the rate needed from ball one.</>
          )}
          {battedFirst == null && ' Batting order isn’t known for this match, so no target line is drawn.'}
        </p>
      </div>
    </div>
  )
}
