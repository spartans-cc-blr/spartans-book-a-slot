// Pure maths for the Insights tab's run-rate worm (cumulative runs by over for each innings, plus
// the constant required-rate line for the chase). No I/O, no React; unit-tested in
// matchInsights.test.ts. Sides follow ballByBall.ts: 'spartans' = Spartans batting.

import { ballLabel, ballsFaced, ballsForSide, bowlerRuns, howOut, isBowlerWicket, type BallRow, type InningsSide } from '@/lib/ballByBall'

/** One wicket, for the hover/tap readout on the chart. */
export interface WicketNote {
  wicketNo: number      // 1-based count of wickets in the innings
  batter: string
  how: string           // "c Darshan Shetty b Shabarinath"
  score: number         // team score when the wicket fell
  ball: string          // CricHeroes ball label, e.g. "7.2"
}

export interface OverBatter { name: string; id: string | null; runs: number; balls: number }
export interface OverBowler { name: string; id: string | null }

export interface WormPoint {
  over: number          // completed overs at this point (0 = start of the innings)
  runs: number          // cumulative runs
  wickets: number       // wickets that fell in this over (0 at the start)
  wicketsAfter: number  // cumulative wickets after this over
  runsInOver: number
  notes: WicketNote[]   // one per wicket in this over, in order
  batters: OverBatter[] // who faced a ball in this over, in order, with what they scored
  bowlers: OverBowler[] // who bowled this over (more than one if an over was shared)
}

/** Cumulative runs at the end of each over, starting from (0, 0). Overs with no deliveries between
 *  the first and last are carried forward so the line has no gaps. */
