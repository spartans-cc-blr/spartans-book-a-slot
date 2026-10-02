// Opponent scouting — pure aggregation over the ball-by-ball rows of every
// past meeting with one opponent. No I/O and no React (client-safe), so it is
// unit-tested in opponentScouting.test.ts. The fetch lives in
// opponentScoutingData.ts. See features/opponent-scouting.md.
//
// Perspective: `side` follows ballByBall.ts —
//   'spartans' = Spartans batting, 'opponent' = Spartans bowling.
//
// The "insights" are deterministic rules over the numbers (thresholds below),
// not a model's opinion: every line quotes the figures it came from so a
// captain can check it, and a small sample is called out rather than hidden.

import {
  type BallRow, type PhaseKey, PHASE_KEYS, PHASE_LABEL,
  ballsForSide, oversForFormat, phaseSplit, summariseBatters, summariseBowlers,
  strikeRate, economy, howOut,
} from './ballByBall'

// ── Inputs / outputs ───────────────────────────────────────────────────────

export interface ScoutMatchInput {
  bookingId: string
  matchId: string
  gameDate: string
  format: string | null
  result: 'won' | 'lost' | 'tied' | 'nr' | null
  teamTotal: number | null
  teamWickets: number | null
  oppTotal: number | null
  oppWickets: number | null
  balls: BallRow[]
}

export interface PhaseTally { runs: number; balls: number; wickets: number; dots: number }
export type PhaseTallies = Record<PhaseKey, PhaseTally>

export type DismissalGroup = 'bowled' | 'lbw' | 'caught' | 'run out' | 'stumped' | 'other'

export function dismissalGroup(kind: string | null): DismissalGroup {
  const k = (kind ?? '').toLowerCase()
  if (/run\s*out/.test(k)) return 'run out'
  if (/stump/.test(k)) return 'stumped'
  if (/lbw|leg before/.test(k)) return 'lbw'
  if (/bowled/.test(k) && !/caught/.test(k)) return 'bowled'
  if (/caught|c\s*&\s*b/.test(k)) return 'caught'
  return 'other'
}

export interface MatchDigest {
  bookingId: string
  gameDate: string
  format: string | null
  result: ScoutMatchInput['result']
  scoreLine: string
  totalOvers: number
  /** Spartans batting by phase */
  batting: PhaseTallies
  /** Spartans bowling by phase */
  bowling: PhaseTallies
  /** best Spartans batter and best opponent batter, for the one-line headline */
  topBat: { name: string; runs: number; balls: number } | null
  topOppBat: { name: string; runs: number; balls: number } | null
}

export interface OppThreat {
  name: string
  innings: number
  runs: number
  balls: number
  dismissals: number
  strikeRate: number | null
  /** our bowlers who got them out, most recent first */
  dismissedBy: string[]
}

export interface BatEntry {
  bookingId: string
  gameDate: string
  position: number
  runs: number
  balls: number
  out: string | null           // "c X b Y" or null when not out
  group: DismissalGroup | null
  bowler: string | null
}

export interface BowlEntry {
  bookingId: string
  gameDate: string
  legalBalls: number
  runs: number
  wickets: number
  byPhase: Record<PhaseKey, { legalBalls: number; runs: number; wickets: number }>
}

export interface PositionUse { position: number; innings: number; runs: number; balls: number }

export interface PlayerScout {
  playerId: string
  name: string
  batting: {
    innings: number; runs: number; balls: number; dismissals: number; dots: number
    strikeRate: number | null; average: number | null
    byPhase: Record<PhaseKey, { runs: number; balls: number }>
    positions: PositionUse[]
    log: BatEntry[]
  } | null
  bowling: {
    spells: number; legalBalls: number; runs: number; wickets: number; economy: number | null
    byPhase: Record<PhaseKey, { legalBalls: number; runs: number; wickets: number }>
    log: BowlEntry[]
  } | null
  insights: string[]
}

