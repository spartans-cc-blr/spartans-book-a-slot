'use client'

// The Insights tab of the match views: a run-rate worm (cumulative runs by over for each innings,
// wickets marked and hoverable) with a constant required-rate line for the chase, then the chase's
// current vs required rate over by over. Built from ball-by-ball rows, so it only exists when
// commentary has been uploaded. Maths lives in src/lib/matchInsights.ts.
// Plain inline SVG, no chart library (limitations.md H-6).

import { useMemo, useRef, useState, type PointerEvent } from 'react'
import { PlayerNameLink } from '@/lib/playerLink'
import type { BallRow, InningsSide } from '@/lib/ballByBall'
import { phaseBounds } from '@/lib/ballByBall'
import { buildWorm, chaseSeries, rateCrossings, type ChaseRow, type WicketNote, type WormInnings, type WormPoint } from '@/lib/matchInsights'

const W = 360, H = 230
const PAD = { l: 34, r: 10, t: 12, b: 28 }

const COLOUR: Record<InningsSide, string> = { spartans: '#0F766E', opponent: '#DC2626' }
const HEAD = 'font-rajdhani text-xs font-bold tracking-widest uppercase text-[var(--scorecard-text-faint)] mb-2'
const MUTED = 'text-[var(--scorecard-text-faint)]'

function niceCeil(n: number): number {
  const step = n > 150 ? 50 : n > 60 ? 20 : 10
  return Math.max(step, Math.ceil(n / step) * step)
}

interface ActiveWicket { side: InningsSide; note: WicketNote }

/** Which over a pointer is over, from its x position in the SVG's own coordinates (so it works at any
 *  rendered width). Whole overs only, clamped to 1..maxOver. */
function overAtPointer(e: PointerEvent<SVGElement>, svg: SVGSVGElement | null, xMax: number, maxOver: number): number | null {
  if (!svg) return null
  const rect = svg.getBoundingClientRect()
  if (rect.width === 0) return null
  const px = ((e.clientX - rect.left) / rect.width) * W
  const over = Math.round(((px - PAD.l) / (W - PAD.l - PAD.r)) * xMax)
  return Math.min(Math.max(over, 1), Math.max(maxOver, 1))
}

/** Who batted (Spartans batting) or who bowled (Spartans bowling) in one over. Spartans players link to their stats. */
function OverWho({ side, point }: { side: InningsSide; point: WormPoint }) {
  if (side === 'spartans') {
    if (point.batters.length === 0) return null
    return (
      <span>
        <span className={MUTED}>Batting: </span>
        {point.batters.map((b, i) => (
          <span key={b.name}>{i > 0 && ', '}<PlayerNameLink name={b.name} playerId={b.id} /> <span className={MUTED}>{b.runs} ({b.balls})</span></span>
        ))}
      </span>
    )
  }
  if (point.bowlers.length === 0) return null
  return (
    <span>
      <span className={MUTED}>Bowled by: </span>
      {point.bowlers.map((b, i) => (
        <span key={b.name}>{i > 0 && ', '}<PlayerNameLink name={b.name} playerId={b.id} /></span>
      ))}
    </span>
  )
}