export function wormPoints(inningsBalls: BallRow[]): WormPoint[] {
  interface OverAcc { runs: number; notes: WicketNote[]; batters: Map<string, OverBatter>; bowlers: Map<string, OverBowler> }
  const byOver = new Map<number, OverAcc>()
  let running = 0, wicketNo = 0
  for (const b of [...inningsBalls].sort((a, c) => a.seq - c.seq)) {
    const o: OverAcc = byOver.get(b.over_no) ?? { runs: 0, notes: [], batters: new Map(), bowlers: new Map() }
    o.runs += b.runs_total
    const bt = o.batters.get(b.batter) ?? { name: b.batter, id: b.batter_player_id, runs: 0, balls: 0 }
    bt.runs += b.runs_bat
    if (ballsFaced(b)) bt.balls += 1
    if (!bt.id && b.batter_player_id) bt.id = b.batter_player_id
    o.batters.set(b.batter, bt)
    if (!o.bowlers.has(b.bowler)) o.bowlers.set(b.bowler, { name: b.bowler, id: b.bowler_player_id })
    running += b.runs_total
    if (b.is_wicket) {
      wicketNo += 1
      const batter = b.dismissed_batter ?? b.batter
      o.notes.push({ wicketNo, batter, how: howOut(batter, b.dismissal_text, b.dismissal_kind), score: running, ball: ballLabel(b) })
    }
    byOver.set(b.over_no, o)
  }
  const last = Math.max(0, ...Array.from(byOver.keys()))
  const points: WormPoint[] = [{ over: 0, runs: 0, wickets: 0, wicketsAfter: 0, runsInOver: 0, notes: [], batters: [], bowlers: [] }]
  let total = 0, wkts = 0
  for (let over = 1; over <= last; over++) {
    const o = byOver.get(over)
    total += o?.runs ?? 0
    wkts += o?.notes.length ?? 0
    points.push({
      over, runs: total, wickets: o?.notes.length ?? 0, wicketsAfter: wkts, runsInOver: o?.runs ?? 0,
      notes: o?.notes ?? [], batters: o ? Array.from(o.batters.values()) : [], bowlers: o ? Array.from(o.bowlers.values()) : [],
    })
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

export interface RateCrossing {
  over: number                    // fractional over where the two lines meet
  rate: number                    // the rate at that point
  direction: 'behind' | 'ahead'   // behind = current rate fell below the required rate; ahead = it rose above
}

/** Where the current rate and the required rate cross, interpolated between the two overs either
 *  side. A chase can cross more than once. */
export function rateCrossings(rows: ChaseRow[]): RateCrossing[] {
  const out: RateCrossing[] = []
  for (let i = 1; i < rows.length; i++) {
    const a = rows[i - 1], b = rows[i]
    if (a.rrr == null || b.rrr == null) continue
    const d1 = a.crr - a.rrr, d2 = b.crr - b.rrr
    if (d1 === 0 || d2 === 0 || Math.sign(d1) === Math.sign(d2)) continue
    const t = d1 / (d1 - d2)
    out.push({
      over: a.over + t * (b.over - a.over),
      rate: a.crr + t * (b.crr - a.crr),
      direction: d1 > 0 ? 'behind' : 'ahead',
    })
  }
  return out
}

// ── Bowling tab: runs conceded and wickets by over ─────────────────────────

export interface BowlingOver {
  over: number
  runs: number              // runs conceded in this over by the selection
  wickets: number
  legalBalls: number
  bowled: boolean           // the selection bowled at least one ball in this over
  bowlers: OverBowler[]     // everyone who bowled the over
}

const sameName = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase()

/** One entry per over across the whole innings (`totalOvers`, or longer if the innings ran on).
 *  With a `bowler`, an over shows only that bowler's balls: runs charged to him (bat runs, wides and
 *  no-balls, as the Bowling table counts them) and the wickets he is credited with. With `null` it is
 *  the entire innings: every run in the over and every wicket, so it matches the innings score. */
export function bowlingOverSeries(inningsBalls: BallRow[], bowler: string | null, totalOvers: number): BowlingOver[] {
  const last = Math.max(0, ...inningsBalls.map(b => b.over_no))
  const n = Math.max(totalOvers, last)
  const out: BowlingOver[] = []
  for (let over = 1; over <= n; over++) {
    const inOver = inningsBalls.filter(b => b.over_no === over).sort((a, c) => a.seq - c.seq)
    const mine = bowler == null ? inOver : inOver.filter(b => sameName(b.bowler, bowler))
    const bowlers: OverBowler[] = []
    for (const b of inOver) if (!bowlers.some(x => sameName(x.name, b.bowler))) bowlers.push({ name: b.bowler, id: b.bowler_player_id })
    out.push({
      over,
      runs: mine.reduce((s, b) => s + (bowler == null ? b.runs_total : bowlerRuns(b)), 0),
      wickets: mine.filter(b => (bowler == null ? b.is_wicket : isBowlerWicket(b))).length,
      legalBalls: mine.filter(b => b.is_legal).length,
      bowled: mine.length > 0,
      bowlers,
    })
  }
  return out
}

export interface OverContext {
  over: number
  runsBefore: number
  wicketsBefore: number
  crr: number | null        // batting side's run rate going into this over (null for over 1)
  rrr: number | null        // rate they needed from here (null when there is no target)
  needed: number | null     // runs still needed going into this over
  oversLeft: number         // overs left including this one
}

/** The batting side's position going into each over: current rate and, when there is a target
 *  (Spartans batted first), the required rate. "Going in" is deliberate: it is the rate the bowler
 *  faced when he took the ball, so his over can be compared with it. Stops once the target is passed
 *  or the innings has no more overs. */
export function overContexts(points: WormPoint[], target: number | null, totalOvers: number): OverContext[] {
  const out: OverContext[] = []
  for (let k = 1; k < points.length; k++) {
    const before = points[k - 1]
    const needed = target == null ? null : Math.max(target - before.runs, 0)
    if (needed === 0) break
    const oversLeft = Math.max(totalOvers - (k - 1), 0)
    out.push({
      over: k,
      runsBefore: before.runs,
      wicketsBefore: before.wicketsAfter,
      crr: k > 1 ? before.runs / (k - 1) : null,
      rrr: needed != null && oversLeft > 0 ? needed / oversLeft : null,
      needed,
      oversLeft,
    })
  }
  return out
}

export type RateVerdict = 'under' | 'level' | 'over'

/** How a bowled over compared with the rate the batting side needed going into it: 'under' = the
 *  bowler kept it below the required rate, 'over' = went for more. Economy is runs per six legal
 *  balls (a part over is scaled). Pass basis 'crr' to compare with the current rate instead (Spartans bowled first, no target). Null when there is no such rate or the selection didn't bowl. */
export function vsRequiredRate(over: BowlingOver, ctx: OverContext | undefined, basis: 'rrr' | 'crr' = 'rrr'): RateVerdict | null {
  const rate = basis === 'rrr' ? ctx?.rrr : ctx?.crr
  if (!over.bowled || rate == null) return null
  const econ = over.legalBalls > 0 ? (over.runs / over.legalBalls) * 6 : over.runs
  return econ < rate ? 'under' : econ > rate ? 'over' : 'level'
}

export interface OverEndRates {
  over: number
  crr: number               // batting side's run rate at the end of this over
  rrr: number | null        // rate still needed after this over (null with no target, target reached or no overs left)
  needed: number | null
}

/** The batting side's rates at the END of each over (what the chart lines plot at that over). The
 *  bowler's over is judged against the rates going in (`overContexts()`), so an over that brought
 *  the CRR down shows as the line stepping down at its own x. */
export function overEndRates(points: WormPoint[], target: number | null, totalOvers: number): OverEndRates[] {
  const out: OverEndRates[] = []
  for (let k = 1; k < points.length; k++) {
    const p = points[k]
    const needed = target == null ? null : Math.max(target - p.runs, 0)
    const left = Math.max(totalOvers - k, 0)
    out.push({ over: k, crr: p.runs / k, needed, rrr: needed != null && needed > 0 && left > 0 ? needed / left : null })
    if (needed === 0) break
  }
  return out
}
