// Career highlights for the /players directory — pure, client-safe (no
// server imports), so both the server page and its client grid can use it.
// The raw numbers come from getCareerHighlightsByPlayer() in playerStats.ts;
// this module only decides which of them "look great" for a given player.
// See features/player-directory.md.

export interface CareerHighlights {
  matches: number
  runs: number
  battingInnings: number
  battingAverage: number | null
  wickets: number
  bowlingAverage: number | null
  dismissals: number // catches + caught behind + run outs + stumpings
  bestInnings: { runs: number; balls: number; notOut: boolean } | null
  bestBowling: { wickets: number; runs: number } | null
}

export interface Highlight {
  key: 'best_innings' | 'best_bowling' | 'bat_avg' | 'bowl_avg' | 'career_runs' | 'career_wickets' | 'dismissals'
  label: string
  value: string
  score: number
}

// Sample-size floors, so one lucky innings doesn't produce a headline
// average. Same spirit as the leaderboard's own qualification bars.
export const MIN_INNINGS_FOR_BAT_AVG = 5
export const MIN_WICKETS_FOR_BOWL_AVG = 8

// Each candidate is scored against a "genuinely good" club benchmark, so
// scores are comparable across kinds: a fifty (50 runs), a three-for
// (3 wickets), a batting average of 30, a bowling average of 20, 500 career
// runs, 25 career wickets and 15 dismissals all score 1.0. The highest
// scores win — whatever is most impressive for *this* player leads.
export function pickHighlights(h: CareerHighlights | null | undefined, max = 3): Highlight[] {
  if (!h) return []
  const c: Highlight[] = []

  if (h.bestInnings && h.bestInnings.runs > 0) {
    const b = h.bestInnings
    c.push({
      key: 'best_innings',
      label: 'Highest score',
      value: `${b.runs}${b.notOut ? '*' : ''}${b.balls > 0 ? ` (${b.balls})` : ''}`,
      score: b.runs / 50,
    })
  }
  if (h.bestBowling && h.bestBowling.wickets > 0) {
    const b = h.bestBowling
    c.push({
      key: 'best_bowling',
      label: 'Best bowling',
      value: `${b.wickets}/${b.runs}`,
      // Fewer runs conceded breaks a tie between equal wicket hauls.
      score: b.wickets / 3 - b.runs / 10000,
    })
  }
  if (h.battingAverage !== null && h.battingInnings >= MIN_INNINGS_FOR_BAT_AVG) {
    c.push({ key: 'bat_avg', label: 'Batting avg', value: h.battingAverage.toFixed(1), score: h.battingAverage / 30 })
  }
  if (h.bowlingAverage !== null && h.bowlingAverage > 0 && h.wickets >= MIN_WICKETS_FOR_BOWL_AVG) {
    c.push({ key: 'bowl_avg', label: 'Bowling avg', value: h.bowlingAverage.toFixed(1), score: 20 / h.bowlingAverage })
  }
  if (h.runs >= 100) {
    c.push({ key: 'career_runs', label: 'Career runs', value: h.runs.toLocaleString('en-IN'), score: h.runs / 500 })
  }
  if (h.wickets >= 5) {
    c.push({ key: 'career_wickets', label: 'Wickets', value: String(h.wickets), score: h.wickets / 25 })
  }
  if (h.dismissals >= 5) {
    c.push({ key: 'dismissals', label: 'Dismissals', value: String(h.dismissals), score: h.dismissals / 15 })
  }

  return c.sort((a, b) => b.score - a.score).slice(0, max)
}
