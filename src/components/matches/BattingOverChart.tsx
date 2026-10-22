'use client'

// Batting tab chart: runs scored (bars) and wickets (dots) in every over of the Spartans innings, for
// one Spartans batter or the entire innings, with the side's current run rate (CRR) and, in a chase,
// the required run rate (RRR). Mirrors BowlingOverChart: the lines show the rates at the end of each
// over and each over is judged against the rate going in. A solid bar means the batter scored faster
// than that rate, a hollow bar slower. The batter defaults to the signed-in player when they batted.
// Maths: src/lib/matchInsights.ts. Plain inline SVG.

import { useMemo, useRef, useState, type PointerEvent } from 'react'
import { useSession } from 'next-auth/react'
import type { BallRow, BatterLine } from '@/lib/ballByBall'
import { battingOverSeries, overContexts, overEndRates, parRuns, vsBattingRate, wormPoints } from '@/lib/matchInsights'

const W = 360, H = 240
const PAD = { l: 30, r: 8, t: 12, b: 26 }
const ALL = '__all__'

const BAR = '#0F766E'        // Spartans teal, as on the Insights tab
const CRR_COLOUR = '#DC2626'
const MUTED = 'text-[var(--scorecard-text-faint)]'
const HEAD = 'font-rajdhani text-xs font-bold tracking-widest uppercase text-[var(--scorecard-text-faint)] mb-2'

