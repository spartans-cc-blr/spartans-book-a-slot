// Who drives each phase — compares every Spartans player's batting and bowling in
// the Powerplay / Middle / Death with the REST of the team in the same phase, so a
// captain can see who is above, on par or below and pick batters and bowlers for
// the right part of the innings. Pure (no I/O, no React, client-safe), unit-tested
// in phaseContribution.test.ts. See features/match-planning.md §16.
//
// Honest about noise: a player has a few dozen balls per phase at best, so a gap is
// only called above/below when it is bigger than about one standard error. Small
// samples are labelled rather than ranked.
//
// Perspective follows ballByBall.ts: 'spartans' = Spartans batting,
// 'opponent' = Spartans bowling.

import {
  type PhaseKey, PHASE_KEYS, ballsForSide, oversForFormat, phaseOf, ballsFaced, bowlerRuns,
  isDotForBowler, isDotForBatters, isBowlerWicket, summariseBatters,
} from './ballByBall'
import type { ScoutMatchInput } from './matchPlanning'

export type Verdict = 'above' | 'par' | 'below' | 'small'

/** Balls in a phase before a player is compared with the rest of the team at all. */
export const MIN_CONTRIB_BALLS = 12
/** Rest-of-team balls needed for the comparison to mean anything. */
const MIN_REST_BALLS = 24
/** A gap beyond this many standard errors counts as real. */
const Z_CUT = 1

interface Acc {
  /** balls faced (bat) or legal balls bowled (bowl), the denominator of the rate */
  balls: number
  /** deliveries (bowling counts wides and no-balls here) */
  deliveries: number
  runs: number
  sumSq: number
  dots: number
  /** legal balls, the denominator of dot% */
  legal: number
  /** dismissals (bat) or bowler wickets (bowl) */
  events: number
}
const emptyAcc = (): Acc => ({ balls: 0, deliveries: 0, runs: 0, sumSq: 0, dots: 0, legal: 0, events: 0 })
type PhaseAcc = Record<PhaseKey, Acc>
const emptyPhaseAcc = (): PhaseAcc => ({ pp: emptyAcc(), mid: emptyAcc(), death: emptyAcc() })

export interface ContribCell {
  balls: number
  runs: number
  rpo: number | null
  dotPct: number | null
  /** runs an over, minus the rest of the team's (null when there is no comparison) */
  rpoDelta: number | null
  /** dot%, minus the rest of the team's, in points */
  dotDelta: number | null
  /** standardised gap on the outcome, positive = good for us (higher RPO batting, lower economy bowling) */
  z: number | null
  verdict: Verdict
  /** was the dot-ball gap itself beyond noise, and in whose favour */
  dotFlag: 'good' | 'bad' | null
  /** dismissals (batting) or wickets (bowling) in the phase */
  events: number
}

export interface ContribRow {
  playerId: string
  name: string
  available: boolean
  /** the batting position used most (batting only) */
  usualPosition: number | null
  byPhase: Record<PhaseKey, ContribCell | null>
}

export interface PhaseBaseline { balls: number; rpo: number | null; dotPct: number | null; events: number }

export interface ContribPick { playerId: string; name: string; rpoDelta: number; balls: number; z: number }

export interface PhaseContribution {
  baseline: Record<PhaseKey, PhaseBaseline>
  rows: ContribRow[]
  /** per phase: players clearly above par (best first) and clearly below (worst first); available players only */
  best: Record<PhaseKey, ContribPick[]>
  weak: Record<PhaseKey, ContribPick[]>
}

export interface PhaseContributions { batting: PhaseContribution; bowling: PhaseContribution }

const rate = (runs: number, balls: number) => (balls > 0 ? (runs / balls) * 6 : null)
const pctOf = (n: number, d: number) => (d > 0 ? (n / d) * 100 : null)

function add(into: Acc, from: Acc) {
  into.balls += from.balls; into.deliveries += from.deliveries; into.runs += from.runs
  into.sumSq += from.sumSq; into.dots += from.dots; into.legal += from.legal; into.events += from.events
}
function minus(a: Acc, b: Acc): Acc {
  return {
    balls: a.balls - b.balls, deliveries: a.deliveries - b.deliveries, runs: a.runs - b.runs,
    sumSq: a.sumSq - b.sumSq, dots: a.dots - b.dots, legal: a.legal - b.legal, events: a.events - b.events,
  }
}

