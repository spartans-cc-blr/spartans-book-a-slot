// Pure aggregation over ball_by_ball rows (analytics DB, `ball_by_ball_linked`
// view) for the match tabs: Batting, Bowling, Fielding and Commentary. No I/O
// and no React, so everything here is unit-tested in ballByBall.test.ts.
//
// Terminology: `side` is the batting side of an innings.
//   'spartans' -> Spartans batting   (the "Spartans batting" view)
//   'opponent' -> Spartans bowling   (the "Spartans bowling" view)
//
// Definitions were checked against the CricHeroes scorecard already stored for
// match 26452955 (all 6 bowlers: runs/wickets/dots/4s/6s/wides; all 7 batters:
// runs/balls/4s/6s), so these tabs agree with the Full Scorecard tab:
//   balls faced   = every delivery except a wide (a no-ball counts as faced)
//   bowler runs   = bat runs + wides + no-balls  (byes/leg-byes are not charged)
//   dot (bowler)  = a legal ball with no runs at all
//   bowler wicket = any dismissal except run out / retired / obstructing /
//                   handled the ball / timed out

export type InningsSide = 'spartans' | 'opponent'

export interface BallRow {
  batting_side: InningsSide
  seq: number
  over_no: number
  ball_in_over: number
  is_legal: boolean
  bowler: string
  batter: string
  outcome: string | null
  runs_bat: number
  extras: number
  extra_type: string | null
  runs_total: number
  is_wicket: boolean
  dismissal_kind: string | null
  dismissal_text: string | null
  dismissed_batter: string | null
  fielder: string | null
  shot: string | null
  direction: string | null
  score_after: number | null
  wickets_after: number | null
  // Hub player ids, set only for the Spartans side of each role (view
  // ball_by_ball_linked). Opponent players are display-only by design.
  bowler_player_id: string | null
  batter_player_id: string | null
  dismissed_player_id: string | null
  fielder_player_id: string | null
}

export interface BallByBallPayload {
  available: boolean
  balls: BallRow[]
}

// ── Phases ─────────────────────────────────────────────────────────────────

export type PhaseKey = 'pp' | 'mid' | 'death'
export const PHASE_KEYS: PhaseKey[] = ['pp', 'mid', 'death']
export const PHASE_LABEL: Record<PhaseKey, string> = { pp: 'Powerplay', mid: 'Middle', death: 'Death' }

/** Powerplay is the first 30% of the innings capped at 6 overs (T20/T25/T30: overs 1–6,
 *  T10: 1–3); death is the last 4 overs (the last 2 in a short game). */
export function phaseBounds(totalOvers: number): { ppEnd: number; deathStart: number } {
  const total = Math.max(1, Math.floor(totalOvers))
  const ppEnd = Math.min(6, Math.max(1, Math.ceil(total * 0.3)))
  const deathLen = total >= 15 ? 4 : 2
  const deathStart = Math.max(ppEnd + 1, total - deathLen + 1)
  return { ppEnd, deathStart }
}

export function phaseOf(overNo: number, totalOvers: number): PhaseKey {
  const { ppEnd, deathStart } = phaseBounds(totalOvers)
  if (overNo <= ppEnd) return 'pp'
  if (overNo >= deathStart) return 'death'
  return 'mid'
}

export function phaseRangeLabel(phase: PhaseKey, totalOvers: number): string {
  const { ppEnd, deathStart } = phaseBounds(totalOvers)
  const total = Math.max(1, Math.floor(totalOvers))
  if (phase === 'pp') return `Overs 1–${ppEnd}`
  if (phase === 'mid') return deathStart - 1 > ppEnd ? `Overs ${ppEnd + 1}–${deathStart - 1}` : '—'
  return deathStart <= total ? `Overs ${deathStart}–${total}` : '—'
}

/** Total overs for a booking format ("T20" -> 20). Falls back to the longest over seen. */
export function oversForFormat(format: string | null | undefined, balls: BallRow[]): number {
  const m = /^T(\d+)$/i.exec(format ?? '')
  if (m) return Number(m[1])
  return balls.reduce((max, b) => Math.max(max, b.over_no), 0) || 20
}

// ── Small helpers ──────────────────────────────────────────────────────────

export function formatOvers(legalBalls: number): string {
  return `${Math.floor(legalBalls / 6)}.${legalBalls % 6}`
}

export const ballsFaced = (b: BallRow) => b.extra_type !== 'wide'
export const bowlerRuns = (b: BallRow) =>
  b.runs_bat + (b.extra_type === 'wide' || b.extra_type === 'noball' ? b.extras : 0)
export const isDotForBowler = (b: BallRow) => b.is_legal && b.runs_total === 0

