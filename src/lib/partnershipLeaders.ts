// Pure, client-safe aggregation behind /leaderboard's Detailed →
// Partnerships tab. Takes each match's already-derived partnerships
// (computePartnerships(), src/lib/partnerships.ts) plus per-match booking
// context and produces three views:
//
//   top      — the N highest partnerships for any wicket
//   byWicket — the single highest partnership for each wicket 1-10
//   pairs    — the N highest aggregate run totals by the same two batters
//
// No DB access here — getPartnershipLeaders() in src/lib/playerStats.ts
// does the fetching and name resolution, then calls this. Kept separate so
// the ranking rules are unit-testable (partnershipLeaders.test.ts).
// See features/partnerships.md §10.

import type { Partnership, PartnershipPlayer } from '@/lib/partnerships'
import type { PartnershipLeaderPlayer, PartnershipLeaders, PartnershipPairAggregate, PartnershipRecord } from '@/types'

export interface MatchPartnerships {
  matchId:      string
  bookingId:    string | null
  gameDate:     string | null
  opponentName: string | null
  partnerships: Partnership[]
}

export const TOP_PARTNERSHIPS = 10
export const TOP_PAIRS = 5
const MAX_WICKET = 10

// CricHeroes "overs.balls" notation — 9.2 is 9 overs and 2 balls, never a
// decimal. Parsed as a string for the same float-precision reason
// ScorecardTables.tsx's own oversToBalls() gives.
function oversToBalls(over: number | string): number {
  const [whole, part] = String(over).split('.')
  return (Number(whole) || 0) * 6 + (Number(part) || 0)
}

function normalize(name: string): string {
  return name.trim().toLowerCase().replace(/\s+/g, ' ')
}

// Identity key for pairing — the reconciled Hub player_id when there is
// one, else the normalised scorecard name so an unreconciled batter still
// groups with themselves across innings.
function playerKey(p: PartnershipPlayer): string {
  return p.playerId ? `id:${p.playerId}` : `n:${normalize(p.playerName)}`
}

// Higher runs first; fewer balls breaks a tie (the quicker stand), then
// the most recent match.
function compareRecords(a: PartnershipRecord, b: PartnershipRecord): number {
  return b.runs - a.runs
    || (a.balls ?? Infinity) - (b.balls ?? Infinity)
    || (b.gameDate ?? '').localeCompare(a.gameDate ?? '')
}

export function aggregatePartnershipLeaders(
  matches: MatchPartnerships[],
  resolvePlayer: (p: PartnershipPlayer) => PartnershipLeaderPlayer,
  opts: { top?: number; pairs?: number } = {},
): PartnershipLeaders {
  const records: PartnershipRecord[] = []
  const pairMap = new Map<string, PartnershipPairAggregate>()

  for (const m of matches) {
    for (const p of m.partnerships) {
      const players: [PartnershipLeaderPlayer, PartnershipLeaderPlayer] = [resolvePlayer(p.players[0]), resolvePlayer(p.players[1])]
      const balls = oversToBalls(p.overTo) - oversToBalls(p.overFrom)
      records.push({
        wicketNumber: p.wicketNumber,
        runs:         p.runs,
        balls:        balls >= 0 ? balls : null,
        unbroken:     p.outPlayer === null,
        players,
        matchId:      m.matchId,
        bookingId:    m.bookingId,
        gameDate:     m.gameDate,
        opponentName: m.opponentName,
      })

      const key = [playerKey(p.players[0]), playerKey(p.players[1])].sort().join('|')
      const prev = pairMap.get(key)
      if (prev) {
        prev.runs += p.runs
        prev.innings += 1
        if (p.runs > prev.best) { prev.best = p.runs; prev.bestUnbroken = p.outPlayer === null }
      } else {
        pairMap.set(key, { players, runs: p.runs, innings: 1, best: p.runs, bestUnbroken: p.outPlayer === null })
      }
    }
  }

  records.sort(compareRecords)

  const byWicketMap = new Map<number, PartnershipRecord>()
  for (const r of records) {
    if (r.wicketNumber < 1 || r.wicketNumber > MAX_WICKET) continue
    if (!byWicketMap.has(r.wicketNumber)) byWicketMap.set(r.wicketNumber, r) // records already sorted best-first
  }

  const pairs = Array.from(pairMap.values())
    .sort((a, b) => b.runs - a.runs || a.innings - b.innings || b.best - a.best)
    .slice(0, opts.pairs ?? TOP_PAIRS)

  return {
    top:      records.slice(0, opts.top ?? TOP_PARTNERSHIPS),
    byWicket: Array.from(byWicketMap.values()).sort((a, b) => a.wicketNumber - b.wicketNumber),
    pairs,
  }
}
