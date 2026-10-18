// Pure, client-safe aggregation behind /leaderboard → Detailed → Breakthroughs.
// Takes each match's per-innings stands (computeBreakthroughs()) plus booking
// context and returns the biggest opponent stands a Spartans bowler ended, and
// the biggest one for each wicket — the bowling-side mirror of the Partnerships
// tab. No DB access — getBreakthroughLeaders() in playerStats.ts fetches and
// resolves names. See features/partnerships.md §13.

import type { Breakthrough } from '@/lib/breakthroughs'
import type { BreakthroughLeaders, BreakthroughRecord, PartnershipLeaderPlayer } from '@/types'

export interface MatchBreakthroughs {
  matchId:      string
  bookingId:    string | null
  gameDate:     string | null
  opponentName: string | null
  stands:       Breakthrough[]
}

export const TOP_BIGGEST = 10
export const MAX_WICKET = 10

// Bigger stand first; then fewer balls (a quicker stand); then the most recent.
function bigger(a: BreakthroughRecord, b: BreakthroughRecord): number {
  return b.runs - a.runs
    || (a.balls ?? Infinity) - (b.balls ?? Infinity)
    || (b.gameDate ?? '').localeCompare(a.gameDate ?? '')
}

export function aggregateBreakthroughLeaders(
  matches: MatchBreakthroughs[],
  resolveBowler: (scorecardName: string, matchId: string) => PartnershipLeaderPlayer,
  opts: { biggest?: number } = {},
): Omit<BreakthroughLeaders, 'coverage'> {
  const records: BreakthroughRecord[] = []
  for (const m of matches) {
    for (const s of m.stands) {
      // Only stands a bowler is credited with ending: run-outs, unclassified
      // dismissals and the unbroken closing stand have no bowler.
      if (!s.bowlerName) continue
      records.push({
        bowler: resolveBowler(s.bowlerName, m.matchId),
        wicketNumber: s.wicketNumber, runs: s.runs, balls: s.balls,
        outBatter: s.outBatter, dismissalType: s.dismissalType,
        matchId: m.matchId, bookingId: m.bookingId, gameDate: m.gameDate, opponentName: m.opponentName,
      })
    }
  }
  records.sort(bigger)

  // Best stand per wicket (records are already best-first, so the first seen wins).
  const best = new Map<number, BreakthroughRecord>()
  for (const r of records) {
    if (r.wicketNumber < 1 || r.wicketNumber > MAX_WICKET) continue
    if (!best.has(r.wicketNumber)) best.set(r.wicketNumber, r)
  }
  const byWicket = Array.from(best.values()).sort((a, b) => a.wicketNumber - b.wicketNumber)

  return { biggest: records.slice(0, opts.biggest ?? TOP_BIGGEST), byWicket }
}
