// Pure maths for the Insights tab's run-rate worm (cumulative runs by over for each innings, plus
// the constant required-rate line for the chase). No I/O, no React; unit-tested in
// matchInsights.test.ts. Sides follow ballByBall.ts: 'spartans' = Spartans batting.

import { ballsForSide, type BallRow, type InningsSide } from '@/lib/ballByBall'

export interface WormPoint {
  over: number          // completed overs at this point (0 = start of the innings)
  runs: number          // cumulative runs
  wickets: number       // wickets that fell in this over (0 at the start)
}

/** Cumulative runs at the end of each over, starting from (0, 0). Overs with no deliveries between
 *  the first and last are carried forward so the line has no gaps. */
export function wormPoints(inningsBalls: BallRow[]): WormPoint[] {
  const byOver = new Map<number, { runs: number; wickets: number }>()
  for (const b of inningsBalls) {
    const o = byOver.get(b.over_no) ?? { runs: 0, wickets: 0 }
    o.runs += b.runs_total
    if (b.is_wicket) o.wickets += 1
    byOver.set(b.over_no, o)
  }
  const last = Math.max(0, ...Array.from(byOver.keys()))
  const points: WormPoint[] = [{ over: 0, runs: 0, wickets: 0 }]
  let total = 0
  for (let over = 1; over <= last; over++) {
    const o = byOver.get(over)
    total += o?.runs ?? 0
    points.push({ over, runs: total, wickets: o?.wickets ?? 0 })
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