export interface TeamScout {
  matches: MatchDigest[]
  batting: PhaseTallies
  bowling: PhaseTallies
  wicketsLost: Record<DismissalGroup, number>
  wicketsTaken: Record<DismissalGroup, number>
  threats: OppThreat[]
  /** opponent bowlers who took our wickets, most first */
  oppBowlersWhoGotUs: { name: string; wickets: number }[]
  insights: string[]
}

// ── Small helpers ──────────────────────────────────────────────────────────

const keyOf = (s: string) => s.trim().toLowerCase()
const emptyTally = (): PhaseTally => ({ runs: 0, balls: 0, wickets: 0, dots: 0 })
const emptyTallies = (): PhaseTallies => ({ pp: emptyTally(), mid: emptyTally(), death: emptyTally() })
const emptyGroups = (): Record<DismissalGroup, number> =>
  ({ bowled: 0, lbw: 0, caught: 0, 'run out': 0, stumped: 0, other: 0 })

export const rpo = (runs: number, balls: number): number | null => economy(runs, balls)
const pct = (n: number, d: number) => (d > 0 ? Math.round((n / d) * 100) : 0)
const f1 = (n: number | null) => (n == null ? '—' : n.toFixed(1))

function addTallies(into: PhaseTallies, lines: ReturnType<typeof phaseSplit>) {
  for (const l of lines) {
    into[l.phase].runs += l.runs
    into[l.phase].balls += l.legalBalls
    into[l.phase].wickets += l.wickets
    into[l.phase].dots += l.dots
  }
}

function bowlerOfHowOut(text: string): string | null {
  const m = /\bb\s+([^()]+?)\s*$/.exec(text)
  return m ? m[1].trim() : null
}

const matchesLabel = (n: number) => `${n} ${n === 1 ? 'match' : 'matches'}`

// ── Team view ──────────────────────────────────────────────────────────────

export function scoutTeam(matches: ScoutMatchInput[]): TeamScout {
  const digests: MatchDigest[] = []
  const batting = emptyTallies()
  const bowling = emptyTallies()
  const wicketsLost = emptyGroups()
  const wicketsTaken = emptyGroups()
  const threatMap = new Map<string, OppThreat>()
  const oppBowlers = new Map<string, { name: string; wickets: number }>()

  const ordered = [...matches].sort((a, b) => b.gameDate.localeCompare(a.gameDate)) // newest first

  for (const m of ordered) {
    const total = oversForFormat(m.format, m.balls)
    const ours = ballsForSide(m.balls, 'spartans')
    const theirs = ballsForSide(m.balls, 'opponent')

    const mBat = emptyTallies()
    const mBowl = emptyTallies()
    addTallies(mBat, phaseSplit(ours, total, 'bat'))
    addTallies(mBowl, phaseSplit(theirs, total, 'bowl'))
    for (const p of PHASE_KEYS) {
      for (const k of ['runs', 'balls', 'wickets', 'dots'] as const) {
        batting[p][k] += mBat[p][k]
        bowling[p][k] += mBowl[p][k]
      }
    }

    for (const b of ours) {
      if (!b.is_wicket) continue
      wicketsLost[dismissalGroup(b.dismissal_kind)] += 1
      if (!/run\s*out|retire/i.test(b.dismissal_kind ?? '') && b.bowler) {
        const k = keyOf(b.bowler)
        const cur = oppBowlers.get(k) ?? { name: b.bowler, wickets: 0 }
        cur.wickets += 1
        oppBowlers.set(k, cur)
      }
    }
    for (const b of theirs) if (b.is_wicket) wicketsTaken[dismissalGroup(b.dismissal_kind)] += 1

    const ourBat = summariseBatters(ours, total)
    const theirBat = summariseBatters(theirs, total)
    const best = (ls: typeof ourBat) =>
      ls.length ? [...ls].sort((a, b) => b.runs - a.runs || a.balls - b.balls)[0] : null
    const tb = best(ourBat)
    const ob = best(theirBat)

    for (const l of theirBat) {
      const k = keyOf(l.name)
      const t = threatMap.get(k) ?? { name: l.name, innings: 0, runs: 0, balls: 0, dismissals: 0, strikeRate: null, dismissedBy: [] }
      t.innings += 1
      t.runs += l.runs
      t.balls += l.balls
      if (l.out) {
        t.dismissals += 1
        const by = bowlerOfHowOut(howOut(l.name, l.out.text, l.out.kind))
        if (by) t.dismissedBy.push(by)
      }
      threatMap.set(k, t)
    }

    digests.push({
      bookingId: m.bookingId, gameDate: m.gameDate, format: m.format, result: m.result,
      scoreLine: `${m.teamTotal ?? '?'}/${m.teamWickets ?? '?'} v ${m.oppTotal ?? '?'}/${m.oppWickets ?? '?'}`,
      totalOvers: total, batting: mBat, bowling: mBowl,
      topBat: tb ? { name: tb.name, runs: tb.runs, balls: tb.balls } : null,
      topOppBat: ob ? { name: ob.name, runs: ob.runs, balls: ob.balls } : null,
    })
  }

  const threats = Array.from(threatMap.values())
    .map(t => ({ ...t, strikeRate: strikeRate(t.runs, t.balls) }))
    .sort((a, b) => b.runs - a.runs || a.balls - b.balls)
    .slice(0, 5)

  const team: TeamScout = {
    matches: digests, batting, bowling, wicketsLost, wicketsTaken, threats,
    oppBowlersWhoGotUs: Array.from(oppBowlers.values()).sort((a, b) => b.wickets - a.wickets).slice(0, 4),
    insights: [],
  }
  team.insights = teamInsights(team)
  return team
}