export function isBowlerWicket(b: BallRow): boolean {
  return b.is_wicket && !/run\s*out|retire|obstruct|handled|timed/i.test(b.dismissal_kind ?? '')
}

function rate(num: number, den: number, per = 1): number | null {
  return den > 0 ? (num / den) * per : null
}

export const strikeRate = (runs: number, balls: number) => rate(runs, balls, 100)
export const economy = (runs: number, legalBalls: number) => rate(runs, legalBalls, 6)

// Players are keyed by name within one innings: the same person can arrive on one row with a
// Hub id and on another without (e.g. the striker vs the dismissed-batter column), and keying
// on the id would split them in two. The id is filled in from whichever row has it.
function keyOf(name: string): string {
  return name.trim().toLowerCase()
}

// ── Chips, overs (commentary + bars) ───────────────────────────────────────

export type ChipKind = 'dot' | 'run' | 'four' | 'six' | 'wide' | 'noball' | 'bye' | 'wicket'

export function ballChip(b: BallRow): { label: string; kind: ChipKind } {
  if (b.is_wicket) return { label: 'W', kind: 'wicket' }
  if (b.extra_type === 'wide') return { label: b.extras > 1 ? `${b.extras}wd` : 'wd', kind: 'wide' }
  if (b.extra_type === 'noball') return { label: b.runs_total > 1 ? `${b.runs_total}nb` : 'nb', kind: 'noball' }
  if (b.extra_type === 'bye' || b.extra_type === 'legbye') {
    return { label: `${b.runs_total}${b.extra_type === 'bye' ? 'b' : 'lb'}`, kind: 'bye' }
  }
  if (b.runs_bat === 4) return { label: '4', kind: 'four' }
  if (b.runs_bat === 6) return { label: '6', kind: 'six' }
  return { label: String(b.runs_total), kind: b.runs_total === 0 ? 'dot' : 'run' }
}

export interface OverGroup {
  over_no: number
  bowlers: string[]
  batters: string[]
  runs: number
  wickets: number
  legalBalls: number
  balls: BallRow[]            // chronological
}

/** One group per over, in ascending order. */
export function groupOvers(balls: BallRow[]): OverGroup[] {
  const byOver = new Map<number, BallRow[]>()
  for (const b of [...balls].sort((a, c) => a.seq - c.seq)) {
    const list = byOver.get(b.over_no) ?? []
    list.push(b)
    byOver.set(b.over_no, list)
  }
  return Array.from(byOver.entries())
    .sort((a, c) => a[0] - c[0])
    .map(([over_no, list]) => {
      const uniq = (xs: string[]) => xs.filter((x, i) => xs.indexOf(x) === i)
      return {
        over_no,
        bowlers: uniq(list.map(b => b.bowler)),
        batters: uniq(list.map(b => b.batter)),
        runs: list.reduce((s, b) => s + b.runs_total, 0),
        wickets: list.filter(b => b.is_wicket).length,
        legalBalls: list.filter(b => b.is_legal).length,
        balls: list,
      }
    })
}

// ── Phase split ────────────────────────────────────────────────────────────

export interface PhaseLine {
  phase: PhaseKey
  runs: number
  wickets: number
  legalBalls: number
  dots: number
  runRate: number | null
}

export function phaseSplit(balls: BallRow[], totalOvers: number): PhaseLine[] {
  return PHASE_KEYS.map(phase => {
    const inPhase = balls.filter(b => phaseOf(b.over_no, totalOvers) === phase)
    const legal = inPhase.filter(b => b.is_legal).length
    const runs = inPhase.reduce((s, b) => s + b.runs_total, 0)
    return {
      phase,
      runs,
      wickets: inPhase.filter(b => b.is_wicket).length,
      legalBalls: legal,
      dots: inPhase.filter(isDotForBowler).length,
      runRate: economy(runs, legal),
    }
  })
}

// ── Batting ────────────────────────────────────────────────────────────────

export interface BatterLine {
  name: string
  playerId: string | null
  runs: number
  balls: number
  dots: number
  fours: number
  sixes: number
  strikeRate: number | null
  boundaryRuns: number
  byPhase: Record<PhaseKey, { runs: number; balls: number }>
  out: { kind: string | null; text: string | null } | null
  firstSeq: number
}

const emptyPhases = () => ({
  pp: { runs: 0, balls: 0 }, mid: { runs: 0, balls: 0 }, death: { runs: 0, balls: 0 },
})

