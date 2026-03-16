// ── Core domain types ────────────────────────────────────────────

export type BookingStatus = 'confirmed' | 'cancelled' | 'soft_block'
export type GameFormat    = 'T20' | 'T30'
export type SlotTime      = '07:30' | '10:30' | '12:30' | '14:30'
export type SlotStatus    = 'open' | 'booked' | 'soft_block' | 'clash' | 'na'

export interface Captain {
  id:         string
  name:       string
  active:     boolean
  created_at: string
}

export interface Tournament {
  id:                string
  name:              string
  organiser_name:    string | null
  organiser_contact: string | null
  active:            boolean
  created_at:        string
}

export interface Booking {
  id:            string
  game_date:     string        // ISO date: 'YYYY-MM-DD'
  slot_time:     SlotTime
  format:        GameFormat | null
  venue:         string | null
  captain_id:    string | null
  tournament_id: string | null
  status:        BookingStatus
  block_reason:  string | null
  notes:         string | null
  created_at:    string
  updated_at:    string
  // Joined fields (from API responses)
  captain?:      Captain
  tournament?:   Tournament
  reserved_until?: string | null
  organiser_name?: string | null
  organiser_phone?: string | null
  match_id?: string | null
  //after: match_id?: string | null
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
  game_date:     string
  slot_time:     SlotTime
  format:        GameFormat
  captain_id:    string
  tournament_id: string
  venue?:        string
  notes?:        string
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
  rule:    'R1' | 'R2' | 'R3' | 'R4' | 'R5' | 'R6'
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