const sumTallies = (t: PhaseTallies): PhaseTally => ({
  runs: PHASE_KEYS.reduce((s, p) => s + t[p].runs, 0),
  balls: PHASE_KEYS.reduce((s, p) => s + t[p].balls, 0),
  wickets: PHASE_KEYS.reduce((s, p) => s + t[p].wickets, 0),
  dots: PHASE_KEYS.reduce((s, p) => s + t[p].dots, 0),
})

/** Minimum balls in a phase before we compare it to the rest of the innings. */
const MIN_PHASE_BALLS = 30

export function teamInsights(t: TeamScout): string[] {
  const out: string[] = []
  const n = t.matches.length
  if (n === 0) return out
  if (n === 1) out.push('Only one match with ball-by-ball data against this side, so treat these as hints, not trends.')

  // Our batting: the phase that lags our own overall run rate the most.
  const bTot = sumTallies(t.batting)
  const bAll = rpo(bTot.runs, bTot.balls)
  if (bAll != null) {
    const rated = PHASE_KEYS
      .filter(p => t.batting[p].balls >= MIN_PHASE_BALLS)
      .map(p => ({ p, rr: rpo(t.batting[p].runs, t.batting[p].balls)!, w: t.batting[p].wickets }))
    const slow = [...rated].sort((a, b) => a.rr - b.rr)[0]
    if (slow && slow.rr < bAll - 1) {
      out.push(`Batting: ${PHASE_LABEL[slow.p]} was our slowest phase — ${f1(slow.rr)} an over against ${f1(bAll)} overall.`)
    }
    const lossPhase = PHASE_KEYS.map(p => ({ p, w: t.batting[p].wickets })).sort((a, b) => b.w - a.w)[0]
    if (bTot.wickets >= 6 && pct(lossPhase.w, bTot.wickets) >= 45) {
      out.push(`Batting: ${lossPhase.w} of our ${bTot.wickets} wickets (${pct(lossPhase.w, bTot.wickets)}%) fell in the ${PHASE_LABEL[lossPhase.p]} — protect that phase.`)
    }
    const dotPct = pct(bTot.dots, bTot.balls)
    if (bTot.balls >= 120 && dotPct >= 45) out.push(`Batting: ${dotPct}% of our balls were dots — rotating the strike more would help.`)
  }

  // Our bowling: the phase that leaked the most relative to our overall economy.
  const wTot = sumTallies(t.bowling)
  const wAll = rpo(wTot.runs, wTot.balls)
  if (wAll != null) {
    const rated = PHASE_KEYS
      .filter(p => t.bowling[p].balls >= MIN_PHASE_BALLS)
      .map(p => ({ p, rr: rpo(t.bowling[p].runs, t.bowling[p].balls)! }))
    const leaky = [...rated].sort((a, b) => b.rr - a.rr)[0]
    if (leaky && leaky.rr > wAll + 1) {
      out.push(`Bowling: they scored fastest in the ${PHASE_LABEL[leaky.p]} — ${f1(leaky.rr)} an over against ${f1(wAll)} overall.`)
    }
    const strong = PHASE_KEYS.map(p => ({ p, w: t.bowling[p].wickets })).sort((a, b) => b.w - a.w)[0]
    if (wTot.wickets >= 6 && pct(strong.w, wTot.wickets) >= 45) {
      out.push(`Bowling: ${pct(strong.w, wTot.wickets)}% of our wickets came in the ${PHASE_LABEL[strong.p]} — that is where we hurt them.`)
    }
  }

  // Repeated ways of getting out.
  const lostTotal = Object.values(t.wicketsLost).reduce((s, v) => s + v, 0)
  const topLost = (Object.entries(t.wicketsLost) as [DismissalGroup, number][]).sort((a, b) => b[1] - a[1])[0]
  if (lostTotal >= 6 && topLost && pct(topLost[1], lostTotal) >= 50 && topLost[0] !== 'other') {
    out.push(`We were ${topLost[0] === 'caught' ? 'caught' : topLost[0]} ${topLost[1]} times out of ${lostTotal} dismissals (${pct(topLost[1], lostTotal)}%).`)
  }
  const repeat = t.oppBowlersWhoGotUs[0]
  if (repeat && repeat.wickets >= 3) out.push(`${repeat.name} took ${repeat.wickets} of our wickets across ${matchesLabel(n)} — plan for them.`)

  const threat = t.threats[0]
  if (threat && threat.runs >= 40) {
    out.push(`Their key batter: ${threat.name} — ${threat.runs} runs off ${threat.balls} (SR ${f1(threat.strikeRate)}) in ${threat.innings} inn${threat.dismissals ? `; got out ${threat.dismissals}×${threat.dismissedBy.length ? ` (${Array.from(new Set(threat.dismissedBy)).join(', ')})` : ''}` : '; never dismissed'}.`)
  }
  return out
}