/** Batters of one innings (`balls` = the rows of the batting side), in batting order. */
export function summariseBatters(balls: BallRow[], totalOvers: number): BatterLine[] {
  const lines = new Map<string, BatterLine>()
  const line = (name: string, playerId: string | null, seq: number) => {
    const key = keyOf(name)
    let l = lines.get(key)
    if (l && !l.playerId && playerId) l.playerId = playerId
    if (!l) {
      l = { name, playerId, runs: 0, balls: 0, dots: 0, fours: 0, sixes: 0, strikeRate: null,
            boundaryRuns: 0, byPhase: emptyPhases(), out: null, firstSeq: seq }
      lines.set(key, l)
    }
    return l
  }

  for (const b of [...balls].sort((a, c) => a.seq - c.seq)) {
    const l = line(b.batter, b.batter_player_id, b.seq)
    if (ballsFaced(b)) {
      const p = phaseOf(b.over_no, totalOvers)
      l.balls += 1
      l.byPhase[p].balls += 1
      if (b.runs_bat === 0) l.dots += 1
    }
    l.runs += b.runs_bat
    l.byPhase[phaseOf(b.over_no, totalOvers)].runs += b.runs_bat
    if (b.runs_bat === 4) { l.fours += 1; l.boundaryRuns += 4 }
    if (b.runs_bat === 6) { l.sixes += 1; l.boundaryRuns += 6 }
    if (b.is_wicket) {
      const outName = b.dismissed_batter ?? b.batter
      const outId = b.dismissed_batter ? b.dismissed_player_id : b.batter_player_id
      line(outName, outId, b.seq).out = { kind: b.dismissal_kind, text: b.dismissal_text }
    }
  }
  const out = Array.from(lines.values())
  for (const l of out) l.strikeRate = strikeRate(l.runs, l.balls)
  return out.sort((a, c) => a.firstSeq - c.firstSeq)
}

// ── Bowling ────────────────────────────────────────────────────────────────

export interface BowlerLine {
  name: string
  playerId: string | null
  legalBalls: number
  runs: number
  wickets: number
  dots: number
  maidens: number
  fours: number
  sixes: number
  wides: number
  noBalls: number
  economy: number | null
  byPhase: Record<PhaseKey, { legalBalls: number; runs: number; wickets: number }>
  firstSeq: number
}

/** Bowlers of one innings (`balls` = the rows of the batting side being bowled to). */
export function summariseBowlers(balls: BallRow[], totalOvers: number): BowlerLine[] {
  const lines = new Map<string, BowlerLine>()
  const overRuns = new Map<string, Map<number, { runs: number; legal: number }>>() // bowler -> over -> tally
  for (const b of [...balls].sort((a, c) => a.seq - c.seq)) {
    const key = keyOf(b.bowler)
    let l = lines.get(key)
    if (l && !l.playerId && b.bowler_player_id) l.playerId = b.bowler_player_id
    if (!l) {
      l = { name: b.bowler, playerId: b.bowler_player_id, legalBalls: 0, runs: 0, wickets: 0, dots: 0,
            maidens: 0, fours: 0, sixes: 0, wides: 0, noBalls: 0, economy: null, firstSeq: b.seq,
            byPhase: { pp: { legalBalls: 0, runs: 0, wickets: 0 }, mid: { legalBalls: 0, runs: 0, wickets: 0 },
                       death: { legalBalls: 0, runs: 0, wickets: 0 } } }
      lines.set(key, l)
    }
    const charged = bowlerRuns(b)
    const p = phaseOf(b.over_no, totalOvers)
    l.runs += charged
    l.byPhase[p].runs += charged
    if (b.is_legal) { l.legalBalls += 1; l.byPhase[p].legalBalls += 1 }
    if (isDotForBowler(b)) l.dots += 1
    if (b.runs_bat === 4) l.fours += 1
    if (b.runs_bat === 6) l.sixes += 1
    if (b.extra_type === 'wide') l.wides += 1
    if (b.extra_type === 'noball') l.noBalls += 1
    if (isBowlerWicket(b)) { l.wickets += 1; l.byPhase[p].wickets += 1 }

    const perOver = overRuns.get(key) ?? new Map<number, { runs: number; legal: number }>()
    const o = perOver.get(b.over_no) ?? { runs: 0, legal: 0 }
    o.runs += charged
    if (b.is_legal) o.legal += 1
    perOver.set(b.over_no, o)
    overRuns.set(key, perOver)
  }
  for (const [key, perOver] of Array.from(overRuns.entries())) {
    // a maiden is a completed over with nothing charged to the bowler
    for (const o of Array.from(perOver.values())) {
      if (o.legal === 6 && o.runs === 0) lines.get(key)!.maidens += 1
    }
  }
  const out = Array.from(lines.values())
  for (const l of out) l.economy = economy(l.runs, l.legalBalls)
  return out.sort((a, c) => a.firstSeq - c.firstSeq)
}

