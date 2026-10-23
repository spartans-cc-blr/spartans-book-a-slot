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

// ── Batting tab: runs by over for a batter or the whole innings ────────────

export interface BattingOver {
  over: number
  runs: number              // off the bat for one batter; every run (extras too) for the entire innings
  balls: number             // balls he faced (wides excluded); legal balls for the entire innings
  wickets: number           // his dismissal in this over (0 or 1); every wicket for the entire innings
  faced: boolean            // he was at the crease for at least one ball of this over
  bowlers: OverBowler[]     // the opposition bowlers of the over
}

/** One entry per over of the innings (`totalOvers`, or longer if it ran on). With a `batter`, an over
 *  shows only the balls he faced; with `null` it is the whole innings, so it adds up to the score. */
export function battingOverSeries(inningsBalls: BallRow[], batter: string | null, totalOvers: number): BattingOver[] {
  const last = Math.max(0, ...inningsBalls.map(b => b.over_no))
  const n = Math.max(totalOvers, last)
  const out: BattingOver[] = []
  for (let over = 1; over <= n; over++) {
    const inOver = inningsBalls.filter(b => b.over_no === over).sort((a, c) => a.seq - c.seq)
    const mine = batter == null ? inOver : inOver.filter(b => sameName(b.batter, batter))
    const bowlers: OverBowler[] = []
    for (const b of inOver) if (!bowlers.some(x => sameName(x.name, b.bowler))) bowlers.push({ name: b.bowler, id: b.bowler_player_id })
    const wickets = batter == null
      ? inOver.filter(b => b.is_wicket).length
      : inOver.filter(b => b.is_wicket && sameName(b.dismissed_batter ?? b.batter, batter)).length
    out.push({
      over,
      runs: mine.reduce((s, b) => s + (batter == null ? b.runs_total : b.runs_bat), 0),
      balls: batter == null ? inOver.filter(b => b.is_legal).length : mine.filter(ballsFaced).length,
      wickets,
      faced: mine.length > 0 || wickets > 0,
      bowlers,
    })
  }
  return out
}

export type BatVerdict = 'ahead' | 'level' | 'behind'

/** Runs a batter needed to keep pace in an over: the rate going in, scaled to the balls he actually
 *  faced (rate x balls / 6), and never more than six a ball. A part over is judged on its own balls,
 *  not extrapolated to a full over. Null when there is no rate or he faced no ball. */
export function parRuns(over: BattingOver, ctx: OverContext | undefined, basis: 'rrr' | 'crr'): number | null {
  const rate = basis === 'rrr' ? ctx?.rrr : ctx?.crr
  if (!over.faced || over.balls === 0 || rate == null) return null
  return Math.min((rate * over.balls) / 6, over.balls * 6)
}

/** Whether the batting selection kept pace with the rate going into the over: 'ahead' = more runs than
 *  par for the balls faced, 'behind' = fewer. Compares runs with par, so one run off one ball against a
 *  rate of 6 is level, not a shortfall. Null when there is no rate to compare with or he faced no ball. */
export function vsBattingRate(over: BattingOver, ctx: OverContext | undefined, basis: 'rrr' | 'crr'): BatVerdict | null {
  const par = parRuns(over, ctx, basis)
  if (par == null) return null
  const d = over.runs - par
  return d > 1e-9 ? 'ahead' : d < -1e-9 ? 'behind' : 'level'
}

// ── Over insights ──────────────────────────────────────────────────────────

const isBoundary = (b: BallRow): 'four' | 'six' | null => {
  const o = b.outcome
  if (o == null) return b.runs_bat === 4 ? 'four' : b.runs_bat === 6 ? 'six' : null
  if (/\bsix\b/i.test(o)) return 'six'
  if (/\bfour\b/i.test(o)) return 'four'
  return null
}

const plural = (n: number, w: string) => `${n} ${w}${n === 1 ? '' : 's'}`

/** Plain-language pointers for one over of an innings (either side): wickets, boundaries, a new bowler
 *  coming on, a maiden or run of dots, extras, a big over and batters reaching 50 / 100. Rule-based and
 *  only from the balls given, so it never claims more than the commentary shows. Pure. */