// ── Player view ────────────────────────────────────────────────────────────

/** Scout only the given Hub players (the ones who said they are available). */
export function scoutPlayers(
  matches: ScoutMatchInput[],
  players: { id: string; name: string }[],
): PlayerScout[] {
  const want = new Map(players.map(p => [p.id, p]))
  const bats = new Map<string, BatEntry[]>()
  const bowls = new Map<string, BowlEntry[]>()
  const batPhase = new Map<string, Record<PhaseKey, { runs: number; balls: number }>>()
  const batDots = new Map<string, number>()

  const ordered = [...matches].sort((a, b) => a.gameDate.localeCompare(b.gameDate)) // oldest first

  for (const m of ordered) {
    const total = oversForFormat(m.format, m.balls)

    // Batting position = order of first appearance at the crease in that innings.
    const batters = summariseBatters(ballsForSide(m.balls, 'spartans'), total)
    batters.forEach((l, i) => {
      if (!l.playerId || !want.has(l.playerId)) return
      const how = l.out ? howOut(l.name, l.out.text, l.out.kind) : null
      const arr = bats.get(l.playerId) ?? []
      arr.push({
        bookingId: m.bookingId, gameDate: m.gameDate, position: i + 1, runs: l.runs, balls: l.balls,
        out: how, group: l.out ? dismissalGroup(l.out.kind) : null, bowler: how ? bowlerOfHowOut(how) : null,
      })
      bats.set(l.playerId, arr)
      const ph = batPhase.get(l.playerId) ?? { pp: { runs: 0, balls: 0 }, mid: { runs: 0, balls: 0 }, death: { runs: 0, balls: 0 } }
      for (const p of PHASE_KEYS) { ph[p].runs += l.byPhase[p].runs; ph[p].balls += l.byPhase[p].balls }
      batPhase.set(l.playerId, ph)
      batDots.set(l.playerId, (batDots.get(l.playerId) ?? 0) + l.dots)
    })

    for (const l of summariseBowlers(ballsForSide(m.balls, 'opponent'), total)) {
      if (!l.playerId || !want.has(l.playerId) || l.legalBalls === 0) continue
      const arr = bowls.get(l.playerId) ?? []
      arr.push({ bookingId: m.bookingId, gameDate: m.gameDate, legalBalls: l.legalBalls, runs: l.runs, wickets: l.wickets, byPhase: l.byPhase })
      bowls.set(l.playerId, arr)
    }
  }

  const out: PlayerScout[] = []
  for (const p of players) {
    const bLog = bats.get(p.id)
    const wLog = bowls.get(p.id)
    if (!bLog && !wLog) continue

    let batting: PlayerScout['batting'] = null
    if (bLog) {
      const runs = bLog.reduce((s, e) => s + e.runs, 0)
      const balls = bLog.reduce((s, e) => s + e.balls, 0)
      const dismissals = bLog.filter(e => e.out).length
      const byPos = new Map<number, PositionUse>()
      for (const e of bLog) {
        const u = byPos.get(e.position) ?? { position: e.position, innings: 0, runs: 0, balls: 0 }
        u.innings += 1; u.runs += e.runs; u.balls += e.balls
        byPos.set(e.position, u)
      }
      batting = {
        innings: bLog.length, runs, balls, dismissals, dots: batDots.get(p.id) ?? 0,
        strikeRate: strikeRate(runs, balls), average: dismissals > 0 ? runs / dismissals : null,
        byPhase: batPhase.get(p.id)!,
        positions: Array.from(byPos.values()).sort((a, b) => a.position - b.position),
        log: [...bLog].reverse(),
      }
    }

    let bowling: PlayerScout['bowling'] = null
    if (wLog) {
      const legalBalls = wLog.reduce((s, e) => s + e.legalBalls, 0)
      const runs = wLog.reduce((s, e) => s + e.runs, 0)
      const byPhase = { pp: { legalBalls: 0, runs: 0, wickets: 0 }, mid: { legalBalls: 0, runs: 0, wickets: 0 }, death: { legalBalls: 0, runs: 0, wickets: 0 } }
      for (const e of wLog) for (const k of PHASE_KEYS) {
        byPhase[k].legalBalls += e.byPhase[k].legalBalls; byPhase[k].runs += e.byPhase[k].runs; byPhase[k].wickets += e.byPhase[k].wickets
      }
      bowling = {
        spells: wLog.length, legalBalls, runs, wickets: wLog.reduce((s, e) => s + e.wickets, 0),
        economy: economy(runs, legalBalls), byPhase, log: [...wLog].reverse(),
      }
    }

    const sc: PlayerScout = { playerId: p.id, name: p.name, batting, bowling, insights: [] }
    sc.insights = playerInsights(sc)
    out.push(sc)
  }
  return out.sort((a, b) =>
    ((b.batting?.runs ?? 0) + (b.bowling?.wickets ?? 0) * 20) - ((a.batting?.runs ?? 0) + (a.bowling?.wickets ?? 0) * 20))
}