/** Compare one player's phase with the rest of the team. `team` is the whole team's tally (player included). */
export function compareCell(player: Acc, team: Acc, goodIsHigh: boolean): ContribCell {
  const rest = minus(team, player)
  const rpo = rate(player.runs, player.balls)
  const dotPct = pctOf(player.dots, player.legal)
  const base: ContribCell = {
    balls: player.balls, runs: player.runs, rpo, dotPct, rpoDelta: null, dotDelta: null, z: null,
    verdict: 'small', dotFlag: null, events: player.events,
  }
  if (player.balls < MIN_CONTRIB_BALLS || rest.balls < MIN_REST_BALLS || rpo == null) return base

  const restRpo = rate(rest.runs, rest.balls)!
  // Per-delivery spread of runs, taken from the whole team in the phase (the steadiest estimate we have).
  const n = Math.max(team.deliveries, 1)
  const mean = team.runs / n
  const variance = Math.max(team.sumSq / n - mean * mean, 0)
  const sd = Math.sqrt(variance)
  const se = 6 * sd * Math.sqrt(1 / player.balls + 1 / rest.balls)
  const rpoDelta = rpo - restRpo
  const raw = se > 0 ? rpoDelta / se : 0
  const z = goodIsHigh ? raw : -raw
  base.rpoDelta = rpoDelta
  base.z = z
  base.verdict = z >= Z_CUT ? 'above' : z <= -Z_CUT ? 'below' : 'par'

  const restDot = pctOf(rest.dots, rest.legal)
  if (dotPct != null && restDot != null && player.legal > 0 && rest.legal > 0) {
    base.dotDelta = dotPct - restDot
    // Pooled proportion: stays defined even when the rest of the team has no dots (or all dots).
    const p = Math.min(Math.max(team.dots / team.legal, 0.02), 0.98)
    const dse = Math.sqrt(p * (1 - p) * (1 / player.legal + 1 / rest.legal)) * 100
    const dz = dse > 0 ? base.dotDelta / dse : 0
    // Batting wants fewer dots, bowling wants more.
    const good = goodIsHigh ? -dz : dz
    base.dotFlag = good >= Z_CUT ? 'good' : good <= -Z_CUT ? 'bad' : null
  }
  return base
}

function baselineOf(t: PhaseAcc): Record<PhaseKey, PhaseBaseline> {
  const out = {} as Record<PhaseKey, PhaseBaseline>
  for (const p of PHASE_KEYS) {
    out[p] = { balls: t[p].balls, rpo: rate(t[p].runs, t[p].balls), dotPct: pctOf(t[p].dots, t[p].legal), events: t[p].events }
  }
  return out
}

function finish(
  team: PhaseAcc, per: Map<string, PhaseAcc>, names: Map<string, string>, available: Set<string>,
  goodIsHigh: boolean, usual: Map<string, number | null>,
): PhaseContribution {
  const rows: ContribRow[] = []
  for (const [id, acc] of Array.from(per.entries())) {
    const byPhase = {} as Record<PhaseKey, ContribCell | null>
    let any = false
    for (const p of PHASE_KEYS) {
      if (acc[p].balls === 0) { byPhase[p] = null; continue }
      any = true
      byPhase[p] = compareCell(acc[p], team[p], goodIsHigh)
    }
    if (!any) continue
    rows.push({ playerId: id, name: names.get(id) ?? id, available: available.has(id), usualPosition: usual.get(id) ?? null, byPhase })
  }
  rows.sort((a, b) => a.name.localeCompare(b.name))

  const best = {} as Record<PhaseKey, ContribPick[]>
  const weak = {} as Record<PhaseKey, ContribPick[]>
  for (const p of PHASE_KEYS) {
    const picks = rows
      .filter(r => r.available && r.byPhase[p] && (r.byPhase[p] as ContribCell).z != null)
      .map(r => { const c = r.byPhase[p] as ContribCell; return { r, c } })
    best[p] = picks.filter(x => x.c.verdict === 'above').sort((a, b) => b.c.z! - a.c.z!).slice(0, 3)
      .map(x => ({ playerId: x.r.playerId, name: x.r.name, rpoDelta: x.c.rpoDelta!, balls: x.c.balls, z: x.c.z! }))
    weak[p] = picks.filter(x => x.c.verdict === 'below').sort((a, b) => a.c.z! - b.c.z!).slice(0, 3)
      .map(x => ({ playerId: x.r.playerId, name: x.r.name, rpoDelta: x.c.rpoDelta!, balls: x.c.balls, z: x.c.z! }))
  }
  return { baseline: baselineOf(team), rows, best, weak }
}

