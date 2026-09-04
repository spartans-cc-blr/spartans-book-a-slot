// ── Core domain types ────────────────────────────────────────────

export type BookingStatus = 'confirmed' | 'cancelled' | 'soft_block'
export type GameFormat    = 'T20' | 'T30' | 'T10' | 'T25'
export type SlotTime      = '07:30' | '10:30' | '12:30' | '14:30'
export type SlotStatus = 'open' | 'booked' | 'soft_block' | 'clash' | 't20only' | 'na'

// T10/T25 are rare, informal, admin-only "quick game" formats — they never
// go through the R1-R7 booking rules engine, never appear as a format filter
// anywhere T20/T30 filters are shown, are excluded from the public /schedule
// grid and from /tournament-planner, but do count toward player stats (no
// dedicated bucket — they just fold into the aggregate totals) and render
// normally wherever a match's own format is shown (fixtures, match history,
// admin dashboard). See .claude/rules/architecture.md.
export const INFORMAL_FORMATS: GameFormat[] = ['T10', 'T25']
export function isInformalFormat(format: string | null | undefined): boolean {
  return format === 'T10' || format === 'T25'
}

export interface Captain {
  id:         string
  name:       string
  active:     boolean
  player_id:  string | null
  created_at: string
  players:    { cricheroes_url: string | null } | null
}

export interface Tournament {
  id:                          string
  name:                        string
  organiser_name:              string | null
  organiser_contact:           string | null
  active:                      boolean
  created_at:                  string
  captain_id:                  string | null
  total_league_games:          number | null
  cricheroes_points_table_url: string | null
  ground_id:                   string | null
  // Practice games are played at a different ground every time, unlike a
  // normal tournament (one ground for its whole run) — see
  // features/leaderboard.md §10. Drives the per-booking ground picker on
  // /admin/bookings/new and /admin/bookings/[id].
  is_practice:                 boolean
  // Admin-declared format(s), used only as the slot-distribution/suggestion
  // fallback for a tournament with zero confirmed bookings yet — see
  // resolveActiveFormats() in src/lib/slotTargets.ts. Null means
  // undeclared; a real booking's own format always wins once one exists.
  intended_formats:            GameFormat[] | null
  // Admin-declared expected start date (ISO 'YYYY-MM-DD'), used only to
  // anchor and size the suggestion window — see computeSuggestionWindow()
  // in src/lib/suggestedSlots.ts. Ignored once it's today or in the past.
  tentative_start_date:        string | null
  captains: {
    id:      string
    name:    string
    players: { cricheroes_url: string | null } | null
  } | null
}

export interface Booking {
  id:            string
  game_date:     string        // ISO date: 'YYYY-MM-DD'
  slot_time:     SlotTime
  format:        GameFormat | null
  // Deprecated — free-text ground name from before ground_id existed (see
  // migration 066). No longer written to; inert historical data only.
  venue:         string | null
  tournament_id: string | null
  status:        BookingStatus
  block_reason:  string | null
  notes:         string | null
  created_at:    string
  updated_at:    string
  // This game's own ground and captain — default to the tournament's own
  // ground_id/captain_id at booking time, but independently overridable
  // (e.g. practice games, which have no single tournament-level ground).
  // See migration 066.
  ground_id?:    string | null
  captain_id?:   string | null
  // Joined fields (from API responses)
  tournament?:   Tournament & {
    captain_id: string | null
    captains: { id: string; name: string; players: { cricheroes_url: string | null } | null } | null
  }
  ground?: { id: string; name: string; maps_url: string; hospital_url: string } | null
  captain?: { id: string; name: string; players: { cricheroes_url: string | null; whatsapp: string | null } | null } | null
  reserved_until?: string | null
  organiser_name?: string | null
  organiser_phone?: string | null
  match_id?: string | null
  match_stage?: string | null
  match_time?: string | null
  opponent_name?: string | null
  cricheroes_url?: string | null
}

// ── Slot model for the availability grid ─────────────────────────

export interface SlotInfo {
  time:             SlotTime
  status:           SlotStatus
  waLink?:          string
  reserved_until?:  string | null
  organiser_name?:  string | null
  opponent_name?:   string | null
  cricheroes_url?:  string | null
  tournament_name?: string | null
  format?: GameFormat | null
}

