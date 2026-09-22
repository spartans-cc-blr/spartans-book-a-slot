// Shared, pure helpers for the toss / ordered-score / margin lines shown
// above a synced scorecard — used by both MatchHistoryClient.tsx's
// MatchHistoryCard (list view) and the standalone
// /matches/history/[bookingId] page, so the two surfaces can't drift on
// wording or on the batted-first/margin derivation. No server imports —
// safe to import from a 'use client' component. See
// features/post-match-scorecard.md §17.
//
// `toss_won`/`toss_decision` come straight off the analytics DB's
// match_stats table ('Y'/'N' and 'bat'/'field' respectively — see
// deriveBattedFirst() in src/lib/playerStats.ts and the identical inline
// derivation in src/lib/teamStats.ts). toss_won is always relative to
// *our* team (the Spartans variant that played), never the opponent.

export type MatchResultKind = 'won' | 'lost' | 'tied' | 'nr' | null

// Same normalisation src/lib/teamStatsCore.ts's normaliseResult() applies —
// kept as a local copy rather than importing that (much larger) team-stats
// module, so this file stays a tiny, standalone, client-safe unit.
export function normaliseMatchResultKind(raw: string | null | undefined): MatchResultKind {
  if (!raw) return null
  const s = raw.toLowerCase().trim()
  if (s.startsWith('won') || s === 'w') return 'won'
  if (s.startsWith('lost') || s === 'l') return 'lost'
  if (s.startsWith('tie')) return 'tied'
  if (s === 'nr' || s.includes('no result') || s.includes('abandon')) return 'nr'
  return null
}

export function deriveBattedFirst(
  tossWon:      string | null | undefined,
  tossDecision: string | null | undefined,
): boolean | null {
  if (tossWon !== 'Y' && tossWon !== 'N') return null
  if (tossDecision !== 'bat' && tossDecision !== 'field') return null
  return (tossWon === 'Y') === (tossDecision === 'bat')
}

// "Spartans CC won the toss and elected to bat/field" / "Spartans CC lost
// the toss and was put in to bat/field" — the latter is the opposite of
// what the opponent (the actual toss winner) chose, since a toss decision
// is always framed as the winner's own action.
export function buildTossLine(
  tossWon:      string | null | undefined,
  tossDecision: string | null | undefined,
  ourName = 'Spartans CC',
): string | null {
  if (tossWon !== 'Y' && tossWon !== 'N') return null
  if (tossDecision !== 'bat' && tossDecision !== 'field') return null
  if (tossWon === 'Y') return `${ourName} won the toss and elected to ${tossDecision}`
  const puttInTo = tossDecision === 'bat' ? 'field' : 'bat'
  return `${ourName} lost the toss and was put in to ${puttInTo}`
}

function formatInnings(total: number | null, wickets: number | null, overs: number | null): string {
  return `${total ?? '—'}/${wickets ?? '—'} (${overs ?? '—'} ov)`
}

// Orders the two innings by who actually batted first — "whoever batted
// first, then whoever chased" — rather than always putting our own score
// first. Falls back to the pre-existing own-first order when battedFirst
// can't be derived (no toss data synced for this match yet).
export function buildOrderedScoreLine(
  battedFirst: boolean | null,
  teamTotal: number | null, teamWickets: number | null, teamOvers: number | null,
  oppTotal: number | null, oppWickets: number | null, oppOvers: number | null,
): string {
  const own = formatInnings(teamTotal, teamWickets, teamOvers)
  const opp = formatInnings(oppTotal, oppWickets, oppOvers)
  return battedFirst === false ? `${opp} vs ${own}` : `${own} vs ${opp}`
}

export interface MatchMargin {
  kind:  'runs' | 'wickets'
  value: number
}

// Mirrors src/lib/teamStatsCore.ts's winMargin() for a win, extended
// symmetrically for a loss. battedFirst and `result` are both always
// relative to *our* team, so every branch below reads as "what happened to
// us": if we set the target and the opponent chased it down, that's a loss
// by wickets (theirs); if we chased and fell short, that's a loss by runs.
export function computeMatchMargin(
  result: MatchResultKind,
  battedFirst: boolean | null,
  teamTotal: number | null, teamWickets: number | null,
  oppTotal: number | null, oppWickets: number | null,
): MatchMargin | null {
  if (battedFirst === null || teamTotal === null || oppTotal === null) return null
  if (result === 'won') {
    if (battedFirst) return { kind: 'runs', value: teamTotal - oppTotal }
    if (teamWickets === null) return null
    return { kind: 'wickets', value: 10 - teamWickets }
  }
  if (result === 'lost') {
    if (battedFirst) {
      if (oppWickets === null) return null
      return { kind: 'wickets', value: 10 - oppWickets }
    }
    return { kind: 'runs', value: oppTotal - teamTotal }
  }
  return null
}

export interface ResultLine {
  kind:  MatchResultKind
  label: string
}

// The single result+margin line rendered by MatchResultBadge.tsx — folds
// the old separate "WON"/"LOST" pill (redundant once the margin line below
// it also says "won"/"lost") into one line: "WON BY 30 RUNS" as a pill,
// "LOST BY 6 WICKETS" as plain text, matching the same win/loss visual
// weighting src/components/shared/ResultBadge.tsx already established
// (win = celebratory pill, everything else = plain coloured text). Falls
// back to a bare "WON"/"LOST" when no margin can be computed yet (missing
// toss data), and to the raw uppercased result string for anything that
// doesn't normalise to won/lost/tied (e.g. "NO RESULT").
export function buildResultLine(rawResult: string | null | undefined, margin: MatchMargin | null): ResultLine | null {
  if (!rawResult) return null
  const kind = normaliseMatchResultKind(rawResult)
  if (kind === 'won')  return { kind, label: margin && margin.value > 0 ? `WON BY ${margin.value} ${margin.kind.toUpperCase()}` : 'WON' }
  if (kind === 'lost') return { kind, label: margin && margin.value > 0 ? `LOST BY ${margin.value} ${margin.kind.toUpperCase()}` : 'LOST' }
  if (kind === 'tied') return { kind, label: 'MATCH TIED' }
  return { kind, label: rawResult.toUpperCase() }
}
