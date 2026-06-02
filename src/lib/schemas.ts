// src/lib/schemas.ts
import { z } from 'zod'

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
  cricheroes_url: z
    .string()
    .url('Must be a valid URL')
    .regex(/chshare\.link|cricheroes\.in/, 'Must be a CricHeroes URL')
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
