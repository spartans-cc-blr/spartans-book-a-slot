// Builds the "What do these numbers mean?" entries shown at the bottom of
// /leaderboard (see src/components/leaderboard/LeaderboardGlossary.tsx).
// Deliberately not a static list — the qualification bars these metrics
// actually use shift with the current selection (year vs. all-time,
// club-wide vs. tournament/ground-scoped, this year vs. this month), so a
// fixed glossary would drift out of sync with what's on screen. Each
// builder below quotes the real number currently in effect.

import { minGamesThreshold, minDismissalsThreshold, MIN_BALLS_FOR_ECONOMY, MIN_BALLS_FOR_STRIKE_RATE } from '@/lib/leaderboardMilestones'
import type { TableCategory } from '@/components/leaderboard/LeaderboardFilters'

export interface GlossaryEntry {
  term: string
  definition: string
}

function scopeDescriptor(year: number | 'all', tournamentName: string | null, groundName: string | null): string {
  if (tournamentName) return `in ${tournamentName}`
  if (groundName) return `at ${groundName}`
  return year === 'all' ? 'all-time' : `in ${year}`
}

export function buildOverallGlossary(year: number | 'all', tournamentName: string | null, groundName: string | null): GlossaryEntry[] {
  const scoped = !!(tournamentName || groundName)
  const minGames = minGamesThreshold(year, scoped)
  const minDismissals = minDismissalsThreshold(year, scoped)
  const scope = scopeDescriptor(year, tournamentName, groundName)
  const qualifier = `at least ${minGames} game${minGames === 1 ? '' : 's'} ${scope}`
  const entries: GlossaryEntry[] = [
    { term: 'Leading MVP', definition: `Highest total MVP points (batting, bowling, and fielding contributions combined) among players with ${qualifier}.` },
    { term: 'Leading Run Scorer', definition: `Most runs scored among players with ${qualifier}.` },
    { term: 'Leading Wicket Taker', definition: `Most wickets taken among players with ${qualifier}.` },
    { term: 'Most Dismissals', definition: `Most fielding dismissals (catches + run outs + stumpings combined) among players with ${qualifier} — only shown once the leader has reached ${minDismissals} dismissal${minDismissals === 1 ? '' : 's'} ${scope}. A full season of 50 is considered a genuinely good year in the field; that bar is prorated by quarter for a season still in progress.` },
    { term: 'Most 100s', definition: year === 'all'
        ? `Most centuries scored among players with ${qualifier}.`
        : `Only shown when a player has scored more than one century ${scope} — with everyone else tied at just one, that's not a real "most" yet. See every individual century in the Centuries list below instead.` },
    { term: 'Most 50s', definition: `Most half-centuries scored among players with ${qualifier}.` },
    { term: 'Best Average', definition: `Highest batting average — runs ÷ dismissals, not-out innings excluded — among players with ${qualifier}.` },
    { term: 'Highest S/R', definition: `Highest batting strike rate — runs per 100 balls faced — among players with ${qualifier}.` },
    { term: 'Best Economy', definition: `Fewest runs conceded per over among bowlers who bowled at least ${MIN_BALLS_FOR_ECONOMY} balls (${MIN_BALLS_FOR_ECONOMY / 6} overs) ${scope}.` },
  ]
  if (year !== 'all') {
    entries.push(
      { term: 'Centuries', definition: `Every individual batting innings of 100+ runs ${scope} — every one, not just the highest. Tap a row to open that match.` },
      { term: '5-Wicket Hauls', definition: `Every bowling innings of 5 or more wickets ${scope}. Tap a row to open that match.` },
    )
  }
  return entries
}

export function buildMonthlyGlossary(monthLabel: string): GlossaryEntry[] {
  return [
    { term: 'Top MVP / Top Run Scorer / Top Wicket Taker', definition: `Highest MVP points / runs / wickets among players who played at least 1 game in ${monthLabel}.` },
    { term: 'Best Average', definition: `Highest batting average — runs ÷ dismissals, not-out innings excluded — in ${monthLabel}.` },
    { term: 'Highest S/R', definition: `Highest batting strike rate — runs per 100 balls faced — among players who faced at least ${MIN_BALLS_FOR_STRIKE_RATE} balls in ${monthLabel}.` },
    { term: 'Best Economy', definition: `Fewest runs conceded per over among bowlers who bowled at least ${MIN_BALLS_FOR_ECONOMY} balls (${MIN_BALLS_FOR_ECONOMY / 6} overs) in ${monthLabel}.` },
    { term: 'Centuries', definition: `Every individual batting innings of 100+ runs in ${monthLabel} — every one, not just the highest.` },
    { term: 'Half-Centuries', definition: `Every individual batting innings of 50-99 runs in ${monthLabel}.` },
    { term: '5-Wicket Hauls', definition: `Every bowling innings of 5 or more wickets in ${monthLabel}.` },
    { term: '3-Wicket Hauls', definition: `Every bowling innings of 3-4 wickets in ${monthLabel}.` },
  ]
}

const DETAILED_LABEL: Record<TableCategory, string> = {
  mvp: 'MVP', batting: 'Batting', bowling: 'Bowling', fielding: 'Fielding',
}

export function buildDetailedGlossary(category: TableCategory): GlossaryEntry[] {
  const common: GlossaryEntry = { term: 'M', definition: 'Matches — total games in the current filter.' }
  if (category === 'batting') return [
    common,
    { term: 'Inn', definition: 'Batting innings — games with at least one ball faced.' },
    { term: 'Runs', definition: 'Total runs scored.' },
    { term: 'Avg', definition: 'Batting average — runs ÷ dismissals (not-out innings excluded).' },
    { term: 'S/R', definition: 'Strike rate — runs per 100 balls faced.' },
  ]
  if (category === 'bowling') return [
    common,
    { term: 'Inn', definition: 'Bowling innings — games with at least one over bowled.' },
    { term: 'Wkts', definition: 'Total wickets taken.' },
    { term: 'Econ', definition: 'Economy — runs conceded per over.' },
    { term: 'Avg', definition: 'Bowling average — runs conceded ÷ wickets taken.' },
    { term: 'S/R', definition: 'Bowling strike rate — balls bowled per wicket.' },
  ]
  if (category === 'fielding') return [
    common,
    { term: 'Ct', definition: 'Catches taken (including caught-behind).' },
    { term: 'RO', definition: 'Run outs effected.' },
    { term: 'St', definition: 'Stumpings.' },
    { term: 'Total', definition: 'Catches + run outs + stumpings combined.' },
  ]
  return [ // mvp
    common,
    { term: 'Runs', definition: 'Total runs scored.' },
    { term: 'Wkts', definition: 'Total wickets taken.' },
    { term: 'Dismissals', definition: 'Catches + run outs + stumpings combined.' },
    { term: 'MVP', definition: 'A weighted score combining batting, bowling, and fielding contributions into one number — summed match by match. The formula itself lives in the analytics pipeline, not the Hub.' },
  ]
}

export function detailedGlossaryTitle(category: TableCategory): string {
  return `${DETAILED_LABEL[category]} columns`
}