export interface DayAvailability {
  date:  string   // ISO: 'YYYY-MM-DD'
  label: string   // e.g. 'Saturday 1 Mar'
  slots: SlotInfo[]
}

export interface WeekAvailability {
  weekStart:   string
  label:       string
  days:        DayAvailability[]
  weekendFull: boolean
  gamesBooked: number
}

// ── API request/response types ────────────────────────────────────

export interface CreateBookingRequest {
  game_date:      string
  slot_time:      SlotTime
  format:         GameFormat
  tournament_id:  string
  // Both default server-side to the tournament's own ground_id/captain_id
  // when omitted from the request; send explicitly (including null) to
  // override. See migration 066.
  ground_id?:     string | null
  captain_id?:    string | null
  notes?:         string | null
  opponent_name?: string | null
  match_id?:      string | null
  match_stage?:   string | null
  match_time?:    string | null
  cricheroes_url?: string | null
  exclude_id?:    string
  block_reason?:  string | null  // set when this candidate is itself a soft-block hold (e.g. a Knockout hold) — read by R7
}

// Admin-only rule override — one entry per rule the admin is knowingly
// bypassing, each requiring its own reason. See
// features (architecture.md §7 rules engine) and booking_rule_overrides.
export interface RuleOverrideInput {
  rule:   ValidationError['rule']
  reason: string
}

export interface CreateSoftBlockRequest {
  game_date:    string
  slot_time:    SlotTime
  block_reason: string
  notes?:       string
}

export interface ValidationResult {
  valid:      boolean
  errors:     ValidationError[]
  warnings:   ValidationError[]
  overridden?: ValidationError[]   // rules that failed but were admin-overridden — see RuleOverrideInput
}

export interface ValidationError {
  rule:    'R1' | 'R2' | 'R3' | 'R4' | 'R5' | 'R6' | 'R7' | 'R8'
  message: string
}

// ── Rule check context (used in live form validation) ─────────────

export interface RuleCheckItem {
  rule:    string
  label:   string
  status:  'pass' | 'fail' | 'pending' | 'warn' | 'override'
  message: string
}

export const SLOT_TIMES: SlotTime[] = ['07:30', '10:30', '12:30', '14:30']

// T10/T25 aren't rule-checked, so they're valid at every slot bucket — the
// admin just picks whichever of the 4 is closest to when the game is
// actually happening. This is a scheduling label only, not a rule input.
export const SLOT_FORMATS: Record<SlotTime, GameFormat[]> = {
  '07:30': ['T20', 'T30', 'T10', 'T25'],
  '10:30': ['T20', 'T10', 'T25'],
  '12:30': ['T20', 'T30', 'T10', 'T25'],
  '14:30': ['T20', 'T10', 'T25'],
}

export const BLOCK_REASONS = [
  'Club Event',
  'Reserved for Knockout (pending confirmation)',
  'Practice / Internal Game',
  'Reserved via organiser self-service (pending confirmation)',
  'Other',
] as const

// Referenced by validation.ts (R7) and the soft-blocks admin flow — kept as
// one named constant so the two never drift out of sync with each other.
export const KNOCKOUT_HOLD_REASON: string = BLOCK_REASONS[1]

// Written by the public organiser self-service reserve route — never
// user-editable, this is the marker an admin's booking-list view uses to
// spot a hold that came from that flow rather than an internal block.
export const ORGANISER_SELF_SERVICE_REASON: string = BLOCK_REASONS[3]

// ── Player performance stats (analytics DB, see src/lib/playerStats.ts) ───

export interface PlayerStatsTotals {
  matches:        number
  battingInnings: number
  bowlingInnings: number
  runs:           number
  balls:          number
  notOuts:        number
  battingAverage: number | null
  strikeRate:     number | null
  fours:          number
  sixes:          number
  wickets:        number
  ballsBowled:    number
  oversBowled:    string        // display form, e.g. "12.4" (12 overs, 4 balls)
  runsConceded:   number
  economy:        number | null
  bowlingStrikeRate: number | null   // balls per wicket
  catches:        number
  runOuts:        number
  stumpings:      number
  mvpPoints:      number
  battingMvp:     number
  bowlingMvp:     number
  fieldingMvp:    number
}