export function InsightsView({ balls, totalOvers, battedFirst, opponentName, scorecardTotals }: {
  balls: BallRow[]
  totalOvers: number
  battedFirst: boolean | null
  opponentName?: string | null
  scorecardTotals?: { spartans?: number | null; opponent?: number | null }
}) {
  const model = useMemo(() => buildWorm(balls, totalOvers, battedFirst, scorecardTotals), [balls, totalOvers, battedFirst, scorecardTotals])
  const [active, setActive] = useState<ActiveWicket | null>(null)
  const [hoverOver, setHoverOver] = useState<number | null>(null)
  const svgRef = useRef<SVGSVGElement>(null)
  const chase = model.second && model.target != null ? model.second : null
  const rows = useMemo(
    () => (chase && model.target != null ? chaseSeries(chase.points, model.target, totalOvers) : []),
    [chase, model.target, totalOvers],
  )

  if (model.ordered.length === 0) return <p className="font-rajdhani text-sm text-[var(--scorecard-text-faint)]">No ball-by-ball data to chart.</p>

  const label = (side: InningsSide) => (side === 'spartans' ? 'Spartans' : opponentName || 'Opposition')
  const xMax = Math.max(totalOvers, ...model.ordered.map(i => i.points[i.points.length - 1].over))
  const yMax = niceCeil(Math.max(model.target ?? 0, ...model.ordered.map(i => i.total)))
  const x = (over: number) => PAD.l + (over / xMax) * (W - PAD.l - PAD.r)
  const y = (runs: number) => H - PAD.b - (runs / yMax) * (H - PAD.t - PAD.b)
  const path = (inn: WormInnings) => inn.points.map((p, i) => `${i ? 'L' : 'M'}${x(p.over).toFixed(1)},${y(p.runs).toFixed(1)}`).join(' ')

  const maxOver = Math.max(...model.ordered.map(i => i.points[i.points.length - 1].over))
  const { ppEnd, deathStart } = phaseBounds(totalOvers)
  const yTicks = [0, 1, 2, 3, 4].map(i => (yMax / 4) * i)
  const xTicks = Array.from({ length: Math.floor(xMax / 5) + 1 }, (_, i) => i * 5)
  const alt = model.ordered.map(i => `${label(i.side)} ${i.total}`).join(', ')
  const wicketText = (side: InningsSide, n: WicketNote) =>
    `${n.batter} ${n.how} · ${n.score}/${n.wicketNo} at ${n.ball} ov (${label(side)})`

  return (
    <div className="space-y-6">
      <div>
        <p className={HEAD}>Run-rate worm</p>
        <svg ref={svgRef} viewBox={`0 0 ${W} ${H}`} className="w-full h-auto" role="group"
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
            <path key={inn.side} d={path(inn)} fill="none" strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" style={{ stroke: COLOUR[inn.side] }} />
          ))}

          {/* hover/tap any over: a guide line, a dot on each innings, and the readout below. Sits under the wickets so they stay clickable. */}
          {hoverOver != null && (
            <g pointerEvents="none">
              <line x1={x(hoverOver)} x2={x(hoverOver)} y1={PAD.t} y2={H - PAD.b} strokeWidth={1} style={{ stroke: 'var(--scorecard-text-faint)' }} />
              {model.ordered.map(inn => {
                const p = inn.points.find(q => q.over === hoverOver)
                return p ? <circle key={inn.side} cx={x(p.over)} cy={y(p.runs)} r={3.5} style={{ fill: COLOUR[inn.side] }} /> : null
              })}
            </g>
          )}
          <rect x={PAD.l} y={PAD.t} width={W - PAD.l - PAD.r} height={H - PAD.t - PAD.b} fill="transparent" style={{ touchAction: 'pan-y', cursor: 'crosshair' }}
            onPointerMove={e => setHoverOver(overAtPointer(e, svgRef.current, xMax, maxOver))}
            onPointerDown={e => setHoverOver(overAtPointer(e, svgRef.current, xMax, maxOver))} />

          {/* wickets, drawn last so they sit on top of both lines. Hover (or focus, or tap) shows who and how. */}
          {model.ordered.map(inn => inn.points.flatMap(p => p.notes.map((n, i) => {
            const cx = x(p.over), cy = y(p.runs) - i * 7
            const on = active?.side === inn.side && active.note.wicketNo === n.wicketNo
            const text = wicketText(inn.side, n)
            return (
              <g key={`${inn.side}-${n.wicketNo}`} role="button" tabIndex={0} aria-label={`Wicket: ${text}`} style={{ cursor: 'pointer', outline: 'none' }}
                onMouseEnter={() => setActive({ side: inn.side, note: n })}
                onMouseLeave={() => setActive(a => (a?.side === inn.side && a.note.wicketNo === n.wicketNo ? null : a))}
                onFocus={() => setActive({ side: inn.side, note: n })}
                onBlur={() => setActive(null)}
                onClick={() => setActive(a => (a?.side === inn.side && a.note.wicketNo === n.wicketNo ? null : { side: inn.side, note: n }))}>
                <title>{text}</title>
                <circle cx={cx} cy={cy} r={9} fill="transparent" />
                <circle cx={cx} cy={cy} r={on ? 4.5 : 3} strokeWidth={1.5}
                  style={{ fill: on ? COLOUR[inn.side] : 'var(--scorecard-card-bg, #fff)', stroke: COLOUR[inn.side] }} />
              </g>
            )
          })))}
        </svg>

        <p className="min-h-[1.25rem] mt-1 font-rajdhani text-sm text-[var(--scorecard-heading-text)]" aria-live="polite">
          {active
            ? <><span className="font-bold" style={{ color: COLOUR[active.side] }}>W{active.note.wicketNo}</span> {wicketText(active.side, active.note)}</>
            : <span className={`text-xs ${MUTED}`}>Hover over, or tap, a wicket for details.</span>}
        </p>

        <div className="mt-1 min-h-[2.5rem] space-y-0.5 font-rajdhani text-sm text-[var(--scorecard-heading-text)]" aria-live="polite">
          {hoverOver == null
            ? <p className={`text-xs ${MUTED}`}>Hover over, or tap and drag across, the chart to see each over: score, and who bowled or batted.</p>
            : model.ordered.map(inn => {
              const p = inn.points.find(q => q.over === hoverOver)
              if (!p) return <p key={inn.side} className={`text-xs ${MUTED}`}>{label(inn.side)}: innings over before over {hoverOver}.</p>
              return (
                <p key={inn.side}>
                  <span className="font-bold" style={{ color: COLOUR[inn.side] }}>{label(inn.side)}</span>{' '}
                  <span className="tabular-nums">{p.runs}/{p.wicketsAfter}</span> <span className={MUTED}>after over {p.over} · {p.runsInOver} off it · </span>
                  <OverWho side={inn.side} point={p} />
                </p>
              )
            })}
        </div>

        <div className="flex flex-wrap gap-x-4 gap-y-1 mt-1 font-rajdhani text-xs text-[var(--scorecard-text-2)]">
          {model.ordered.map(inn => (
            <span key={inn.side} className="inline-flex items-center gap-1.5">
              <span className="inline-block h-0.5 w-4 rounded" style={{ background: COLOUR[inn.side] }} />
              {label(inn.side)} <span className={MUTED}>· {inn.total}</span>
            </span>
          ))}
          {model.target != null && (
            <span className="inline-flex items-center gap-1.5">
              <span className="inline-block w-4 border-t-2 border-dashed" style={{ borderColor: 'var(--fx-accent)' }} />
              Required rate <span className={MUTED}>· {model.requiredRate?.toFixed(2)} an over</span>
            </span>
          )}
          <span className="inline-flex items-center gap-1.5">
            <span className="inline-block h-2 w-2 rounded-full border-2" style={{ borderColor: 'var(--scorecard-text-faint)' }} />
            Wicket
          </span>
        </div>
        <p className={`text-[10px] font-rajdhani mt-1 ${MUTED}`}>
          Shaded bands are the powerplay and death overs.
          {model.target != null && chase && <> Above the dashed line, {label(chase.side)} are ahead of the rate needed from ball one.</>}
          {battedFirst == null && ' Batting order isn’t known for this match, so no target line is drawn.'}
        </p>
      </div>

      {chase && model.target != null && rows.length > 0 && (
        <>
          <RateChart rows={rows} points={chase.points} side={chase.side} target={model.target} totalOvers={totalOvers} colour={COLOUR[chase.side]} chaseName={label(chase.side)} />
          <ChaseTable rows={rows} />
        </>
      )}
    </div>
  )
}

