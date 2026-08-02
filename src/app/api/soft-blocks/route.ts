import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { createServiceClient } from '@/lib/supabase'
import { validateBooking } from '@/lib/validation'
import type { CreateSoftBlockRequest, CreateBookingRequest } from '@/types'
import { KNOCKOUT_HOLD_REASON } from '@/types'
import { GAME_DATE_REGEX } from '@/lib/schemas'

type SoftBlockRequestBody = CreateSoftBlockRequest & {
  tournament_id?: string | null
  format?:        string | null
}

export type KnockoutConflict = {
  slot_time:       string
  tournament_name: string | null
  opponent_name:   string | null
  organiser_name:  string | null
  organiser_phone: string | null
}

// ── GET /api/soft-blocks ──────────────────────────────────────────
export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions)
  const user = session?.user as any
  if (!user?.isAdmin) return NextResponse.json({ error: 'Unauthorised' }, { status: 403 })

  const supabase = createServiceClient()
  const { data, error } = await supabase
    .from('bookings')
    .select('*')
    .eq('status', 'soft_block')
    .order('game_date')

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ softBlocks: data })
}

// ── POST /api/soft-blocks ─────────────────────────────────────────
export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  const user = session?.user as any
  if (!user?.isAdmin) return NextResponse.json({ error: 'Unauthorised' }, { status: 403 })

  const body: SoftBlockRequestBody = await req.json()
  const { game_date, slot_time, block_reason, notes, tournament_id, format } = body

  if (!game_date || !slot_time || !block_reason) {
    return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
  }

  if (!GAME_DATE_REGEX.test(game_date)) {
    return NextResponse.json({ error: 'game_date must be in YYYY-MM-DD format' }, { status: 400 })
  }

  const supabase = createServiceClient()

  // ── Tournament-linked holds (e.g. Knockout) — run the full rules engine
  // (R1-R7), same one /api/bookings uses. Everything else below this branch
  // keeps the original bare "slot already taken" check, unchanged.
  if (tournament_id) {
    if (format !== 'T20' && format !== 'T30') {
      return NextResponse.json({ error: 'format must be T20 or T30 when linking a hold to a tournament' }, { status: 400 })
    }

    const [{ data: existingRaw }, { data: tournament }] = await Promise.all([
      supabase
        .from('bookings')
        .select('*, tournament:tournaments!bookings_tournament_id_fkey(id, name, captain_id)')
        .neq('status', 'cancelled'),
      supabase
        .from('tournaments')
        .select('id, name, captain_id, captains!tournaments_captain_id_fkey(id, name)')
        .eq('id', tournament_id)
        .single(),
    ])

    if (!tournament) {
      return NextResponse.json({ error: 'Tournament not found' }, { status: 400 })
    }

    const existing = (existingRaw ?? []).map((b: any) => ({
      ...b,
      tournament: Array.isArray(b.tournament) ? b.tournament[0] ?? null : b.tournament,
    }))

    const candidate: CreateBookingRequest = {
      game_date, slot_time, format, tournament_id, block_reason,
    }

    const result = validateBooking(
      candidate,
      existing,
      (tournament.captains as any)?.name ?? 'This captain',
      tournament.name,
      tournament.captain_id ?? null
    )

    if (!result.valid) {
      return NextResponse.json({ errors: result.errors }, { status: 422 })
    }

    // R7 warning — the knockout hold is being placed against a day that
    // already has an earlier slot taken. Identify that specific booking so
    // the UI can offer a one-tap reschedule nudge to its own organiser.
    let conflict: KnockoutConflict | null = null
    const hasR7Warning = result.warnings.some(w => w.rule === 'R7')
    if (hasR7Warning && block_reason === KNOCKOUT_HOLD_REASON) {
      const blocking = existing
        .filter((b: any) => b.game_date === game_date && b.slot_time < slot_time)
        .sort((a: any, b: any) => a.slot_time.localeCompare(b.slot_time))[0]
      if (blocking) {
        conflict = {
          slot_time:       blocking.slot_time,
          tournament_name: blocking.tournament?.name ?? null,
          opponent_name:   blocking.opponent_name ?? null,
          organiser_name:  blocking.organiser_name ?? null,
          organiser_phone: blocking.organiser_phone ?? null,
        }
      }
    }

    const { data, error } = await supabase
      .from('bookings')
      .insert({
        game_date,
        slot_time,
        format,
        tournament_id,
        block_reason,
        notes: notes ?? null,
        status: 'soft_block',
        reserved_until: new Date(Date.now() + 48 * 60 * 60 * 1000).toISOString(),
        organiser_name: 'Internal — Coordinator',
      })
      .select()
      .single()

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ softBlock: data, conflict }, { status: 201 })
  }

  // ── Existing behaviour — no tournament linkage, unchanged ──────────
  const { data: existing } = await supabase
    .from('bookings')
    .select('id')
    .eq('game_date', game_date)
    .eq('slot_time', slot_time)
    .neq('status', 'cancelled')
    .maybeSingle()

  if (existing) {
    return NextResponse.json(
      { error: 'This slot is already booked or reserved.' },
      { status: 422 }
    )
  }

  const { data, error } = await supabase
    .from('bookings')
    .insert({
      game_date,
      slot_time,
      block_reason,
      notes: notes ?? null,
      status: 'soft_block',
      format: null,
      tournament_id: null,
      reserved_until: new Date(Date.now() + 48 * 60 * 60 * 1000).toISOString(),
      organiser_name: 'Internal — Coordinator',
    })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ softBlock: data, conflict: null }, { status: 201 })
}