export interface LeaderboardRow {
  playerId:      string
  playerName:    string
  cricheroesUrl: string | null
  photoUrl:      string | null
  stats:         PlayerStatsTotals
  centuries:     number
  halfCenturies: number
}

// Top run-scorer at one batting position (1-12), aggregated across the
// currently-filtered match set on /leaderboard's Detailed → Bat tab. A
// runs tie is broken by fewest innings (the more efficient knock) —
// `players` holds more than one entry only if both runs AND innings are
// still tied, the tie-inclusive fallback bestByAll() in
// src/lib/leaderboardMilestones.ts uses in the same situation. See
// features/leaderboard.md's "Runs by Batting Position" section.
export interface BattingPositionLeader {
  position: number
  runs:     number
  players:  { playerId: string; playerName: string; cricheroesUrl: string | null }[]
}

export interface RecentForm {
  matches: number
  runs:    number
  wickets: number
}

// One qualifying 50+/100+ innings, or one qualifying 3+/5+ wicket bowling
// innings, for the /leaderboard "Monthly" view and the "Overall" view's
// year-scoped Centuries/5-Wicket Hauls bands — see
// src/lib/playerStats.ts getPerformances(). Unlike LeaderboardRow
// (aggregated across every match in scope), these are single-match lines,
// since both views list every century/half-century/5-for/3-for rather than
// crowning one "most" winner. `bookingId` links the row to its match page
// (/matches/history/[bookingId]) — null only if the booking behind an
// already-synced match_id was later deleted.
export interface MonthlyInnings {
  playerId:       string
  playerName:     string
  cricheroesUrl:  string | null
  photoUrl:       string | null
  runs:           number
  balls:          number
  notOut:         boolean
  gameDate:       string | null
  format:         string | null
  tournamentName: string | null
  bookingId:      string | null
}

export interface MonthlyBowlingInnings {
  playerId:       string
  playerName:     string
  cricheroesUrl:  string | null
  photoUrl:       string | null
  wickets:        number
  runsConceded:   number
  overs:          string | number
  gameDate:       string | null
  format:         string | null
  tournamentName: string | null
  bookingId:      string | null
}

// Per-booking context stats for Captains' Corner's tap-to-expand "Form"
// panel — see src/lib/playerStats.ts getPlayerBookingContextStats() and
// src/app/api/captains-corner/context-stats/route.ts. Each field is null
// when the player has no reconciled matches in that scope (never a
// zero-filled row) so the UI can render "No matches yet" instead of a
// misleading all-zero line.
export interface BookingContextStats {
  tournament: PlayerStatsTotals | null
  ground:     PlayerStatsTotals | null
  format:     PlayerStatsTotals | null
}

// One row per match played, for the full player stats page
// (/players/[id]/stats). Each of batting/bowling/fielding is null when the
// player didn't bat/bowl/field a dismissal in that specific match — never a
// zero-filled placeholder.
export interface PlayerMatchHistoryRow {
  matchId:        string
  bookingId:      string | null
  gameDate:       string | null
  format:         string | null
  tournamentName: string | null
  opponentName:   string | null
  matchResult:    string | null
  // Derived from the analytics DB's match_stats.toss_won/toss_decision —
  // true if this player's own team batted first, false if they chased,
  // null when toss data wasn't captured for this match (older parses, or
  // a scorecard the "Toss" line couldn't be extracted from). See
  // src/lib/playerStats.ts's getPlayerMatchHistory() for the derivation.
  battedFirst:    boolean | null
  batting: {
    runs: number; balls: number; fours: number; sixes: number
    notOut: boolean; strikeRate: number | null; howOut: string | null
    // batting_stats.batting_order from the analytics DB — the real
    // scorecard "No." position. Null for rows synced before that column
    // was captured, or a match never re-synced since. See
    // .claude/rules/features/player-stats-batting-position.md.
    battingOrder: number | null
  } | null
  bowling: {
    overs: string | number; dots: number; wickets: number; runsConceded: number; economy: number | null
  } | null
  fielding: {
    catches: number; runOuts: number; stumpings: number
  } | null
}
