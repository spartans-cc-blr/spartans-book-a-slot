// Pure, client-safe: the OPPONENT's batting stands and which Spartans bowler
// broke each one. Derived from opponent_fall_of_wickets (every row carries the
// dismissing Spartans bowler — analytics-db/migrations/007, features/
// partnerships.md §11) plus the opponent's final score for a closing unbroken
// stand. No DB access; getBreakthroughLeaders() in playerStats.ts and
// ScorecardTables.tsx both call this. See features/partnerships.md §13.
//
// Deliberately FOW-only: the opponent's batting order isn't stored, so a stand
// is "the stand that ended when wicket N fell" (runs, balls, who was dismissed,
// who got them) with no partner names.

export interface OpponentFowRow {
  wicket_number:  number
  team_score:     number
  over:           number | string
  player_name:    string
  bowler_name?:   string | null
  dismissal_type?: string | null
  fielder_name?:  string | null
}

export interface OpponentFinalScore {
  total:   number
  overs:   number | string
  wickets: number | null
}

export interface Breakthrough {
  wicketNumber:  number
  runs:          number
  balls:         number | null
  overFrom:      number | string
  overTo:        number | string
  // Opponent batter dismissed (null on the unbroken closing stand).
  outBatter:     string | null
  // Spartans bowler credited with ending the stand; null for a run-out, an
  // unclassified dismissal, or the unbroken closing stand.
  bowlerName:    string | null
  dismissalType: string | null
  // Spartans fielder involved (catch, stumping, run-out); null when none.
  fielderName?:  string | null
  unbroken:      boolean
}

// CricHeroes "overs.balls" (9.2 = 9 overs 2 balls). Parsed as a string —
// float maths on 9.2 loses precision (same reason as partnershipLeaders.ts).
export function oversToBalls(over: number | string): number {
  const [whole, part] = String(over).split('.')
  return (parseInt(whole, 10) || 0) * 6 + (part ? parseInt(part[0], 10) || 0 : 0)
}

function cleanName(v: string | null | undefined): string | null {
  const s = (v ?? '').trim()
  return s ? s : null
}

// [] = nothing to show (no FOW synced, or the rows demonstrably don't cover
// every wicket, so stand sizes would be merged and wrong — hidden rather than
// shown wrong, same posture as computePartnerships()).
export function computeBreakthroughs(
  fallOfWickets: OpponentFowRow[] | null | undefined,
  finalScore?: OpponentFinalScore | null,
): Breakthrough[] {
  const fow = (fallOfWickets ?? []).slice().sort((a, b) => Number(a.wicket_number) - Number(b.wicket_number))
  const wickets = finalScore?.wickets != null ? Number(finalScore.wickets) : null
  if (fow.length === 0 && !(wickets === 0 && finalScore)) return []
  if (wickets != null && fow.length !== wickets) return []

  const out: Breakthrough[] = []
  let prevScore = 0
  let prevOver: number | string = 0
  for (const e of fow) {
    const score = Number(e.team_score)
    const balls = oversToBalls(e.over) - oversToBalls(prevOver)
    out.push({
      wicketNumber:  Number(e.wicket_number),
      runs:          score - prevScore,
      balls:         balls >= 0 ? balls : null,
      overFrom:      prevOver,
      overTo:        e.over,
      outBatter:     cleanName(e.player_name),
      bowlerName:    cleanName(e.bowler_name),
      dismissalType: cleanName(e.dismissal_type),
      fielderName:   cleanName(e.fielder_name),
      unbroken:      false,
    })
    prevScore = score
    prevOver = e.over
  }

  // Closing unbroken stand: innings ended not-all-out with batters still in.
  if (finalScore && wickets != null && wickets < 10 && Number(finalScore.total) > prevScore) {
    const balls = oversToBalls(finalScore.overs) - oversToBalls(prevOver)
    out.push({
      wicketNumber:  fow.length + 1,
      runs:          Number(finalScore.total) - prevScore,
      balls:         balls >= 0 ? balls : null,
      overFrom:      prevOver,
      overTo:        finalScore.overs,
      outBatter:     null,
      bowlerName:    null,
      dismissalType: null,
      fielderName:   null,
      unbroken:      true,
    })
  }
  return out
}

export interface BowlerBreaks {
  bowlerName: string
  broken:     number   // stands ended
  standRuns:  number   // total runs in the stands broken
}

// Per-bowler tally for one innings, most breaks first.
export function summariseBreakers(stands: Breakthrough[]): BowlerBreaks[] {
  const map = new Map<string, BowlerBreaks>()
  for (const s of stands) {
    if (!s.bowlerName) continue
    const key = s.bowlerName.toLowerCase()
    const cur = map.get(key) ?? { bowlerName: s.bowlerName, broken: 0, standRuns: 0 }
    cur.broken += 1
    cur.standRuns += s.runs
    map.set(key, cur)
  }
  return Array.from(map.values()).sort((a, b) =>
    b.broken - a.broken || a.standRuns - b.standRuns || a.bowlerName.localeCompare(b.bowlerName))
}

export type DismissalSeg = { kind: 'text' | 'fielder' | 'bowler'; value: string }

const norm = (v: string | null) => (v ?? '').toLowerCase().replace(/[^a-z0-9]/g, '')

// Full "how out" wording for one broken stand, e.g. "Caught by Sagar, bowled
// Ramesh" or "Run out (Kishore)". Segments so the UI can link the bowler.
export function describeDismissal(
  b: Pick<Breakthrough, 'dismissalType' | 'fielderName' | 'bowlerName'>,
): DismissalSeg[] {
  const t = (b.dismissalType ?? '').toLowerCase()
  const f = b.fielderName
  const w = b.bowlerName
  const T = (value: string): DismissalSeg => ({ kind: 'text', value })
  const F = (value: string): DismissalSeg => ({ kind: 'fielder', value })
  const B = (value: string): DismissalSeg => ({ kind: 'bowler', value })
  const bowled = w ? [T(', bowled '), B(w)] : []
  switch (t) {
    case 'bowled': return w ? [T('Bowled by '), B(w)] : [T('Bowled')]
    case 'lbw': return w ? [T('LBW, bowled '), B(w)] : [T('LBW')]
    case 'caught':
      if (w && f && norm(f) === norm(w)) return [T('Caught & bowled by '), B(w)]
      return f ? [T('Caught by '), F(f), ...bowled] : [T('Caught'), ...bowled]
    case 'caught_behind':
      return f ? [T('Caught behind by '), F(f), ...bowled] : [T('Caught behind'), ...bowled]
    case 'stumping':
    case 'stumped':
      return f ? [T('Stumped by '), F(f), ...bowled] : [T('Stumped'), ...bowled]
    case 'run_out':
    case 'runout':
      return f ? [T('Run out ('), F(f), T(')')] : [T('Run out')]
    case '': return w ? [T('Bowled by '), B(w)] : []
    default: return [T(t.replace(/_/g, ' ')), ...bowled]
  }
}
