// Notification preference registry — client-safe (no server imports), shared
// by the profile UI, the API route and the senders. A key is MUTED only when a
// notification_preferences row says enabled=false; no row means on.

export type PrefGroupId = 'squad' | 'reminders' | 'newmatch' | 'news' | 'wallet'

export interface PrefDef {
  key: string
  group: PrefGroupId
  label: string
  hint?: string
}

export const PREF_GROUPS: { id: PrefGroupId; title: string; blurb: string; locked?: boolean }[] = [
  { id: 'squad', title: 'Squad announcements', blurb: 'Pinged when you are picked in an announced squad.', locked: true },
  { id: 'reminders', title: 'Availability reminders', blurb: 'Sun–Wed nudges to mark Y/O/E/L before the Thursday lock.' },
  { id: 'newmatch', title: 'New matches booked', blurb: 'A push when a new match is booked in a tournament you follow.' },
  { id: 'news', title: 'Club news', blurb: 'Birthdays, milestones and match highlights.' },
  { id: 'wallet', title: 'Wallet and fees', blurb: 'Top-ups, match fees, corrections, sponsorships and membership fee.', locked: true },
]

// Locked groups are always sent and can never be muted.
export const LOCKED_GROUPS: ReadonlySet<PrefGroupId> = new Set<PrefGroupId>(['squad', 'wallet'])

export const PREF_DEFS: PrefDef[] = [
  // Reminder days (Sun–Tue). Wednesday is the deadline reminder below.
  { key: 'nudge_day_sun', group: 'reminders', label: 'Sunday reminder' },
  { key: 'nudge_day_mon', group: 'reminders', label: 'Monday reminder' },
  { key: 'nudge_day_tue', group: 'reminders', label: 'Tuesday reminder' },
  { key: 'nudge_deadline', group: 'reminders', label: 'Wednesday last-call reminder', hint: 'The final warning before the Thursday 8am lock' },
  // Reminder kinds.
  { key: 'nudge_habitual', group: 'reminders', label: 'Your usual slot', hint: 'A match in the day and slot you usually play' },
  { key: 'nudge_new_slot', group: 'reminders', label: 'Your format, a new slot', hint: 'Same format as usual, at a slot you have not played' },
  { key: 'nudge_tournament', group: 'reminders', label: 'A tournament you have not played yet' },
  { key: 'nudge_gap', group: 'reminders', label: 'Any match you have not answered' },
  { key: 'nudge_leader', group: 'reminders', label: 'Ground / tournament leader shout-outs', hint: 'When you lead the stats at a ground or tournament' },
  { key: 'nudge_rematch', group: 'reminders', label: 'Rematch recall', hint: 'Your best performance against an opponent we face again' },
  { key: 'nudge_rematch_ready', group: 'reminders', label: 'Rematch hype', hint: 'When you are already in for a rematch' },
  { key: 'nudge_comeback', group: 'reminders', label: 'Come-back nudges', hint: 'Gentle reminders if you have been away a while' },
  // New match booked: master switch; per-tournament keys are dynamic.
  { key: 'newmatch', group: 'newmatch', label: 'New match alerts', hint: 'Master switch. Pick tournaments below.' },
  // Club news.
  { key: 'news_birthday', group: 'news', label: 'Birthday wishes pop-up' },
  { key: 'news_welcome', group: 'news', label: 'New player welcome', hint: 'Push when someone joins the club' },
  { key: 'news_season_runs', group: 'news', label: 'Season milestone: runs' },
  { key: 'news_season_wickets', group: 'news', label: 'Season milestone: wickets' },
  { key: 'news_season_dismissals', group: 'news', label: 'Season milestone: dismissals' },
  { key: 'news_match_century', group: 'news', label: 'Match highlight: century' },
  { key: 'news_match_half_century', group: 'news', label: 'Match highlight: half-century' },
  { key: 'news_match_five_wickets', group: 'news', label: 'Match highlight: 5-wicket haul' },
  { key: 'news_match_three_wickets', group: 'news', label: 'Match highlight: 3-wicket haul' },
  { key: 'news_match_five_dismissals', group: 'news', label: 'Match highlight: 5+ dismissals' },
]

export type PrefKey = (typeof PREF_DEFS)[number]['key']

const STATIC_KEYS = new Set(PREF_DEFS.map(d => d.key))
export const TOURNAMENT_KEY_PREFIX = 'newmatch_t:'
const TOURNAMENT_KEY_RE = /^newmatch_t:[0-9a-fA-F-]{36}$/

export function tournamentPrefKey(tournamentId: string) {
  return `${TOURNAMENT_KEY_PREFIX}${tournamentId}`
}

// Only registered keys and well-formed tournament keys may be stored.
export function isValidPrefKey(key: string): boolean {
  return STATIC_KEYS.has(key) || TOURNAMENT_KEY_RE.test(key)
}

// ── Nudge mapping ─────────────────────────────────────────────────────────
export const NUDGE_THEME_KEY: Record<string, string> = {
  habitual: 'nudge_habitual',
  same_format_new_slot: 'nudge_new_slot',
  tournament_eligibility: 'nudge_tournament',
  gap_reminder: 'nudge_gap',
  leaderboard_leader: 'nudge_leader',
  rematch_recall: 'nudge_rematch',
  rematch_ready: 'nudge_rematch_ready',
  reactivation_1: 'nudge_comeback',
  reactivation_2: 'nudge_comeback',
  deadline: 'nudge_deadline',
}

// dow 0=Sun, 1=Mon, 2=Tue. Wednesday (3) is governed by 'nudge_deadline'.
const NUDGE_DAY_KEY: Record<number, string> = { 0: 'nudge_day_sun', 1: 'nudge_day_mon', 2: 'nudge_day_tue' }

export type MutedSet = ReadonlySet<string>
export const NO_MUTES: MutedSet = new Set<string>()

export function isNudgeDayMuted(dow: number, muted: MutedSet): boolean {
  const key = NUDGE_DAY_KEY[dow]
  return !!key && muted.has(key)
}

export function isNudgeThemeMuted(theme: string, muted: MutedSet): boolean {
  const key = NUDGE_THEME_KEY[theme]
  return !!key && muted.has(key)
}

// ── Modal mapping ─────────────────────────────────────────────────────────
export const SEASON_MILESTONE_KEY: Record<string, string> = {
  runs: 'news_season_runs',
  wickets: 'news_season_wickets',
  dismissals: 'news_season_dismissals',
}

export const MATCH_PERFORMANCE_KEY: Record<string, string> = {
  century: 'news_match_century',
  half_century: 'news_match_half_century',
  five_wicket_haul: 'news_match_five_wickets',
  three_wicket_haul: 'news_match_three_wickets',
  five_dismissals: 'news_match_five_dismissals',
}

// New-match alert: muted if the master switch is off OR this tournament is unfollowed.
export function isNewMatchMuted(muted: MutedSet, tournamentId: string): boolean {
  return muted.has('newmatch') || muted.has(tournamentPrefKey(tournamentId))
}
