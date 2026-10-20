'use client'

// Bowling tab chart: runs conceded (bars) and wickets (dots) in every over of the opposition innings,
// for one Spartans bowler or the entire innings, with the batting side's current run rate (CRR) and,
// when Spartans are defending a total, the required run rate (RRR) going into each over. The bowler
// defaults to the signed-in player when they bowled. Maths: src/lib/matchInsights.ts. Plain inline SVG.

import { useMemo, useRef, useState, type PointerEvent } from 'react'
import { useSession } from 'next-auth/react'
import { PlayerNameLink } from '@/lib/playerLink'
import { formatOvers, type BallRow, type BowlerLine } from '@/lib/ballByBall'
import { bowlingOverSeries, vsRequiredRate, overContexts, overEndRates, wormPoints } from '@/lib/matchInsights'

const W = 360, H = 240
const PAD = { l: 30, r: 8, t: 12, b: 26 }
const ALL = '__all__'

const BAR = '#0F766E'        // Spartans teal, as on the Insights tab
const CRR_COLOUR = '#DC2626' // the opposition's colour on the Insights tab
const MUTED = 'text-[var(--scorecard-text-faint)]'
const HEAD = 'font-rajdhani text-xs font-bold tracking-widest uppercase text-[var(--scorecard-text-faint)] mb-2'

