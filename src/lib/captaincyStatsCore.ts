// Pure, client-safe aggregators for the captaincy views — "who has done
// well for this captain, at which position" (/captains-corner/my-players)
// and "under which captain has this player been used, and how has he
// progressed" (/players/[id]/stats). See features/captaincy-stats.md.
//
// No server imports here: the fetch lives in captaincyStats.ts, which
// re-exports this file, same split as teamStats.ts / teamStatsCore.ts.

export interface CaptaincyInnings {
  matchId: string
  bookingId: string
  gameDate: string
  format: string | null
  tournamentName: string | null
  opponentName: string | null
  // Match-specific captain (squad.is_captain), not players.is_captain.
  captainId: string | null
  captainName: string | null
  playerId: string
  playerName: string
  cricheroesUrl: string | null
  // null = did not bat / did not bowl in this match
  batting: { position: number | null; runs: number; balls: number; notOut: boolean } | null
  bowling: { balls: number; runs: number; wickets: number } | null
}

export interface PlayerRef {
  playerId: string
  playerName: string
  cricheroesUrl: string | null
}

export interface BattingLine {
  innings: number
  runs: number
  balls: number
  notOuts: number
  average: number | null
  strikeRate: number | null
  best: { runs: number; notOut: boolean } | null
}

export interface BowlingLine {
  innings: number
  balls: number
  overs: string
  runs: number
  wickets: number
  economy: number | null
  average: number | null
  best: { wickets: number; runs: number } | null
}

export interface PositionChoice extends PlayerRef, BattingLine { rank: number }

export interface CaptainPositionChoices {
  position: number
  totalInnings: number
  choices: PositionChoice[]
}

export interface BowlerUsage extends PlayerRef, BowlingLine {
  // Share of every legal ball bowled in this captain's matches (0-1).
  share: number
}

export interface CaptainRecord {
  matches: number
  firstDate: string | null
  lastDate: string | null
  positions: CaptainPositionChoices[]
  bowlers: BowlerUsage[]
}

export interface PositionUsage {
  position: number
  innings: number
  runs: number
  average: number | null
  strikeRate: number | null
}

export interface TimelinePoint {
  bookingId: string
  gameDate: string
  opponentName: string | null
  batting: CaptaincyInnings['batting']
  bowling: CaptaincyInnings['bowling']
}

export interface PlayerUnderCaptain {
  captainId: string | null
  captainName: string
  matches: number
  firstDate: string
  lastDate: string
  positions: PositionUsage[]
  batting: BattingLine
  bowling: BowlingLine
  // Chronological, oldest first — the "how has he progressed" strip.
  timeline: TimelinePoint[]
}

export interface SeasonProgression {
  year: string
  // The position batted at most often that year (ties go to the higher
  // order, i.e. the lower number); null if the player didn't bat.
  mostPlayedPosition: { position: number; innings: number } | null
  batting: BattingLine
  bowling: BowlingLine
}

const round2 = (n: number) => Math.round(n * 100) / 100

export function ballsToOvers(balls: number): string {
  return `${Math.floor(balls / 6)}.${balls % 6}`
}

export function battingLine(rows: CaptaincyInnings[]): BattingLine {
  let runs = 0, balls = 0, notOuts = 0, innings = 0
  let best: BattingLine['best'] = null
  for (const r of rows) {
    if (!r.batting) continue
    innings++
    runs += r.batting.runs
    balls += r.batting.balls
    if (r.batting.notOut) notOuts++
    const cand = { runs: r.batting.runs, notOut: r.batting.notOut }
    if (!best || cand.runs > best.runs || (cand.runs === best.runs && cand.notOut && !best.notOut)) best = cand
  }
  const outs = innings - notOuts
  return {
    innings, runs, balls, notOuts,
    average: outs > 0 ? round2(runs / outs) : null,
    strikeRate: balls > 0 ? round2((runs / balls) * 100) : null,
    best,
  }
}

export function bowlingLine(rows: CaptaincyInnings[]): BowlingLine {
  let balls = 0, runs = 0, wickets = 0, innings = 0
  let best: BowlingLine['best'] = null
  for (const r of rows) {
    if (!r.bowling) continue
    innings++
    balls += r.bowling.balls
    runs += r.bowling.runs
    wickets += r.bowling.wickets
    const cand = { wickets: r.bowling.wickets, runs: r.bowling.runs }
    if (!best || cand.wickets > best.wickets || (cand.wickets === best.wickets && cand.runs < best.runs)) best = cand
  }
  return {
    innings, balls, overs: ballsToOvers(balls), runs, wickets,
    economy: balls > 0 ? round2(runs / (balls / 6)) : null,
    average: wickets > 0 ? round2(runs / wickets) : null,
    best,
  }
}

function dateRange(rows: CaptaincyInnings[]): { first: string | null; last: string | null } {
  let first: string | null = null, last: string | null = null
  for (const r of rows) {
    if (!first || r.gameDate < first) first = r.gameDate
    if (!last || r.gameDate > last) last = r.gameDate
  }
  return { first, last }
}

function refOf(r: CaptaincyInnings): PlayerRef {
  return { playerId: r.playerId, playerName: r.playerName, cricheroesUrl: r.cricheroesUrl }
}

