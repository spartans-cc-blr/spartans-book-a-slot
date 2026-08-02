// ── Core domain types ────────────────────────────────────────────

export type BookingStatus = 'confirmed' | 'cancelled' | 'soft_block'
export type GameFormat    = 'T20' | 'T30'
export type SlotTime      = '07:30' | '10:30' | '12:30' | '14:30'
export type SlotStatus = 'open' | 'booked' | 'soft_block' | 'clash' | 't20only' | 'na'

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
  venue:         string | null
  tournament_id: string | null
  status:        BookingStatus
  block_reason:  string | null
  notes:         string | null
  created_at:    string
  updated_at:    string
  // Joined fields (from API responses)
  tournament?:   Tournament & {
    captain_id: string | null
    captains: { id: string; name: string; players: { cricheroes_url: string | null } | null } | null
  }
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
  tournament_id:  string        // captain derived server-side from this
  venue?:         string | null
  notes?:         string | null
  opponent_name?: string | null
  match_id?:      string | null
  match_stage?:   string | null
  match_time?:    string | null
  cricheroes_url?: string | null
  exclude_id?:    string
  block_reason?:  string | null  // set when this candidate is itself a soft-block hold (e.g. a Knockout hold) — read by R7
}

export interface CreateSoftBlockRequest {
  game_date:    string
  slot_time:    SlotTime
  block_reason: string
  notes?:       string
}

export interface ValidationResult {
  valid:    boolean
  errors:   ValidationError[]
  warnings: ValidationError[]
}

export interface ValidationError {
  rule:    'R1' | 'R2' | 'R3' | 'R4' | 'R5' | 'R6' | 'R7'
  message: string
}

// ── Rule check context (used in live form validation) ─────────────

export interface RuleCheckItem {
  rule:    string
  label:   string
  status:  'pass' | 'fail' | 'pending' | 'warn'
  message: string
}

export const SLOT_TIMES: SlotTime[] = ['07:30', '10:30', '12:30', '14:30']

export const SLOT_FORMATS: Record<SlotTime, GameFormat[]> = {
  '07:30': ['T20', 'T30'],
  '10:30': ['T20'],
  '12:30': ['T20', 'T30'],
  '14:30': ['T20'],
}

export const BLOCK_REASONS = [
  'Club Event',
  'Reserved for Knockout (pending confirmation)',
  'Practice / Internal Game',
  'Other',
] as const

// Referenced by validation.ts (R7) and the soft-blocks admin flow — kept as
// one named constant so the two never drift out of sync with each other.
export const KNOCKOUT_HOLD_REASON: string = BLOCK_REASONS[1]

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

export interface RecentForm {
  matches: number
  runs:    number
  wickets: number
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
  batting: {
    runs: number; balls: number; fours: number; sixes: number
    notOut: boolean; strikeRate: number | null
  } | null
  bowling: {
    overs: string | number; wickets: number; runsConceded: number; economy: number | null
  } | null
  fielding: {
    catches: number; runOuts: number; stumpings: number
  } | null
}