export function BowlingOverChart({ side, bowlers, totalOvers, battedFirst, spartansTotal, spartansRuns, opponentName }: {
  side: BallRow[]                 // the opposition innings (Spartans bowling)
  bowlers: BowlerLine[]
  totalOvers: number
  battedFirst: boolean | null     // Spartans batted first (so they are defending)
  spartansTotal?: number | null   // scorecard total of the Spartans innings, preferred for the target
  spartansRuns: number            // sum of the Spartans innings in the commentary, the fallback
  opponentName?: string | null
}) {
  const { data: session } = useSession()
  const myId = (session?.user as { playerId?: string | null } | undefined)?.playerId ?? null
  const mine = myId ? bowlers.find(b => b.playerId === myId) : undefined
  const [choice, setChoice] = useState<string | null>(null)       // null = not touched, use the default
  const selected = choice ?? (mine ? mine.name : ALL)
  const bowler = selected === ALL ? null : bowlers.find(b => b.name === selected) ?? null
  const bowlerName = bowler?.name ?? null

  const [hover, setHover] = useState<number | null>(null)
  const svgRef = useRef<SVGSVGElement>(null)

  const points = useMemo(() => wormPoints(side), [side])
  const overs = useMemo(() => bowlingOverSeries(side, bowlerName, totalOvers), [side, bowlerName, totalOvers])
  const firstTotal = spartansTotal && spartansTotal > 0 ? spartansTotal : spartansRuns
  const target = battedFirst === true && firstTotal > 0 ? firstTotal + 1 : null
  const contexts = useMemo(() => overContexts(points, target, totalOvers), [points, target, totalOvers])

  const endRates = useMemo(() => overEndRates(points, target, totalOvers), [points, target, totalOvers])

  const xMax = overs.length
  const plotW = W - PAD.l - PAD.r, plotH = H - PAD.t - PAD.b
  const slotW = plotW / xMax
  const maxBar = Math.max(0, ...overs.map(o => o.runs))
  const maxRate = Math.max(0, ...endRates.map(c => c.crr), target ? target / totalOvers : 0)
  // Wicket dots and labels sit above the bars, and the last overs can send the required rate sky-high,
  // so the axis is capped and the required line clipped to it.
  const yMax = Math.min(32, Math.max(12, Math.ceil((Math.max(maxBar, maxRate) * 1.15) / 4) * 4))   // a multiple of 4, so the four gridline steps are whole numbers
  const y = (v: number) => H - PAD.b - (Math.min(v, yMax) / yMax) * plotH
  const xc = (over: number) => PAD.l + (over - 0.5) * slotW
  const clipped = endRates.some(c => (c.rrr ?? 0) > yMax)

  // The lines show the rates at the END of each over, so over 1's point is its own run rate.
  const line = (pick: (c: (typeof endRates)[number]) => number | null) =>
    endRates.flatMap((c, i) => {
      const v = pick(c)
      return v == null ? [] : [`${i === 0 || pick(endRates[i - 1]) == null ? 'M' : 'L'}${xc(c.over).toFixed(1)},${y(v).toFixed(1)}`]
    }).join(' ')
  const crrPath = line(c => c.crr)
  const rrrPath = line(c => c.rrr)

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

  const label = bowler ? bowler.name : 'Entire innings'
  const ov = hover != null ? overs[hover - 1] : null
  const ctx = hover != null ? contexts.find(c => c.over === hover) : undefined
  const endR = hover != null ? endRates.find(c => c.over === hover) : undefined
  const basis = target != null ? 'rrr' : 'crr'
  const verdict = ov ? vsRequiredRate(ov, ctx, basis) : null
  const econ = ov && ov.legalBalls > 0 ? (ov.runs / ov.legalBalls) * 6 : null

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
        <p className={`${HEAD} !mb-0`}>Runs and wickets by over</p>
        <label className="flex items-center gap-1.5 font-rajdhani text-xs text-[var(--scorecard-text-2)]">
          <span className={MUTED}>Show</span>
          <select value={selected} onChange={e => { setChoice(e.target.value); setHover(null) }}
            className="rounded border border-[var(--scorecard-table-border)] bg-transparent px-1.5 py-1 text-xs text-[var(--scorecard-heading-text)] max-w-[11rem]">
            <option value={ALL}>Entire innings (all bowlers)</option>
            {bowlers.map(b => (
              <option key={b.name} value={b.name}>
                {b.name}{b.playerId && b.playerId === myId ? ' (you)' : ''} · {formatOvers(b.legalBalls)}-{b.runs}-{b.wickets}
              </option>
            ))}
          </select>
        </label>
      </div>

      <svg ref={svgRef} viewBox={`0 0 ${W} ${H}`} className="w-full h-auto" role="group"
        aria-label={`${label}: runs conceded and wickets in each of ${xMax} overs${target ? `, against a required rate that started at ${(target / totalOvers).toFixed(2)}` : ''}.`}>
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
          if (!o.bowled) {
            // an over he did not bowl: a faint tick so the whole innings length is still visible
            return <rect key={o.over} x={cx - bw / 2} y={H - PAD.b - 2} width={bw} height={2} rx={1} style={{ fill: 'var(--scorecard-table-border)' }} />
          }
          const verdict = vsRequiredRate(o, contexts.find(c => c.over === o.over), basis)
          const hollow = verdict === 'over'
          const top = y(o.runs)
          const h = Math.max(H - PAD.b - top, 2)
          return (
            <g key={o.over}>
              <rect x={cx - bw / 2} y={H - PAD.b - h} width={bw} height={h} rx={1.5} style={hollow ? { fill: BAR, fillOpacity: 0.18, stroke: BAR, strokeWidth: 1.5 } : { fill: BAR, opacity: 0.9 }} />
              <text x={cx} y={H - PAD.b - h - 3} textAnchor="middle" fontSize={8} style={{ fill: 'var(--scorecard-text-2)' }}>{o.runs}</text>
              {Array.from({ length: o.wickets }, (_, i) => (
                <circle key={i} cx={cx} cy={H - PAD.b - h - 14 - i * 7} r={3} style={{ fill: 'var(--scorecard-heading-text)' }} />
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
                ? <span className={MUTED}>bowled by </span>
                : <span className={MUTED}>not bowled (the innings had ended)</span>}
              {ov.bowlers.map((b, i) => (
                <span key={b.name}>{i > 0 && ', '}<PlayerNameLink name={b.name} playerId={b.id} /></span>
              ))}
            </p>
            {ov.bowled ? (
              <p>
                <span className={MUTED}>{bowler ? `${bowler.name}: ` : 'Over: '}</span>
                <span className="tabular-nums font-bold">{ov.runs}</span> run{ov.runs === 1 ? '' : 's'}
                <span className={MUTED}> · </span>
                <span className="tabular-nums font-bold">{ov.wickets}</span> wicket{ov.wickets === 1 ? '' : 's'}
                {econ != null && <span className={MUTED}> · economy {econ.toFixed(2)} ({ov.legalBalls} ball{ov.legalBalls === 1 ? '' : 's'})</span>}
              </p>
            ) : (
              bowler && ov.bowlers.length > 0 && <p className={`text-xs ${MUTED}`}>{bowler.name} did not bowl this over.</p>
            )}
            {ctx && (
              <p className="text-xs">
                <span className={MUTED}>Going in: {opponentName || 'the opposition'} {ctx.runsBefore}/{ctx.wicketsBefore}</span>
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
                    {endR.rrr != null && <><span className={MUTED}> · RRR </span><span className="tabular-nums" style={{ color: 'var(--fx-accent)' }}>{endR.rrr.toFixed(2)}</span></>}
                  </>
                )}
                {verdict && (
                  <span className={MUTED}> · {verdict === 'under' ? 'under' : verdict === 'over' ? 'over' : 'level with'} the {basis === 'rrr' ? 'required' : 'current'} rate{verdict === 'under' && basis === 'crr' ? ' (brought it down)' : verdict === 'over' && basis === 'crr' ? ' (pushed it up)' : ''}</span>
                )}
              </p>
            )}
          </>
        )}
      </div>

      <div className="flex flex-wrap gap-x-4 gap-y-1 mt-1 font-rajdhani text-xs text-[var(--scorecard-text-2)]">
        <span className="inline-flex items-center gap-1.5">
          <span className="inline-block h-2.5 w-2.5 rounded-sm" style={{ background: BAR, opacity: 0.85 }} />
          {target != null ? 'Held under RRR' : 'Brought CRR down'}
        </span>
        {(
          <span className="inline-flex items-center gap-1.5">
            <span className="inline-block h-2.5 w-2.5 rounded-sm" style={{ background: 'rgba(15,118,110,0.18)', border: `1.5px solid ${BAR}` }} />
            {target != null ? 'Went over RRR' : 'Pushed CRR up'}
          </span>
        )}
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
          ? `Spartans defended ${firstTotal}. The CRR and RRR lines show the batting side's rates at the end of each over (the readout also gives the rates going in, which each over is judged against), so a solid bar means the bowler kept them below the rate they needed; a hollow bar means the over went for more.`
          : battedFirst === false
            ? 'Spartans bowled first, so there is no target yet: only the batting side’s current run rate (at the end of each over) is shown. A solid bar means the over was cheaper than that rate (it brought the CRR down); a hollow bar means it cost more. Over 1 has no CRR yet, so it stays solid.'
            : 'Batting order isn’t known for this match, so there is no required rate: only the batting side’s current run rate is shown.'}
        {bowler ? ' Bars show only the overs this bowler bowled; the faint ticks are overs he did not bowl.' : ' Entire innings counts every run (byes included) and every wicket.'}
        {clipped && ` The axis stops at ${yMax}; the required rate line is clipped above that.`}
      </p>
    </div>
  )
}