// ── Current vs required rate ───────────────────────────────────────────────

function RateChart({ rows, points, side, target, totalOvers, colour, chaseName }: {
  rows: ChaseRow[]; points: WormPoint[]; side: InningsSide; target: number; totalOvers: number; colour: string; chaseName: string
}) {
  const RH = 170
  const [hover, setHover] = useState<number | null>(null)
  const svgRef = useRef<SVGSVGElement>(null)
  const crossings = useMemo(() => rateCrossings(rows), [rows])
  const maxOver = rows[rows.length - 1].over
  const start = target / totalOvers
  // The last few overs can push the required rate sky-high, so the axis is capped and the line clipped to it.
  const yMax = Math.min(30, Math.max(12, Math.ceil(Math.max(start * 2, ...rows.map(r => r.crr)) / 2) * 2))
  const x = (over: number) => PAD.l + (over / totalOvers) * (W - PAD.l - PAD.r)
  const y = (rate: number) => RH - PAD.b - (Math.min(rate, yMax) / yMax) * (RH - PAD.t - PAD.b)
  const rrr = [{ over: 0, rate: start }, ...rows.filter(r => r.rrr != null).map(r => ({ over: r.over, rate: r.rrr as number }))]
  const crr = rows.map(r => ({ over: r.over, rate: r.crr }))
  const line = (pts: { over: number; rate: number }[]) => pts.map((p, i) => `${i ? 'L' : 'M'}${x(p.over).toFixed(1)},${y(p.rate).toFixed(1)}`).join(' ')
  const ticks = [0, 1, 2, 3, 4].map(i => (yMax / 4) * i)
  const xTicks = Array.from({ length: Math.floor(totalOvers / 5) + 1 }, (_, i) => i * 5)
  const last = rows[rows.length - 1]

  return (
    <div>
      <p className={HEAD}>Current vs required rate · {chaseName}</p>
      <svg ref={svgRef} viewBox={`0 0 ${W} ${RH}`} className="w-full h-auto" role="group"
        aria-label={`${chaseName} current run rate against the required rate, over by over. Required rate started at ${start.toFixed(2)}${last ? ` and was ${last.rrr == null ? 'not available' : last.rrr.toFixed(2)} after over ${last.over}` : ''}.`}>
        {ticks.map(t => (
          <g key={t}>
            <line x1={PAD.l} x2={W - PAD.r} y1={y(t)} y2={y(t)} style={{ stroke: 'var(--scorecard-table-divider)' }} strokeWidth={1} />
            <text x={PAD.l - 4} y={y(t) + 3} textAnchor="end" fontSize={9} style={{ fill: 'var(--scorecard-text-faint)' }}>{Math.round(t)}</text>
          </g>
        ))}
        {xTicks.map(t => (
          <text key={t} x={x(t)} y={RH - PAD.b + 13} textAnchor="middle" fontSize={9} style={{ fill: 'var(--scorecard-text-faint)' }}>{t}</text>
        ))}
        <text x={(PAD.l + W - PAD.r) / 2} y={RH - 3} textAnchor="middle" fontSize={9} style={{ fill: 'var(--scorecard-text-faint)' }}>Overs</text>
        <path d={line(rrr)} fill="none" strokeWidth={2} strokeLinejoin="round" style={{ stroke: 'var(--fx-accent)' }} />
        <path d={line(crr)} fill="none" strokeWidth={2} strokeLinejoin="round" style={{ stroke: colour }} />
        {hover != null && (
          <g pointerEvents="none">
            <line x1={x(hover)} x2={x(hover)} y1={PAD.t} y2={RH - PAD.b} strokeWidth={1} style={{ stroke: 'var(--scorecard-text-faint)' }} />
            {rows.filter(r => r.over === hover).map(r => (
              <g key={r.over}>
                <circle cx={x(r.over)} cy={y(r.crr)} r={3.5} style={{ fill: colour }} />
                {r.rrr != null && <circle cx={x(r.over)} cy={y(r.rrr)} r={3.5} style={{ fill: 'var(--fx-accent)' }} />}
              </g>
            ))}
          </g>
        )}
        <rect x={PAD.l} y={PAD.t} width={W - PAD.l - PAD.r} height={RH - PAD.t - PAD.b} fill="transparent" style={{ touchAction: 'pan-y', cursor: 'crosshair' }}
          onPointerMove={e => setHover(overAtPointer(e, svgRef.current, totalOvers, maxOver))}
          onPointerDown={e => setHover(overAtPointer(e, svgRef.current, totalOvers, maxOver))} />
        {/* where the two lines meet */}
        {crossings.map((c, i) => {
          const text = `Lines meet at about over ${c.over.toFixed(1)}, ${c.rate.toFixed(2)} an over: ${c.direction === 'behind' ? 'current rate fell below the required rate' : 'current rate moved above the required rate'}`
          return (
            <g key={i} role="button" tabIndex={0} aria-label={text} style={{ cursor: 'pointer', outline: 'none' }}
              onMouseEnter={() => setHover(Math.min(Math.max(Math.round(c.over), 1), maxOver))}
              onFocus={() => setHover(Math.min(Math.max(Math.round(c.over), 1), maxOver))}
              onClick={() => setHover(Math.min(Math.max(Math.round(c.over), 1), maxOver))}>
              <title>{text}</title>
              <circle cx={x(c.over)} cy={y(c.rate)} r={10} fill="transparent" />
              <circle cx={x(c.over)} cy={y(c.rate)} r={5} strokeWidth={2} style={{ fill: 'var(--scorecard-card-bg, #fff)', stroke: 'var(--scorecard-heading-text)' }} />
            </g>
          )
        })}
      </svg>

      <div className="mt-1 min-h-[2.5rem] space-y-0.5 font-rajdhani text-sm text-[var(--scorecard-heading-text)]" aria-live="polite">
        {hover == null
          ? <p className={`text-xs ${MUTED}`}>Hover over, or tap and drag across, the chart to see each over.</p>
          : rows.filter(r => r.over === hover).map(r => {
            const pt = points.find(q => q.over === r.over)
            return (
              <p key={r.over}>
                <span className="font-bold">Over {r.over}</span>{' '}
                <span className={MUTED}>· current </span><span className="tabular-nums">{r.crr.toFixed(2)}</span>
                <span className={MUTED}> · required </span><span className="tabular-nums">{r.rrr == null ? '–' : r.rrr.toFixed(2)}</span>
                <span className={MUTED}> · {r.scored}/{r.wickets}, need {r.needed}{r.oversLeft > 0 ? ` from ${r.oversLeft} ov` : ''}{pt ? ` · ${r.runsInOver} off the over · ` : ''}</span>
                {pt && <OverWho side={side} point={pt} />}
              </p>
            )
          })}
      </div>
      {crossings.length > 0 && (
        <ul className="font-rajdhani text-xs text-[var(--scorecard-text-2)] mt-1 space-y-0.5">
          {crossings.map((c, i) => (
            <li key={i}>
              <span className="inline-block h-2 w-2 rounded-full border-2 mr-1.5 align-middle" style={{ borderColor: 'var(--scorecard-heading-text)' }} />
              Lines meet at about over {c.over.toFixed(1)} ({c.rate.toFixed(2)} an over):{' '}
              {c.direction === 'behind' ? `${chaseName}'s current rate fell below the required rate.` : `${chaseName}'s current rate moved above the required rate.`}
            </li>
          ))}
        </ul>
      )}
      <div className="flex flex-wrap gap-x-4 gap-y-1 mt-1 font-rajdhani text-xs text-[var(--scorecard-text-2)]">
        <span className="inline-flex items-center gap-1.5"><span className="inline-block h-0.5 w-4 rounded" style={{ background: colour }} />Current rate</span>
        <span className="inline-flex items-center gap-1.5"><span className="inline-block h-0.5 w-4 rounded" style={{ background: 'var(--fx-accent)' }} />Required rate</span>
      </div>
      <p className={`text-[10px] font-rajdhani mt-1 ${MUTED}`}>
        Required rate = runs still needed ÷ overs left, so it climbs when the chase falls behind and drops when it speeds up.
        {yMax === 30 && ' The axis stops at 30; the line is clipped above that.'}
      </p>
    </div>
  )
}