export function BattingOverChart({ side, batters, totalOvers, battedFirst, opponentTotal, opponentRuns, opponentName }: {
  side: BallRow[]                 // the Spartans innings
  batters: BatterLine[]
  totalOvers: number
  battedFirst: boolean | null     // Spartans batted first (so there is no target)
  opponentTotal?: number | null   // scorecard total of the opposition innings, preferred for the target
  opponentRuns: number            // sum of the opposition innings in the commentary, the fallback
  opponentName?: string | null
}) {
  const { data: session } = useSession()
  const myId = (session?.user as { playerId?: string | null } | undefined)?.playerId ?? null
  const listed = batters.filter(b => b.balls > 0 || b.out)
  const mine = myId ? listed.find(b => b.playerId === myId) : undefined
  const [choice, setChoice] = useState<string | null>(null)
  const selected = choice ?? (mine ? mine.name : ALL)
  const batter = selected === ALL ? null : listed.find(b => b.name === selected) ?? null

  const [hover, setHover] = useState<number | null>(null)
  const svgRef = useRef<SVGSVGElement>(null)

  const points = useMemo(() => wormPoints(side), [side])
  const overs = useMemo(() => battingOverSeries(side, batter?.name ?? null, totalOvers), [side, batter, totalOvers])
  const firstTotal = opponentTotal && opponentTotal > 0 ? opponentTotal : opponentRuns
  const target = battedFirst === false && firstTotal > 0 ? firstTotal + 1 : null
  const contexts = useMemo(() => overContexts(points, target, totalOvers), [points, target, totalOvers])
  const endRates = useMemo(() => overEndRates(points, target, totalOvers), [points, target, totalOvers])
  const basis = target != null ? 'rrr' : 'crr'

  const xMax = overs.length
  const plotW = W - PAD.l - PAD.r, plotH = H - PAD.t - PAD.b
  const slotW = plotW / xMax
  const maxBar = Math.max(0, ...overs.map(o => o.runs))
  const maxRate = Math.max(0, ...endRates.map(c => c.crr), target ? target / totalOvers : 0)
  const maxPar = batter ? Math.max(0, ...overs.map(o => parRuns(o, contexts.find(c => c.over === o.over), basis) ?? 0)) : 0
  const yMax = Math.min(32, Math.max(12, Math.ceil((Math.max(maxBar, maxRate, maxPar) * 1.15) / 4) * 4))   // a multiple of 4
  const y = (v: number) => H - PAD.b - (Math.min(v, yMax) / yMax) * plotH
  const xc = (over: number) => PAD.l + (over - 0.5) * slotW
  const clipped = contexts.some(c => (c.rrr ?? 0) > yMax)

  const line = (pick: (c: (typeof endRates)[number]) => number | null) =>
    endRates.flatMap((c, i) => {
      const v = pick(c)
      return v == null ? [] : [`${i === 0 || pick(endRates[i - 1]) == null ? 'M' : 'L'}${xc(c.over).toFixed(1)},${y(v).toFixed(1)}`]
    }).join(' ')
  const crrPath = line(c => c.crr)
  // The RRR line is the rate needed going INTO each over (over 1 = the opening rate, target / total
  // overs), so it sits at the same x as the over it judges; the CRR line is the rate at the END of it.
  const rrrPath = contexts.flatMap((c, i) =>
    c.rrr == null ? [] : [`${i === 0 || contexts[i - 1].rrr == null ? 'M' : 'L'}${xc(c.over).toFixed(1)},${y(c.rrr).toFixed(1)}`]).join(' ')

  const yTicks = [0, 1, 2, 3, 4].map(i => (yMax / 4) * i)
  const xTicks = Array.from({ length: xMax }, (_, i) => i + 1).filter(o => o === 1 || o % 5 === 0 || o === xMax)

  function overAt(e: PointerEvent<SVGElement>): number | null {
    const svg = svgRef.current
    if (!svg) return null
    const rect = svg.getBoundingClientRect()
    if (rect.width === 0) return null
    const px = ((e.clientX - rect.left) / rect.width) * W
    return Math.min(Math.max(Math.floor((px - PAD.l) / slotW) + 1, 1), xMax)
  }

  const label = batter ? batter.name : 'Entire innings'
  const ov = hover != null ? overs[hover - 1] : null
  const ctx = hover != null ? contexts.find(c => c.over === hover) : undefined
  const endR = hover != null ? endRates.find(c => c.over === hover) : undefined
  const verdict = ov ? vsBattingRate(ov, ctx, basis) : null
  const par = ov ? parRuns(ov, ctx, basis) : null

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
        <p className={`${HEAD} !mb-0`}>Runs and wickets by over</p>
        <label className="flex items-center gap-1.5 font-rajdhani text-xs text-[var(--scorecard-text-2)]">
          <span className={MUTED}>Show</span>
          <select value={selected} onChange={e => { setChoice(e.target.value); setHover(null) }}
            className="rounded border border-[var(--scorecard-table-border)] bg-transparent px-1.5 py-1 text-xs text-[var(--scorecard-heading-text)] max-w-[11rem]">
            <option value={ALL}>Entire innings (all batters)</option>
            {listed.map(b => (
              <option key={b.name} value={b.name}>
                {b.name}{b.playerId && b.playerId === myId ? ' (you)' : ''} · {b.runs} ({b.balls})
              </option>
            ))}
          </select>
        </label>
      </div>

      <svg ref={svgRef} viewBox={`0 0 ${W} ${H}`} className="w-full h-auto" role="group"
        aria-label={`${label}: runs scored and wickets in each of ${xMax} overs${target ? `, against a required rate that started at ${(target / totalOvers).toFixed(2)}` : ''}.`}>
        {yTicks.map(t => (
          <g key={t}>
            <line x1={PAD.l} x2={W - PAD.r} y1={y(t)} y2={y(t)} style={{ stroke: 'var(--scorecard-table-divider)' }} strokeWidth={1} />
            <text x={PAD.l - 4} y={y(t) + 3} textAnchor="end" fontSize={9} style={{ fill: 'var(--scorecard-text-faint)' }}>{Math.round(t)}</text>
          </g>
        ))}
        {xTicks.map(o => (
          <text key={o} x={xc(o)} y={H - PAD.b + 12} textAnchor="middle" fontSize={9} style={{ fill: 'var(--scorecard-text-faint)' }}>{o}</text>
        ))}
        <text x={(PAD.l + W - PAD.r) / 2} y={H - 3} textAnchor="middle" fontSize={9} style={{ fill: 'var(--scorecard-text-faint)' }}>Overs</text>

        {hover != null && (
          <rect x={PAD.l + (hover - 1) * slotW} y={PAD.t} width={slotW} height={plotH} style={{ fill: 'var(--scorecard-divider)', opacity: 0.45 }} />
        )}

        {overs.map(o => {
          const cx = xc(o.over), bw = Math.max(slotW * 0.62, 2)
          if (!o.faced) {
            // an over he did not face: a faint tick so the whole innings length is still visible
            return <rect key={o.over} x={cx - bw / 2} y={H - PAD.b - 2} width={bw} height={2} rx={1} style={{ fill: 'var(--scorecard-table-border)' }} />
          }
          const hollow = vsBattingRate(o, contexts.find(c => c.over === o.over), basis) === 'behind'
          const h = Math.max(H - PAD.b - y(o.runs), 2)
          const parHere = batter ? parRuns(o, contexts.find(c => c.over === o.over), basis) : null
          // labels clear the par tick and its connector: they sit above whichever is higher
          const topY = Math.min(H - PAD.b - h, parHere != null ? y(parHere) : Infinity)
          return (
            <g key={o.over}>
              <rect x={cx - bw / 2} y={H - PAD.b - h} width={bw} height={h} rx={1.5} style={hollow ? { fill: BAR, fillOpacity: 0.18, stroke: BAR, strokeWidth: 1.5 } : { fill: BAR, opacity: 0.9 }} />
              {batter && (() => {
                // par for the balls he faced: where he needed to be, not a full over's rate
                const p = parRuns(o, contexts.find(c => c.over === o.over), basis)
                return p == null ? null : (
                  <>
                    {/* the gap between runs and par: the deficit (bar below the tick) or surplus (above it) */}
                    <line x1={cx} x2={cx} y1={y(o.runs)} y2={y(p)} strokeWidth={1.5} style={{ stroke: 'var(--fx-accent)' }} />
                    <line x1={cx - bw / 2 - 2} x2={cx + bw / 2 + 2} y1={y(p)} y2={y(p)} strokeWidth={2} style={{ stroke: 'var(--fx-accent)' }} />
                  </>
                )
              })()}
              {batter && parHere != null ? (
                <>
                  {/* the gap to par sits above the tick; the runs figure moves inside the bar (or the table) */}
                  <text x={cx} y={topY - 5} textAnchor="middle" fontSize={8} fontWeight={700}
                    style={{ fill: o.runs < parHere - 0.05 ? CRR_COLOUR : 'var(--scorecard-heading-text)' }}>
                    {parHere > yMax ? '▲' : ''}{Math.abs(o.runs - parHere) < 0.05 ? '0' : `${o.runs < parHere ? '−' : '+'}${Math.abs(o.runs - parHere).toFixed(1)}`}
                  </text>
                  {h >= 10 && <text x={cx} y={H - PAD.b - 3} textAnchor="middle" fontSize={8} style={{ fill: 'var(--scorecard-heading-text)' }}>{o.runs}</text>}
                </>
              ) : (
                <text x={cx} y={topY - 5} textAnchor="middle" fontSize={8} style={{ fill: 'var(--scorecard-text-2)' }}>{o.runs}</text>
              )}
              {Array.from({ length: o.wickets }, (_, i) => (
                <circle key={i} cx={cx} cy={topY - 16 - i * 7} r={3} style={{ fill: 'var(--scorecard-heading-text)' }} />
              ))}
            </g>
          )
        })}

        {target != null && rrrPath && <path d={rrrPath} fill="none" strokeWidth={2} strokeLinejoin="round" style={{ stroke: 'var(--fx-accent)' }} />}
        {crrPath && <path d={crrPath} fill="none" strokeWidth={2} strokeLinejoin="round" style={{ stroke: CRR_COLOUR }} />}

        <rect x={PAD.l} y={PAD.t} width={plotW} height={plotH} fill="transparent" style={{ touchAction: 'pan-y', cursor: 'crosshair' }}
          onPointerMove={e => setHover(overAt(e))} onPointerDown={e => setHover(overAt(e))} />
      </svg>

      <div className="mt-1 min-h-[3.25rem] space-y-0.5 font-rajdhani text-sm text-[var(--scorecard-heading-text)]" aria-live="polite">
        {ov == null ? (
          <p className={`text-xs ${MUTED}`}>Hover over, or tap and drag across, the chart to see each over.</p>
        ) : (
          <>
            <p>
              <span className="font-bold">Over {ov.over}</span>{' '}
              {ov.bowlers.length > 0
                ? <span className={MUTED}>bowled by {ov.bowlers.map(b => b.name).join(', ')}</span>
                : <span className={MUTED}>not bowled (the innings had ended)</span>}
            </p>
            {ov.faced ? (
              <p>
                <span className={MUTED}>{batter ? `${batter.name}: ` : 'Over: '}</span>
                <span className="tabular-nums font-bold">{ov.runs}</span> run{ov.runs === 1 ? '' : 's'}
                {batter && <span className={MUTED}> off </span>}
                {batter && <><span className="tabular-nums font-bold">{ov.balls}</span> ball{ov.balls === 1 ? '' : 's'}</>}
                <span className={MUTED}> · </span>
                <span className="tabular-nums font-bold">{ov.wickets}</span> wicket{ov.wickets === 1 ? '' : 's'}
                {batter && par != null && (
                  <span className={MUTED}> · par {par.toFixed(1)} for {ov.balls} ball{ov.balls === 1 ? '' : 's'}
                    {Math.abs(ov.runs - par) >= 0.05 && <> ({ov.runs < par ? 'short by' : 'ahead by'} {Math.abs(ov.runs - par).toFixed(1)})</>}
                  </span>
                )}
              </p>
            ) : (
              batter && ov.bowlers.length > 0 && <p className={`text-xs ${MUTED}`}>{batter.name} did not face this over.</p>
            )}
            {ctx && (
              <p className="text-xs">
                <span className={MUTED}>Going in: Spartans {ctx.runsBefore}/{ctx.wicketsBefore}</span>
                {ctx.crr != null && <><span className={MUTED}> · CRR </span><span className="tabular-nums" style={{ color: CRR_COLOUR }}>{ctx.crr.toFixed(2)}</span></>}
                {ctx.rrr != null && ctx.needed != null && (
                  <>
                    <span className={MUTED}> · RRR </span><span className="tabular-nums" style={{ color: 'var(--fx-accent)' }}>{ctx.rrr.toFixed(2)}</span>
                    <span className={MUTED}> (needed {ctx.needed} from {ctx.oversLeft} ov)</span>
                  </>
                )}
                {endR && (
                  <>
                    <span className={MUTED}> · after the over: CRR </span><span className="tabular-nums" style={{ color: CRR_COLOUR }}>{endR.crr.toFixed(2)}</span>
                  </>
                )}
                {verdict && (
                  <span className={MUTED}> · {verdict === 'ahead' ? 'ahead of' : verdict === 'behind' ? 'behind' : 'level with'} the {basis === 'rrr' ? 'required' : 'current'} rate for the balls faced</span>
                )}
              </p>
            )}
          </>
        )}
      </div>


      {batter && (() => {
        const rows = overs.flatMap(o => {
          if (!o.faced || o.balls === 0) return []
          const p = parRuns(o, contexts.find(c => c.over === o.over), basis)
          return [{ o, p }]
        })
        if (rows.every(r => r.p == null)) return null
        const rated = rows.filter(r => r.p != null)
        const runs = rated.reduce((a, r) => a + r.o.runs, 0)
        const parSum = rated.reduce((a, r) => a + (r.p as number), 0)
        const gap = runs - parSum
        return (
          <div className="mt-2">
            <p className={`${HEAD} !mb-1`}>{batter.name} against par, over by over</p>
            <div className="grid grid-cols-[auto_1fr_auto_auto] gap-x-3 gap-y-0.5 font-rajdhani text-xs tabular-nums text-[var(--scorecard-text-2)]">
              <span className={MUTED}>Over</span><span className={MUTED}>Runs (balls)</span><span className={`${MUTED} text-right`}>Par</span><span className={`${MUTED} text-right`}>Gap</span>
              {rows.map(({ o, p }) => (
                <div key={o.over} className="contents">
                  <span>{o.over}</span>
                  <span>{o.runs} ({o.balls})</span>
                  <span className="text-right">{p == null ? '–' : p.toFixed(1)}</span>
                  <span className="text-right font-bold" style={{ color: p == null ? undefined : o.runs < p - 0.05 ? CRR_COLOUR : 'var(--scorecard-heading-text)' }}>
                    {p == null ? '–' : Math.abs(o.runs - p) < 0.05 ? '0.0' : `${o.runs < p ? '−' : '+'}${Math.abs(o.runs - p).toFixed(1)}`}
                  </span>
                </div>
              ))}
              <span className="font-bold text-[var(--scorecard-heading-text)] col-span-2 border-t border-[var(--scorecard-table-divider)] pt-0.5">Total</span>
              <span className="text-right font-bold border-t border-[var(--scorecard-table-divider)] pt-0.5">{parSum.toFixed(1)}</span>
              <span className="text-right font-bold border-t border-[var(--scorecard-table-divider)] pt-0.5" style={{ color: gap < -0.05 ? CRR_COLOUR : 'var(--scorecard-heading-text)' }}>
                {Math.abs(gap) < 0.05 ? '0.0' : `${gap < 0 ? '−' : '+'}${Math.abs(gap).toFixed(1)}`}
              </span>
            </div>
          </div>
        )
      })()}

      <div className="flex flex-wrap gap-x-4 gap-y-1 mt-1 font-rajdhani text-xs text-[var(--scorecard-text-2)]">
        <span className="inline-flex items-center gap-1.5">
          <span className="inline-block h-2.5 w-2.5 rounded-sm" style={{ background: BAR, opacity: 0.85 }} />
          {target != null ? 'Beat the RRR' : 'Lifted the CRR'}
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="inline-block h-2.5 w-2.5 rounded-sm" style={{ background: 'rgba(15,118,110,0.18)', border: `1.5px solid ${BAR}` }} />
          {target != null ? 'Fell behind the RRR' : 'Slowed the CRR'}
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="inline-block h-2 w-2 rounded-full" style={{ background: 'var(--scorecard-heading-text)' }} />
          Wicket
        </span>
        {endRates.length > 0 && (
          <span className="inline-flex items-center gap-1.5">
            <span className="inline-block h-0.5 w-4 rounded" style={{ background: CRR_COLOUR }} />
            CRR
          </span>
        )}
        {target != null && (
          <span className="inline-flex items-center gap-1.5">
            <span className="inline-block h-0.5 w-4 rounded" style={{ background: 'var(--fx-accent)' }} />
            RRR <span className={MUTED}>· target {target}</span>
          </span>
        )}
      </div>
      <p className={`text-[10px] font-rajdhani mt-1 ${MUTED}`}>
        {target != null
          ? `Chasing ${target}${opponentName ? ` against ${opponentName}` : ''}. The RRR line is the rate needed going into each over (over 1 is the opening rate, before a ball is bowled) and the CRR line is the rate at the end of it, so each bar sits next to the rate it is judged against: a solid bar means the batter kept pace with the rate needed for the balls he faced and a hollow bar fell short.`
          : battedFirst === true
            ? 'Spartans batted first, so there is no target: only the team’s current run rate (at the end of each over) is shown. A solid bar means the batter kept pace with the CRR going in for the balls he faced; a hollow bar fell short. Over 1 has no CRR yet, so it stays solid.'
            : 'Batting order isn’t known for this match, so there is no required rate: only the team’s current run rate is shown.'}
        {batter ? ' Bars show only the overs this batter faced (wides are not balls faced); the faint ticks are overs he did not face. The gold tick on each bar is par, and the thin gold line joining it to the top of the bar is the gap; the figure above the tick is that gap in runs (red when behind, ▲ when par is above the axis) and the figure inside the bar is his runs: the rate going in scaled to the balls he faced (rate × balls ÷ 6, at most 6 a ball), so one run off one ball against a rate of 6 is level, not a miss.' : ' Entire innings counts every run (extras included) and every wicket.'}
        {clipped && ` The axis stops at ${yMax}; the required rate line is clipped above that.`}
      </p>
    </div>
  )
}
