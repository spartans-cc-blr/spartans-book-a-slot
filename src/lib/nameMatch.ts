// Shared fuzzy name-matching helpers — extracted from
// src/app/api/wrangler/parse-announcement/route.ts so the same approach is
// reused for player-identity reconciliation instead of a second
// implementation. Small roster (~150 names), so plain Levenshtein is
// sufficient — no need for a library.

export function levenshtein(a: string, b: string): number {
  const m = a.length, n = b.length
  const dp = Array.from({ length: m + 1 }, (_, i) => [i, ...Array(n).fill(0)])
  for (let j = 0; j <= n; j++) dp[0][j] = j
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      dp[i][j] = a[i - 1] === b[j - 1]
        ? dp[i - 1][j - 1]
        : 1 + Math.min(dp[i - 1][j - 1], dp[i - 1][j], dp[i][j - 1])
    }
  }
  return dp[m][n]
}

export function normaliseName(s: string): string {
  return s.toLowerCase().replace(/[^a-z\s]/g, '').replace(/\s+/g, ' ').trim()
}

export interface NameSuggestion {
  id:   string
  name: string
  dist: number
}

// Ranked suggestions for a scorecard name against the Hub roster — used
// only to populate an admin's picker UI, never to auto-resolve. Same
// distance threshold as parse-announcement.
export function suggestPlayers<T extends { id: string; name: string }>(
  scorecardName: string,
  roster: T[],
  limit = 3
): NameSuggestion[] {
  const key = normaliseName(scorecardName)
  return roster
    .map(p => ({ id: p.id, name: p.name, dist: levenshtein(key, normaliseName(p.name)) }))
    .sort((a, b) => a.dist - b.dist)
    .filter(s => s.dist <= Math.max(3, Math.ceil(key.length / 2)))
    .slice(0, limit)
}
