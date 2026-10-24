// Re-pulls of older scorecards must not re-trigger recognition or fee prompts.
// See features/post-match-scorecard.md §18.
//
// Matches with game_date before this date are treated as "history": the club
// re-pulls them to pick up newer CricHeroes stats, and none of the
// celebration/fee prompts should ever fire for them.
export const RECOGNITION_AND_FEE_PROMPTS_START = '2026-10-01'

export function isBeforePromptCutoff(gameDate: string): boolean {
  return String(gameDate).slice(0, 10) < RECOGNITION_AND_FEE_PROMPTS_START
}

// Record-break alerts (admin-only, features/record-breaking.md) start on this
// date: a match played before it never produces an alert, even on a re-sync.
export const RECORD_BREAK_ALERTS_START = '2026-10-24'

export function isBeforeRecordAlertStart(gameDate: string): boolean {
  return String(gameDate).slice(0, 10) < RECORD_BREAK_ALERTS_START
}
