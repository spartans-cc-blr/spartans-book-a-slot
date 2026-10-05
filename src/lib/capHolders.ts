// IPL-style Orange / Purple Cap logic. Pure and client-safe (no server
// imports) so both the server pages and 'use client' tables can share it.
// See features/leaderboard.md §6.2.1.
//
// Orange = most runs, Purple = most wickets. Tie-breaks follow the IPL:
// runs tied → higher strike rate; wickets tied → lower economy, then lower
// bowling strike rate. A tie that survives all of that shares the cap.
// No qualification bar, but nobody holds a cap on 0 runs / 0 wickets.

import type { LeaderboardRow } from '@/types'

export type CapKind = 'orange' | 'purple'

export function findCapHolders(rows: LeaderboardRow[], kind: CapKind): Set<string> {
  const primary = (r: LeaderboardRow) => (kind === 'orange' ? r.stats.runs : r.stats.wickets)
  const candidates = rows.filter(r => primary(r) > 0)
  if (candidates.length === 0) return new Set()

  // Returns >0 when `a` ranks ahead of `b`. A missing rate loses.
  const rank = (a: LeaderboardRow, b: LeaderboardRow): number => {
    const dp = primary(a) - primary(b)
    if (dp !== 0) return dp
    if (kind === 'orange') return (a.stats.strikeRate ?? 0) - (b.stats.strikeRate ?? 0)
    const lower = (x: number | null) => (x == null ? Infinity : x)
    const de = lower(b.stats.economy) - lower(a.stats.economy)
    if (de !== 0 && Number.isFinite(de)) return de
    const ds = lower(b.stats.bowlingStrikeRate) - lower(a.stats.bowlingStrikeRate)
    return Number.isFinite(ds) ? ds : 0
  }

  const best = candidates.reduce((top, r) => (rank(r, top) > 0 ? r : top), candidates[0])
  return new Set(candidates.filter(r => rank(r, best) === 0).map(r => r.playerId))
}

/** Caps a given player holds, given the season's cap-holder id sets. */
export function capsForPlayer(
  playerId: string,
  holders: { orange: string[]; purple: string[] },
): CapKind[] {
  const caps: CapKind[] = []
  if (holders.orange.includes(playerId)) caps.push('orange')
  if (holders.purple.includes(playerId)) caps.push('purple')
  return caps
}
