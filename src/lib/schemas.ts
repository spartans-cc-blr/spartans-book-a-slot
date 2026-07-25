// src/lib/schemas.ts
import { z } from 'zod'
import { isCricheroesUrl } from '@/lib/cricheroesId'

// ── SHARED CONSTANTS ────────────────────────────────────────────────────────

export const SKILLS = [
  'Right Hand Opening Batsman',
  'Right Hand Top Order Batsman',
  'Right Hand Middle Order Batsman',
  'Right Hand Lower Order Batsman',
  'Left Hand Opening Batsman',
  'Left Hand Top Order Batsman',
  'Left Hand Middle Order Batsman',
  'Right Hand Wicket Keeping Batsman',
  'Left Hand Wicket Keeping Batsman',
  'Right Arm Fast Medium Bowler',
  'Right Arm Medium Pace Bowler',
  'Right Arm Off Break Bowler',
  'Right Arm Leg Break Bowler',
  'Left Arm Fast Medium Bowler',
  'Left Arm Medium Pace Bowler',
  'Left Arm Off Break Bowler',
  'Left Arm Leg Break Bowler',
] as const

export const BLOOD_GROUPS = ['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'] as const

// Strict YYYY-MM-DD — 4-digit year only. Postgres `date` will happily accept
// a mistyped 5+ digit year (e.g. '12026-08-15'), which then throws
// `RangeError: Invalid time value` out of date-fns when rendered.
export const GAME_DATE_REGEX = /^\d{4}-\d{2}-\d{2}$/

// A previous version of this check was a loose substring regex
// (`/chshare\.link|cricheroes\.in/`) that both rejected real
// cricheroes.com profile URLs and would pass a lookalike host containing
// that substring anywhere (e.g. cricheroes.in.attacker.example). Proper
// hostname check instead — same allowlist src/lib/cricheroesId.ts treats
// as the only hosts it will ever fetch server-side.
export const cricheroesUrlSchema = z
  .string()
  .url('Must be a valid URL')
  .refine(isCricheroesUrl, 'Must be a CricHeroes URL (cricheroes.com, cricheroes.in, or chshare.link)')

// ── PLAYER SELF-EDIT (PATCH /api/players/[id]) ──────────────────────────────

export const playerSelfEditSchema = z.object({
  whatsapp: z
    .string()
    .regex(/^91\d{10}$/, 'WhatsApp must be in format 91XXXXXXXXXX')
    .optional(),
  dob: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'DOB must be YYYY-MM-DD')
    .optional(),
  jersey_name: z
    .string()
    .max(20, 'Jersey name max 20 characters')
    .optional(),
  jersey_number: z
    .number()
    .int()
    .min(0)
    .max(999)
    .optional(),
  blood_group: z
    .enum(BLOOD_GROUPS)
    .optional(),
  primary_skill: z
    .enum(SKILLS)
    .optional(),
  secondary_skill: z
    .enum(SKILLS)
    .optional(),
  cricheroes_url: cricheroesUrlSchema
    .optional()
    .or(z.literal('')),  // allow clearing the field
})

// ── PLAYER REGISTRATION (POST /api/players/register) ────────────────────────

export const playerRegisterSchema = z.object({
  token: z
    .string()
    .min(1, 'Invite token is required'),
  name: z
    .string()
    .min(2, 'Name must be at least 2 characters')
    .max(80, 'Name max 80 characters')
    .trim(),
  whatsapp: z
    .string()
    .regex(/^91\d{10}$/, 'WhatsApp must be in format 91XXXXXXXXXX')
    .optional()
    .or(z.literal('')),
  jersey_name: z
    .string()
    .max(20, 'Jersey name max 20 characters')
    .optional()
    .or(z.literal('')),
  jersey_number: z
    .number()
    .int()
    .min(0)
    .max(999)
    .optional()
    .nullable(),
  primary_skill: z
    .enum(SKILLS)
    .optional(),
  dob: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'DOB must be YYYY-MM-DD')
    .optional()
    .or(z.literal('')),
})

// ── AVAILABILITY (POST /api/player-availability) ─────────────────────────────

export const availabilitySchema = z.object({
  booking_id: z.string().uuid('booking_id must be a valid UUID'),
  response:   z.enum(['Y', 'E', 'O', 'L'], {
    message: 'response must be Y, E, O, or L',
  }),
})

// ── INVITE TOKEN GENERATION (POST /api/invite-tokens) ───────────────────────

export const inviteTokenSchema = z.object({
  // No body fields required — created_by comes from session server-side
  // Optional: note for audit purposes
  note: z.string().max(200).optional(),
})

// ── PLAYER IDENTITY RECONCILIATION (POST /api/admin/player-reconciliation) ──
// See src/lib/playerIdentityResolution.ts and
// .claude/rules/features/player-identity-resolution.md

const scorecardNameField = z.string().min(1, 'scorecard_name is required').max(120)

export const playerReconciliationConfirmSchema = z.object({
  mode:           z.literal('confirm'),
  scorecard_name: scorecardNameField,
  player_id:      z.string().uuid('player_id must be a valid UUID'),
  // 'global' writes a player_name_aliases row (applies to every match);
  // { match_id } writes a match_name_overrides row (this match only) —
  // for genuine same-name-same-match collisions the global alias can't express.
  scope: z.union([
    z.literal('global'),
    z.object({ match_id: z.string().min(1, 'match_id is required') }),
  ]),
})

export const playerReconciliationIgnoreSchema = z.object({
  mode:           z.literal('ignore'),
  scorecard_name: scorecardNameField,
})

export const playerReconciliationReconcileSchema = z.object({
  mode:           z.literal('reconcile'),
  scorecard_name: scorecardNameField,
})

export const playerReconciliationRequestSchema = z.discriminatedUnion('mode', [
  playerReconciliationConfirmSchema,
  playerReconciliationIgnoreSchema,
  playerReconciliationReconcileSchema,
])

// ── BOOKING BACKFILL (POST /api/admin/booking-backfill) ────────────────────
// Creates a Hub `bookings` row for a match that happened but was never
// entered into Hub at all (predates the portal, or was simply missed) — a
// different gap from scorecardBackfill.ts, which assumes the booking
// already exists. See src/lib/bookingBackfill.ts.

const backfillMatchIdField = z.string().min(1, 'match_id is required').max(30)

export const bookingBackfillPreviewSchema = z.object({
  dry_run:  z.literal(true),
  match_id: backfillMatchIdField,
})

export const bookingBackfillConfirmSchema = z.object({
  dry_run:       z.literal(false),
  match_id:      backfillMatchIdField,
  tournament_id: z.string().uuid('tournament_id must be a valid UUID'),
  format:        z.enum(['T20', 'T30']),
  slot_time:     z.enum(['07:30', '10:30', '12:30', '14:30']),
})

export const bookingBackfillRequestSchema = z.discriminatedUnion('dry_run', [
  bookingBackfillPreviewSchema,
  bookingBackfillConfirmSchema,
])

// ── SCORECARD VERIFICATION & RECONCILIATION ─────────────────────────────────
// POST /api/matches/[id]/verify-scorecard
// POST/DELETE /api/matches/[id]/flag-reconciliation
// See .claude/rules/features/post-match-scorecard.md

export const flagReconciliationSchema = z.object({
  note: z
    .string()
    .min(3, 'Note must be at least 3 characters')
    .max(500, 'Note max 500 characters')
    .trim(),
})

export const resolveReconciliationSchema = z.object({
  note: z.string().max(500, 'Note max 500 characters').trim().optional(),
})