// Everything one captain's matches produced, for every player in them.
// `rows` should already be scoped to that captain's matches.
//
// Position ranking: runs desc, then fewer innings (the more efficient
// return), then average desc, then name — so the order is always stable.
// Runs rather than average leads on purpose: it rewards both the trust a
// captain showed (repeated innings at that slot) and what was done with it,
// and never lets a single not-out cameo top a position.
export function buildCaptainRecord(rows: CaptaincyInnings[], topN = 3): CaptainRecord {
  const matchIds = new Set(rows.map(r => r.matchId))
  const { first, last } = dateRange(rows)

  const byPosition = new Map<number, Map<string, CaptaincyInnings[]>>()
  for (const r of rows) {
    const pos = r.batting?.position
    if (!r.batting || pos == null || !Number.isInteger(pos) || pos < 1 || pos > 12) continue
    if (!byPosition.has(pos)) byPosition.set(pos, new Map())
    const m = byPosition.get(pos)!
    if (!m.has(r.playerId)) m.set(r.playerId, [])
    m.get(r.playerId)!.push(r)
  }

  const positions: CaptainPositionChoices[] = Array.from(byPosition.entries())
    .sort((a, b) => a[0] - b[0])
    .map(([position, byPlayer]) => {
      const lines = Array.from(byPlayer.values()).map(pr => ({ ...refOf(pr[0]), ...battingLine(pr) }))
      lines.sort((a, b) =>
        b.runs - a.runs ||
        a.innings - b.innings ||
        (b.average ?? -1) - (a.average ?? -1) ||
        a.playerName.localeCompare(b.playerName))
      return {
        position,
        totalInnings: lines.reduce((s, l) => s + l.innings, 0),
        choices: lines.slice(0, topN).map((l, i) => ({ rank: i + 1, ...l })),
      }
    })

  const byBowler = new Map<string, CaptaincyInnings[]>()
  let totalBalls = 0
  for (const r of rows) {
    if (!r.bowling) continue
    totalBalls += r.bowling.balls
    if (!byBowler.has(r.playerId)) byBowler.set(r.playerId, [])
    byBowler.get(r.playerId)!.push(r)
  }
  const bowlers: BowlerUsage[] = Array.from(byBowler.values())
    .map(br => {
      const line = bowlingLine(br)
      return { ...refOf(br[0]), ...line, share: totalBalls > 0 ? line.balls / totalBalls : 0 }
    })
    .sort((a, b) => b.balls - a.balls || b.wickets - a.wickets || a.playerName.localeCompare(b.playerName))

  return { matches: matchIds.size, firstDate: first, lastDate: last, positions, bowlers }
}

// One player's record, split by match captain. `rows` should already be
// scoped to that one player. Captains ordered by matches played under them.
export function buildPlayerUnderCaptains(rows: CaptaincyInnings[]): PlayerUnderCaptain[] {
  const byCaptain = new Map<string, CaptaincyInnings[]>()
  for (const r of rows) {
    const key = r.captainId ?? '__none__'
    if (!byCaptain.has(key)) byCaptain.set(key, [])
    byCaptain.get(key)!.push(r)
  }

  const out: PlayerUnderCaptain[] = []
  for (const [key, cr] of Array.from(byCaptain.entries())) {
    const sorted = [...cr].sort((a, b) => a.gameDate.localeCompare(b.gameDate))
    const byPos = new Map<number, CaptaincyInnings[]>()
    for (const r of sorted) {
      const pos = r.batting?.position
      if (!r.batting || pos == null) continue
      if (!byPos.has(pos)) byPos.set(pos, [])
      byPos.get(pos)!.push(r)
    }
    const positions: PositionUsage[] = Array.from(byPos.entries())
      .map(([position, pr]) => {
        const l = battingLine(pr)
        return { position, innings: l.innings, runs: l.runs, average: l.average, strikeRate: l.strikeRate }
      })
      .sort((a, b) => b.innings - a.innings || a.position - b.position)
    out.push({
      captainId: key === '__none__' ? null : key,
      captainName: key === '__none__' ? 'Captain not recorded' : (sorted[0].captainName ?? 'Unknown captain'),
      matches: new Set(sorted.map(r => r.matchId)).size,
      firstDate: sorted[0].gameDate,
      lastDate: sorted[sorted.length - 1].gameDate,
      positions,
      batting: battingLine(sorted),
      bowling: bowlingLine(sorted),
      timeline: sorted.map(r => ({
        bookingId: r.bookingId, gameDate: r.gameDate, opponentName: r.opponentName,
        batting: r.batting, bowling: r.bowling,
      })),
    })
  }
  // A known captain always ranks ahead of the "not recorded" bucket.
  return out.sort((a, b) =>
    (a.captainId === null ? 1 : 0) - (b.captainId === null ? 1 : 0) ||
    b.matches - a.matches ||
    a.captainName.localeCompare(b.captainName))
}

// One player's record by calendar year, newest first.
export function buildSeasonProgression(rows: CaptaincyInnings[]): SeasonProgression[] {
  const byYear = new Map<string, CaptaincyInnings[]>()
  for (const r of rows) {
    const y = r.gameDate.slice(0, 4)
    if (!byYear.has(y)) byYear.set(y, [])
    byYear.get(y)!.push(r)
  }
  return Array.from(byYear.entries())
    .map(([year, yr]) => {
      const counts = new Map<number, number>()
      for (const r of yr) {
        const pos = r.batting?.position
        if (pos != null) counts.set(pos, (counts.get(pos) ?? 0) + 1)
      }
      let mostPlayedPosition: SeasonProgression['mostPlayedPosition'] = null
      for (const [position, innings] of Array.from(counts.entries())) {
        if (!mostPlayedPosition || innings > mostPlayedPosition.innings
          || (innings === mostPlayedPosition.innings && position < mostPlayedPosition.position)) {
          mostPlayedPosition = { position, innings }
        }
      }
      return { year, mostPlayedPosition, batting: battingLine(yr), bowling: bowlingLine(yr) }
    })
    .sort((a, b) => b.year.localeCompare(a.year))
}

export interface CaptainOption {
  id: string
  name: string
  matches: number
}