function ChaseTable({ rows }: { rows: ChaseRow[] }) {
  const TH = 'text-right px-1.5 py-1 font-semibold whitespace-nowrap'
  const TD = 'text-right px-1.5 py-1 tabular-nums whitespace-nowrap'
  return (
    <details className="group">
      <summary className="cursor-pointer list-none font-rajdhani text-xs font-bold tracking-widest uppercase text-[var(--fx-accent)]">
        Chase by over <span className={`${MUTED} group-open:hidden`}>▾</span><span className={`${MUTED} hidden group-open:inline`}>▴</span>
      </summary>
      <div className="overflow-x-auto mt-2">
        <table className="w-full text-xs font-rajdhani">
          <thead>
            <tr className="text-[var(--scorecard-text-faint)] border-b border-[var(--scorecard-table-border)]">
              <th className="text-left py-1 pr-2 font-semibold">Over</th>
              <th className={TH}>Runs</th><th className={TH}>Score</th><th className={TH}>Need</th>
              <th className={TH}>Req RR</th><th className={TH}>Cur RR</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(r => (
              <tr key={r.over} className="border-b border-[var(--scorecard-table-divider)] text-[var(--scorecard-text-2)]">
                <td className="py-1 pr-2">{r.over}</td>
                <td className={TD}>{r.runsInOver}</td>
                <td className={TD}>{r.scored}/{r.wickets}</td>
                <td className={TD}>{r.needed}</td>
                <td className={TD}>{r.rrr == null ? '–' : r.rrr.toFixed(2)}</td>
                <td className={TD}>{r.crr.toFixed(2)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </details>
  )
}
