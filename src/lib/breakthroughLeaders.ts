// Pure, client-safe aggregation behind /leaderboard → Detailed → Breakthroughs.
// Takes each match's per-innings stands (computeBreakthroughs()) plus booking
// context and ranks Spartans bowlers by partnerships broken. No DB access —
// getBreakthroughLeaders() in playerStats.ts fetches and resolves names.
// See features/partnerships.md §13.

import type { Breakthrough } from '@/lib/breakthroughs'
import { classifyStand, type StandBaselines } from '@/lib/standBaselines'
import type { BreakerAggregate, BreakthroughLeaders, BreakthroughRecord, PartnershipLeaderPlayer } from '@/types'

export interface MatchBreakthroughs {
  matchId:      string
  bookingId:    string | null
  gameDate:     string | null
  format:       string | null
  opponentName: string | null
  stands:       Breakthrough[]
}

export const TOP_BREAKERS = 10
export const TOP_BIGGEST = 10

function key(p: PartnershipLeaderPlayer): string {
  return p.playerId ? `id:${p.playerId}` : `n:${p.playerName.trim().toLowerCase().replace(/\s+/g, ' ')}`
}

export function aggregateBreakthroughLeaders(
  matches: MatchBreakthroughs[],
  resolveBowler: (scorecardName: string, matchId: string) => PartnershipLeaderPlayer,
  opts: {
    breakers?: number; biggest?: number
    baselines?: StandBaselines | null          // what counts as a big stand; none = nothing is big
    minBreaks?: number                         // stands a bowler needs before ranking
    ballsFor?: (bowler: PartnershipLeaderPlayer) => number
  } = {},
): Omit<BreakthroughLeaders, 'coverage'> {
  const agg = new Map<string, BreakerAggregate & { matchIds: Set<string> }>()
  const records: BreakthroughRecord[] = []

  for (const m of matches) {
    for (const s of m.stands) {
      if (!s.bowlerName) continue
      const bowler = resolveBowler(s.bowlerName, m.matchId)
      const k = key(bowler)
      const cur = agg.get(k) ?? { bowler, broken: 0, bigBreaks: 0, standRuns: 0, abovePar: 0, ballsBowled: 0, matches: 0, matchIds: new Set<string>() }
      cur.broken += 1
      cur.standRuns += s.runs
      const c = classifyStand(opts.baselines, m.format, s.wicketNumber, s.runs)
      if (c.big) cur.bigBreaks += 1
      cur.abovePar += c.abovePar
      cur.matchIds.add(m.matchId)
      agg.set(k, cur)
      records.push({
        bowler, wicketNumber: s.wicketNumber, runs: s.runs, balls: s.balls,
        outBatter: s.outBatter, dismissalType: s.dismissalType,
        matchId: m.matchId, bookingId: m.bookingId, gameDate: m.gameDate, opponentName: m.opponentName,
      })
    }
  }

  // Most big breaks (top-quarter stands for their slot and format); then runs
  // above par; then total breaks; then name for a stable order. A bowler needs
  // minBreaks stands before they can rank, so one lucky wicket can't top it.
  const breakers = Array.from(agg.values())
    .filter(a => a.broken >= (opts.minBreaks ?? 1))
    .map(({ matchIds, ...a }) => ({ ...a, matches: matchIds.size, ballsBowled: opts.ballsFor?.(a.bowler) ?? 0 }))
    .sort((a, b) =>
      b.bigBreaks - a.bigBreaks || b.abovePar - a.abovePar || b.broken - a.broken
      || a.bowler.playerName.localeCompare(b.bowler.playerName))
    .slice(0, opts.breakers ?? TOP_BREAKERS)

  // Biggest stand ended: runs desc, fewer balls (quicker stand) then recency.
  records.sort((a, b) =>
    b.runs - a.runs || (a.balls ?? Infinity) - (b.balls ?? Infinity) || (b.gameDate ?? '').localeCompare(a.gameDate ?? ''))

  return { breakers, biggest: records.slice(0, opts.biggest ?? TOP_BIGGEST) }
}