export function overInsights(inningsBalls: BallRow[], over: number): string[] {
  const inOver = inningsBalls.filter(b => b.over_no === over).sort((a, c) => a.seq - c.seq)
  if (inOver.length === 0) return []
  const innings = [...inningsBalls].sort((a, c) => a.seq - c.seq)
  const before = innings.filter(b => b.over_no < over)
  const out: string[] = []

  // wickets
  const wk = inOver.filter(b => b.is_wicket)
  const runsInOver = inOver.reduce((s, b) => s + b.runs_total, 0)
  if (wk.length > 0) {
    const upTo = (b: BallRow, name: string) => innings.filter(x => x.seq <= b.seq && sameName(x.batter, name))
    const list = wk.map(b => {
      const name = b.dismissed_batter ?? b.batter
      const faced = upTo(b, name)
      const r = faced.reduce((n, x) => n + x.runs_bat, 0), f = faced.filter(ballsFaced).length
      return `${name} ${howOut(name, b.dismissal_text, b.dismissal_kind)} (${r} off ${f})${r === 0 && f === 1 ? ', a golden duck' : r === 0 && f > 1 ? ', a duck' : ''}`
    })
    const label = wk.length >= 3 ? 'Collapse' : wk.length === 2 ? 'Double strike' : 'Wicket'
    out.push(`${label}${runsInOver === 0 ? ' (a wicket maiden)' : ''}: ${list.join('; ')}.`)
    if (before.some(b => b.over_no === over - 1 && b.is_wicket)) out.push('A wicket in the previous over too.')
  }

  // boundaries
  const bounds = inOver.map(isBoundary).filter(Boolean) as ('four' | 'six')[]
  const fours = bounds.filter(x => x === 'four').length, sixes = bounds.length - fours
  if (bounds.length >= 2) {
    const bRuns = fours * 4 + sixes * 6
    out.push(`${bounds.length} boundaries (${[fours ? plural(fours, 'four') : '', sixes ? plural(sixes, 'six') : ''].filter(Boolean).join(', ')}): ${bRuns} of the over's ${runsInOver} runs.`)
  } else if (sixes === 1) {
    const s = inOver.find(b => isBoundary(b) === 'six')!
    out.push(`A six by ${s.batter}.`)
  }

  // bowling change
  const bowlers = Array.from(new Set(inOver.map(b => b.bowler.trim())))
  if (over > 2) {
    for (const bw of bowlers) {
      const prev = before.filter(b => b.bowler.trim().toLowerCase() === bw.toLowerCase())
      if (prev.length === 0) out.push(`${bw} comes into the attack.`)
      else {
        const lastOver = Math.max(...prev.map(b => b.over_no))
        if (over - lastOver >= 4) out.push(`${bw} is back after a break of ${over - lastOver - 1} overs.`)
      }
    }
  }
  if (bowlers.length > 1) out.push(`The over was shared between ${bowlers.join(' and ')}.`)

  // maiden, dots, extras, big over
  const legal = inOver.filter(b => b.is_legal)
  const charged = inOver.reduce((s, b) => s + bowlerRuns(b), 0)
  if (legal.length >= 6 && charged === 0 && wk.length === 0) out.push('Maiden over.')
  else {
    const dots = legal.filter(b => b.runs_total === 0).length
    if (dots >= 4) out.push(`${dots} dot balls out of ${legal.length}.`)
  }
  const wides = inOver.filter(b => b.extra_type === 'wide').length, noBalls = inOver.filter(b => b.extra_type === 'noball').length
  if (wides + noBalls >= 2) out.push(`${plural(wides + noBalls, 'extra ball')} (${[wides ? plural(wides, 'wide') : '', noBalls ? plural(noBalls, 'no-ball') : ''].filter(Boolean).join(', ')}).`)
  if (runsInOver >= 12) out.push(`Expensive over: ${runsInOver} runs.`)

  // batting milestones reached in this over
  const names = Array.from(new Set(inOver.map(b => b.batter.trim())))
  for (const n of names) {
    const was = before.filter(b => sameName(b.batter, n)).reduce((s, b) => s + b.runs_bat, 0)
    const now = was + inOver.filter(b => sameName(b.batter, n)).reduce((s, b) => s + b.runs_bat, 0)
    for (const m of [100, 50]) if (was < m && now >= m) { out.push(`${n} reaches ${m === 100 ? 'a hundred' : 'fifty'} (${now}).`); break }
  }
  // a partnership broken, and the new batter coming in
  const running = (upTo: BallRow) => innings.filter(x => x.seq <= upTo.seq)
  for (const w of wk) {
    const prior = running(w)
    const lastW = prior.slice(0, -1).reverse().find(x => x.is_wicket)
    const stand = prior.filter(x => !lastW || x.seq > lastW.seq)
    const sRuns = stand.reduce((n, x) => n + x.runs_total, 0), sBalls = stand.filter(x => x.is_legal).length
    if (sRuns >= 20) out.push(`Ended a ${sRuns}-run stand (${sBalls} balls).`)
    const wNo = prior.filter(x => x.is_wicket).length
    if (wNo === 10) out.push('The last wicket: the innings is over.')
  }
  const seen = new Set(before.map(b => b.batter.trim().toLowerCase()))
  const firstBalls = inOver.filter(b => b.batter && !seen.has(b.batter.trim().toLowerCase()))
  if (over > 1) {
    for (const nb of firstBalls.filter((b, i, a) => a.findIndex(x => sameName(x.batter, b.batter)) === i)) {
      const prior = innings.filter(x => x.seq < nb.seq)
      out.push(`${nb.batter} comes in at ${prior.reduce((n, x) => n + x.runs_total, 0)}/${prior.filter(x => x.is_wicket).length}.`)
    }
  }

  // wicket on the first or last ball of the over
  if (wk.length === 1 && legal.length >= 6) {
    const idx = legal.findIndex(b => b.is_wicket)
    if (idx === 0) out.push('A wicket off the first ball of the over.')
    else if (idx === legal.length - 1 && legal[legal.length - 1].is_wicket) out.push('A wicket off the last ball of the over.')
  }

  // dots in a row
  let streak = 0, best = 0
  for (const b of inOver) { if (b.is_legal && b.runs_total === 0) { streak++; best = Math.max(best, streak) } else if (b.is_legal) streak = 0 }
  if (best >= 4 && !out.some(t => t.includes('dot balls out of') || t === 'Maiden over.')) out.push(`${best} dot balls in a row.`)

  // boundary drought ending
  const bOvers = Array.from(new Set(before.filter(x => isBoundary(x)).map(x => x.over_no)))
  if (bounds.length >= 1 && over > 5) {
    const lastB = bOvers.length ? Math.max(...bOvers) : 0
    if (over - lastB >= 5) out.push(lastB === 0 ? 'The first boundary of the innings.' : `The first boundary since over ${lastB}.`)
  }

  // one batter took most of the over
  const byBat = new Map<string, number>()
  for (const b of inOver) byBat.set(b.batter.trim(), (byBat.get(b.batter.trim()) ?? 0) + b.runs_bat)
  const top = Array.from(byBat.entries()).sort((a, c) => c[1] - a[1])[0]
  if (top && byBat.size > 1 && runsInOver >= 8 && top[1] / runsInOver >= 0.8) out.push(`${top[0]} scored ${top[1]} of the ${runsInOver} runs.`)

  // the bowler's figures after the over (one bowler)
  if (bowlers.length === 1) {
    const mine = innings.filter(b => b.over_no <= over && sameName(b.bowler, bowlers[0]))
    const legalMine = mine.filter(b => b.is_legal).length
    const ov = `${Math.floor(legalMine / 6)}${legalMine % 6 ? `.${legalMine % 6}` : ''}`
    const w = mine.filter(isBowlerWicket).length
    const nth = new Set(mine.map(b => b.over_no)).size
    if (nth >= 2) out.push(`${bowlers[0]}: ${ov}-${mine.reduce((n, b) => n + bowlerRuns(b), 0)}-${w} after ${nth} overs.`)
  }

  // pace against the innings so far, and the biggest / smallest over of the innings
  const oversDone = new Set(before.map(b => b.over_no)).size
  if (oversDone >= 3) {
    const rr = before.reduce((n, b) => n + b.runs_total, 0) / oversDone
    if (runsInOver - rr >= 5) out.push(`${runsInOver} runs against a run rate of ${rr.toFixed(1)} so far: a big lift.`)
    else if (rr - runsInOver >= 5 && wk.length === 0) out.push(`Only ${runsInOver} runs against a run rate of ${rr.toFixed(1)} so far: the pressure builds.`)
  }
  const perOver = new Map<number, number>()
  for (const b of innings) perOver.set(b.over_no, (perOver.get(b.over_no) ?? 0) + b.runs_total)
  if (perOver.size >= 5 && perOver.size === Math.max(...Array.from(perOver.keys())) && !out.some(t => t.startsWith('Expensive over'))) {
    const vals = Array.from(perOver.values())
    if (runsInOver === Math.max(...vals) && vals.filter(v => v === runsInOver).length === 1 && runsInOver >= 8) out.push(`The biggest over of the innings (${runsInOver}).`)
  }

  // who is at the crease after the over
  const facing = Array.from(new Set(inOver.map(b => b.batter.trim())))
  if (facing.length > 0 && facing.length <= 3) {
    const lines = facing.filter(n => !wk.some(w => sameName(w.dismissed_batter ?? w.batter, n))).map(n => {
      const mine = innings.filter(b => b.over_no <= over && sameName(b.batter, n))
      return `${n} ${mine.reduce((a, b) => a + b.runs_bat, 0)} (${mine.filter(ballsFaced).length})`
    })
    if (lines.length > 0) out.push(`Batting after the over: ${lines.join(', ')}.`)
  }
  return out
}

