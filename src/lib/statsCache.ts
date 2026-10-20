// Data-layer cache for the heavy, read-mostly stats queries behind
// /leaderboard, /team-stats and /players. The pages themselves must stay
// dynamic (they read the session), so caching lives here, one level down.
//
// Entries live up to STATS_TTL_SECONDS and are dropped immediately by
// invalidateStatsCache() when something that changes the numbers happens
// (scorecard sync, player reconciliation, opponent edits). Results must
// survive a JSON round trip (no Date/Map/Set) — true for every wrapped fn.
// Server-only: imports next/cache.
import { unstable_cache, revalidateTag } from 'next/cache'

export const STATS_TAG = 'stats'
export const STATS_TTL_SECONDS = 300

export function cachedStats<A extends any[], R>(fn: (...args: A) => Promise<R>, key: string): (...args: A) => Promise<R> {
  return unstable_cache(fn, ['stats-v1', key], { tags: [STATS_TAG], revalidate: STATS_TTL_SECONDS })
}

// Best-effort: never let a cache problem fail the write that triggered it.
export function invalidateStatsCache(): void {
  try {
    revalidateTag(STATS_TAG)
  } catch (err) {
    console.error('[statsCache] revalidateTag failed', err)
  }
}