// ── Fielding ───────────────────────────────────────────────────────────────

export interface FielderLine {
  name: string
  playerId: string | null
  catches: number
  caughtBehind: number
  stumpings: number
  runOuts: number
  total: number
}

export interface WicketRow {
  seq: number
  overLabel: string            // "13.3": over 13, ball 3 (as CricHeroes labels it)
  batter: string
  kind: string | null
  text: string | null
  bowler: string
  bowlerCredited: boolean
  fielder: string | null
  scoreAfter: number | null
  wicketsAfter: number | null
}

/** CricHeroes' own ball label: "<completed overs>.<legal balls>", so the 6th ball of over 3 is "3.0". */
export function ballLabel(b: Pick<BallRow, 'over_no' | 'ball_in_over'>): string {
  return b.ball_in_over === 6 ? `${b.over_no}.0` : `${b.over_no - 1}.${b.ball_in_over}`
}

export function wicketRows(balls: BallRow[]): WicketRow[] {
  return [...balls].sort((a, c) => a.seq - c.seq).filter(b => b.is_wicket).map(b => ({
    seq: b.seq,
    overLabel: ballLabel(b),
    batter: b.dismissed_batter ?? b.batter,
    kind: b.dismissal_kind,
    text: b.dismissal_text,
    bowler: b.bowler,
    bowlerCredited: isBowlerWicket(b),
    fielder: b.fielder ?? fielderFromText(b.dismissal_text, b.bowler),
    scoreAfter: b.score_after,
    wicketsAfter: b.wickets_after,
  }))
}

/** Who took the catch / stumping / run-out, read from the dismissal line when the dedicated
 *  fielder field is empty (a stumping carries no "by <name>" token, so it is only in the line):
 *  "X st †K b B" -> "K", "X c Y b B" -> "Y", "X c & b B" -> "B", "X run out A / B" -> "A / B". */
export function fielderFromText(text: string | null, bowler: string): string | null {
  if (!text) return null
  const t = text.replace(/\s*\(\d+r[^)]*\)\s*$/, '').trim()
  if (/\bc\s*&\s*b\b/i.test(t)) return bowler
  const run = /\brun out\s+(.+)$/i.exec(t)
  if (run) return run[1].trim()
  const m = /\b(?:c|st)\s+†?\s*(.+?)\s+b\s+/i.exec(t)
  return m ? m[1].replace(/^†/, '').trim() : null
}

/** Fielders of one innings (`balls` = the rows of the batting side being fielded against). A
 *  run-out recorded as "A / B" credits both. Only a single, unambiguous name carries a Hub id. */
export function summariseFielders(balls: BallRow[]): FielderLine[] {
  const lines = new Map<string, FielderLine>()
  for (const b of [...balls].sort((a, c) => a.seq - c.seq)) {
    if (!b.is_wicket) continue
    const fielder = b.fielder ?? fielderFromText(b.dismissal_text, b.bowler)
    if (!fielder) continue
    const names = fielder.split('/').map(s => s.trim()).filter(Boolean)
    const kind = (b.dismissal_kind ?? '').toLowerCase()
    for (const name of names) {
      const id = names.length === 1 && b.fielder ? b.fielder_player_id : null
      const key = keyOf(name)
      const l = lines.get(key) ?? { name, playerId: id, catches: 0, caughtBehind: 0, stumpings: 0, runOuts: 0, total: 0 }
      if (!l.playerId && id) l.playerId = id
      if (kind.includes('run')) l.runOuts += 1
      else if (kind.includes('stump')) l.stumpings += 1
      else if (kind.includes('behind')) l.caughtBehind += 1
      else if (kind.includes('caught')) l.catches += 1
      else continue
      l.total += 1
      lines.set(key, l)
    }
  }
  return Array.from(lines.values()).sort((a, c) => c.total - a.total || a.name.localeCompare(c.name))
}

// ── Splitting a payload by view ────────────────────────────────────────────

export function ballsForSide(balls: BallRow[], side: InningsSide): BallRow[] {
  return balls.filter(b => b.batting_side === side)
}

/** "Aashish Kumar c Darshan Shetty b Shabarinath (12r 7b 1x4s 1x6s SR: 171.43)" -> "c Darshan Shetty b Shabarinath".
 *  Falls back to the dismissal kind when there is no line. */
export function howOut(name: string, text: string | null, kind: string | null): string {
  if (!text) return kind ?? 'out'
  let t = text.replace(/\s*\(\d+r[^)]*\)\s*$/, '').trim()
  if (t.toLowerCase().startsWith(name.trim().toLowerCase())) t = t.slice(name.trim().length).trim()
  return t || (kind ?? 'out')
}
