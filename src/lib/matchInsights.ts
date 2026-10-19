// Pure maths for the Insights tab's run-rate worm (cumulative runs by over for each innings, plus
// the constant required-rate line for the chase). No I/O, no React; unit-tested in
// matchInsights.test.ts. Sides follow ballByBall.ts: 'spartans' = Spartans batting.

import { ballLabel, ballsForSide, howOut, type BallRow, type InningsSide } from '@/lib/ballByBall'

/** One wicket, for the hover/tap readout on the chart. */
export interface WicketNote {
  wicketNo: number      // 1-based count of wickets in the innings
  batter: string
  how: string           // "c Darshan Shetty b Shabarinath"
  score: number         // team score when the wicket fell
  ball: string          // CricHeroes ball label, e.g. "7.2"
}

export interface WormPoint {
  over: number          // completed overs at this point (0 = start of the innings)
  runs: number          // cumulative runs
  wickets: number       // wickets that fell in this over (0 at the start)
  notes: WicketNote[]   // one per wicket in this over, in order
}

/** Cumulative runs at the end of each over, starting from (0, 0). Overs with no deliveries between
 *  the first and last are carried forward so the line has no gaps. */
export function wormPoints(inningsBalls: BallRow[]): WormPoint[] {
  const byOver = new Map<number, { runs: number; notes: WicketNote[] }>()
  let running = 0, wicketNo = 0
  for (const b of [...inningsBalls].sort((a, c) => a.seq - c.seq)) {
    const o = byOver.get(b.over_no) ?? { runs: 0, notes: [] }
    o.runs += b.runs_total
    running += b.runs_total
    if (b.is_wicket) {
      wicketNo += 1
      const batter = b.dismissed_batter ?? b.batter
      o.notes.push({ wicketNo, batter, how: howOut(batter, b.dismissal_text, b.dismissal_kind), score: running, ball: ballLabel(b) })
    }
    byOver.set(b.over_no, o)
  }
  const last = Math.max(0, ...Array.from(byOver.keys()))
  const points: WormPoint[] = [{ over: 0, runs: 0, wickets: 0, notes: [] }]
  let total = 0
  for (let over = 1; over <= last; over++) {
    const o = byOver.get(over)
    total += o?.runs ?? 0
    points.push({ over, runs: total, wickets: o?.notes.length ?? 0, notes: o?.notes ?? [] })
  }
  return points
}

export interface WormInnings {
  side: InningsSide
  points: WormPoint[]
  total: number         // runs at the last point
}

export interface WormModel {
  first: WormInnings | null      // the side that batted first (null when toss data is missing)
  second: WormInnings | null
  /** Both innings when batting order is unknown: Spartans first, then the opposition. */
  ordered: WormInnings[]
  target: number | null          // first-innings total + 1
  requiredRate: number | null    // target / total overs, constant for the whole chase
  chaseSide: InningsSide | null
}

/** `battedFirst` is from Spartans' point of view (true = Spartans batted first). `scorecardTotals`
 *  prefers the scorecard's own totals for the target, since commentary can lag a run or two. */
export function buildWorm(
  balls: BallRow[],
  totalOvers: number,
  battedFirst: boolean | null,
  scorecardTotals?: { spartans?: number | null; opponent?: number | null },
): WormModel {
  const make = (side: InningsSide): WormInnings | null => {
    const inn = ballsForSide(balls, side)
    if (inn.length === 0) return null
    const points = wormPoints(inn)
    return { side, points, total: points[points.length - 1].runs }
  }
  const sp = make('spartans')
  const op = make('opponent')
  const ordered = [sp, op].filter((x): x is WormInnings => !!x)

  if (battedFirst == null) {
    return { first: null, second: null, ordered, target: null, requiredRate: null, chaseSide: null }
  }
  const firstSide: InningsSide = battedFirst ? 'spartans' : 'opponent'
  const secondSide: InningsSide = battedFirst ? 'opponent' : 'spartans'
  const first = firstSide === 'spartans' ? sp : op
  const second = secondSide === 'spartans' ? sp : op

  const cardTotal = scorecardTotals?.[firstSide]
  const firstTotal = typeof cardTotal === 'number' && cardTotal > 0 ? cardTotal : first?.total ?? null
  const target = firstTotal != null && firstTotal > 0 ? firstTotal + 1 : null
  const requiredRate = target != null && totalOvers > 0 ? target / totalOvers : null

  return {
    first, second,
    ordered: [first, second].filter((x): x is WormInnings => !!x),
    target, requiredRate, chaseSide: secondSide,
  }
}

/** The constant required-rate line: runs needed after `over` overs if the chase scored at exactly
 *  the starting required rate, i.e. a straight line from (0, 0) to (totalOvers, target). */
export function requiredLineAt(over: number, target: number, totalOvers: number): number {
  return (target * over) / totalOvers
}

export interface ChaseRow {
  over: number
  runsInOver: number
  scored: number           // cumulative after this over
  needed: number           // runs still needed (0 once the target is reached)
  oversLeft: number
  crr: number              // current run rate: scored / over
  rrr: number | null       // required rate for the rest of the innings (null with no overs left)
  wickets: number          // wickets down after this over
}

/** The chase over by over: runs scored, runs still needed and the required rate from that point,
 *  `(target - scored) / (totalOvers - over)`. Stops at the over the target is reached. */
export function chaseSeries(points: WormPoint[], target: number, totalOvers: number): ChaseRow[] {
  const rows: ChaseRow[] = []
  let wkts = 0
  for (let i = 1; i < points.length; i++) {
    const p = points[i]
    wkts += p.wickets
    const needed = Math.max(target - p.runs, 0)
    const oversLeft = Math.max(totalOvers - p.over, 0)
    rows.push({
      over: p.over,
      runsInOver: p.runs - points[i - 1].runs,
      scored: p.runs,
      needed,
      oversLeft,
      crr: p.runs / p.over,
      rrr: needed === 0 ? 0 : oversLeft > 0 ? needed / oversLeft : null,
      wickets: wkts,
    })
    if (needed === 0) break
  }
  return rows
}