/** Balls before a batting/bowling line is more than anecdote. */
const SMALL_BAT_SAMPLE = 20
const SMALL_BOWL_SAMPLE = 24

export function playerInsights(p: PlayerScout): string[] {
  const out: string[] = []
  const b = p.batting
  if (b) {
    if (b.balls < SMALL_BAT_SAMPLE) out.push(`Small batting sample (${b.balls} balls) — not much to go on.`)
    else {
      // strongest / weakest batting phase by strike rate (needs a real sample in the phase)
      const ph = PHASE_KEYS.filter(k => b.byPhase[k].balls >= 10)
        .map(k => ({ k, sr: strikeRate(b.byPhase[k].runs, b.byPhase[k].balls)! }))
        .sort((a, c) => c.sr - a.sr)
      if (ph.length >= 2 && ph[0].sr - ph[ph.length - 1].sr >= 30) {
        out.push(`Scores quickest in the ${PHASE_LABEL[ph[0].k]} (SR ${Math.round(ph[0].sr)}) and slowest in the ${PHASE_LABEL[ph[ph.length - 1].k]} (SR ${Math.round(ph[ph.length - 1].sr)}).`)
      }
      const dotPct = pct(b.dots, b.balls)
      if (dotPct >= 50) out.push(`${dotPct}% of balls faced were dots — look to rotate the strike early.`)
      else if (b.strikeRate != null && b.strikeRate < 85 && b.dismissals > 0) out.push(`Strike rate ${Math.round(b.strikeRate)} — needs to score faster to justify the slot.`)
    }
    // the same bowler getting them more than once, or the same way
    const byBowler = new Map<string, number>()
    for (const e of b.log) if (e.bowler) byBowler.set(e.bowler, (byBowler.get(e.bowler) ?? 0) + 1)
    const nemesis = Array.from(byBowler.entries()).sort((x, y) => y[1] - x[1])[0]
    if (nemesis && nemesis[1] >= 2) out.push(`Dismissed by ${nemesis[0]} ${nemesis[1]} times — have a plan for that bowler.`)
    const byGroup = new Map<DismissalGroup, number>()
    for (const e of b.log) if (e.group) byGroup.set(e.group, (byGroup.get(e.group) ?? 0) + 1)
    const way = Array.from(byGroup.entries()).sort((x, y) => y[1] - x[1])[0]
    if (way && way[1] >= 2 && b.dismissals >= 3 && way[1] / b.dismissals >= 0.6) {
      out.push(`Out ${way[0]} in ${way[1]} of ${b.dismissals} dismissals.`)
    }
    const best = [...b.positions].sort((x, y) => y.runs - x.runs)[0]
    if (b.positions.length > 1 && best && best.innings >= 1 && best.runs > 0) {
      out.push(`Most runs at No. ${best.position} (${best.runs} in ${best.innings} inn).`)
    }
  }

  const w = p.bowling
  if (w) {
    if (w.legalBalls < SMALL_BOWL_SAMPLE) out.push(`Small bowling sample (${w.legalBalls} balls) — not much to go on.`)
    else {
      const ph = PHASE_KEYS.filter(k => w.byPhase[k].legalBalls >= 12)
        .map(k => ({ k, eco: economy(w.byPhase[k].runs, w.byPhase[k].legalBalls)! }))
        .sort((a, c) => a.eco - c.eco)
      if (ph.length >= 2 && ph[ph.length - 1].eco - ph[0].eco >= 2) {
        out.push(`Most economical in the ${PHASE_LABEL[ph[0].k]} (${f1(ph[0].eco)}), most expensive in the ${PHASE_LABEL[ph[ph.length - 1].k]} (${f1(ph[ph.length - 1].eco)}) — use accordingly.`)
      }
      if (w.wickets === 0 && w.economy != null && w.economy > 8) out.push(`Wicketless at ${f1(w.economy)} an over — consider a shorter or different role.`)
    }
  }
  return out
}