const accFor = (m: Map<string, PhaseAcc>, id: string) => {
  let a = m.get(id)
  if (!a) { a = emptyPhaseAcc(); m.set(id, a) }
  return a
}

/** Build batting and bowling phase contributions over every match in view.
 *  `available` are the players who said Y/O/E; everyone else with a Hub id is still computed so the page can show them. */
export function phaseContributions(
  matches: ScoutMatchInput[],
  available: { id: string; name: string }[],
): PhaseContributions {
  const names = new Map(available.map(a => [a.id, a.name]))
  const avail = new Set(available.map(a => a.id))

  const batTeam = emptyPhaseAcc()
  const bowlTeam = emptyPhaseAcc()
  const batPer = new Map<string, PhaseAcc>()
  const bowlPer = new Map<string, PhaseAcc>()
  const posCount = new Map<string, Map<number, number>>()

  for (const m of matches) {
    const total = oversForFormat(m.format, m.balls)
    const ours = ballsForSide(m.balls, 'spartans')
    const theirs = ballsForSide(m.balls, 'opponent')

    for (const b of ours) {
      const ph = phaseOf(b.over_no, total)
      const id = b.batter_player_id
      if (id && !names.has(id)) names.set(id, b.batter)
      const targets = [batTeam[ph], ...(id ? [accFor(batPer, id)[ph]] : [])]
      if (ballsFaced(b)) {
        for (const a of targets) {
          a.balls += 1; a.deliveries += 1; a.runs += b.runs_bat; a.sumSq += b.runs_bat * b.runs_bat
          if (b.is_legal) a.legal += 1
          if (isDotForBatters(b)) a.dots += 1
        }
      }
      if (b.is_wicket && !/retire/i.test(b.dismissal_kind ?? '')) {
        const outId = b.dismissed_batter ? b.dismissed_player_id : b.batter_player_id
        batTeam[ph].events += 1
        if (outId) accFor(batPer, outId)[ph].events += 1
      }
    }

    // Batting position = order of first appearance at the crease, as everywhere else on this page.
    summariseBatters(ours, total).forEach((l, i) => {
      if (!l.playerId) return
      const c = posCount.get(l.playerId) ?? new Map<number, number>()
      c.set(i + 1, (c.get(i + 1) ?? 0) + 1)
      posCount.set(l.playerId, c)
    })

    for (const b of theirs) {
      const ph = phaseOf(b.over_no, total)
      const id = b.bowler_player_id
      if (id && !names.has(id)) names.set(id, b.bowler)
      const charged = bowlerRuns(b)
      const targets = [bowlTeam[ph], ...(id ? [accFor(bowlPer, id)[ph]] : [])]
      for (const a of targets) {
        a.deliveries += 1; a.runs += charged; a.sumSq += charged * charged
        if (b.is_legal) { a.balls += 1; a.legal += 1 }
        if (isDotForBowler(b)) a.dots += 1
        if (isBowlerWicket(b)) a.events += 1
      }
    }
  }

  const usual = new Map<string, number | null>()
  for (const [id, c] of Array.from(posCount.entries())) {
    const top = Array.from(c.entries()).sort((a, b) => b[1] - a[1] || a[0] - b[0])[0]
    usual.set(id, top ? top[0] : null)
  }

  return {
    batting: finish(batTeam, batPer, names, avail, true, usual),
    bowling: finish(bowlTeam, bowlPer, names, avail, false, new Map()),
  }
}
