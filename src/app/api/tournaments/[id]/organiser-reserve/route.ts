// POST /api/tournaments/[id]/organiser-reserve
//
// Fully public, unauthenticated — the first write path in this app that
// doesn't require a Hub session. Reachable only from the tournament share
// page, and only once an admin has flipped tournaments.organiser_self_service
// on for that tournament (off by default for every tournament).
//
// The organiser reserves one of the specific slot-bucket recommendations
// getSuggestedSlotDates() already computed (see suggestedSlots.ts) — day,
// slot_time, and format all come from that suggestion, not picked here.
// Because each suggestion is already scoped to one exact slot, a day that
// already has a *different* slot booked is not a problem — only that one
// slot needs to still be free. Re-validated live against the same
// validateBooking engine (R1-R7) every other booking path uses, so a slot
// taken between page-load and click is caught, not silently double-booked.
//
// Creates a soft_block (48h), never a confirmed booking — an admin still
// does the final confirm from /admin/bookings/[id], which already shows
// every field this route writes (tournament, format, organiser contact).

import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase'
import { validateBooking } from '@/lib/validation'
import { rateLimit, RATE_LIMITS } from '@/lib/rateLimit'
import { GAME_DATE_REGEX } from '@/lib/schemas'
import { notifyGCs } from '@/lib/webpush'
import { SLOT_TIMES, ORGANISER_SELF_SERVICE_REASON } from '@/types'
import type { CreateBookingRequest, GameFormat, SlotTime } from '@/types'

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const tournamentId = params.id
  const body = await req.json().catch(() => null)

  const game_date = body?.game_date
  const slot_time = body?.slot_time
  const format    = body?.format
  const organiser_name  = typeof body?.organiser_name  === 'string' ? body.organiser_name.trim()  : ''
  const organiser_phone = typeof body?.organiser_phone === 'string' ? body.organiser_phone.trim() : ''
  const phoneDigits = organiser_phone.replace(/\D/g, '')

  if (!game_date || !GAME_DATE_REGEX.test(game_date)) {
    return NextResponse.json({ error: 'game_date must be in YYYY-MM-DD format' }, { status: 400 })
  }
  if (!SLOT_TIMES.includes(slot_time)) {
    return NextResponse.json({ error: 'Invalid slot_time' }, { status: 400 })
  }
  if (format !== 'T20' && format !== 'T30') {
    return NextResponse.json({ error: 'Invalid format' }, { status: 400 })
  }
  if (organiser_name.length < 2) {
    return NextResponse.json({ error: 'Please enter a name.' }, { status: 400 })
  }
  if (phoneDigits.length < 8) {
    return NextResponse.json({ error: 'Please enter a valid phone number.' }, { status: 400 })
  }

  const rl = await rateLimit(req, RATE_LIMITS.organiserWrite, `${tournamentId}:${phoneDigits}`)
  if (rl) return rl

  const supabase = createServiceClient()

  const { data: tournament } = await supabase
    .from('tournaments')
    .select('id, name, captain_id, organiser_self_service, captains!tournaments_captain_id_fkey(id, name)')
    .eq('id', tournamentId)
    .single()

  if (!tournament) {
    return NextResponse.json({ error: 'Tournament not found' }, { status: 404 })
  }
  if (!tournament.organiser_self_service) {
    return NextResponse.json({ error: 'Self-service reservations are not enabled for this tournament.' }, { status: 403 })
  }

  const { data: existingRaw, error: existingErr } = await supabase
    .from('bookings')
    .select('*, tournament:tournaments!bookings_tournament_id_fkey(id, name, captain_id)')
    .neq('status', 'cancelled')

  if (existingErr) return NextResponse.json({ error: existingErr.message }, { status: 500 })

  const existing = (existingRaw ?? []).map((b: any) => ({
    ...b,
    tournament: Array.isArray(b.tournament) ? b.tournament[0] ?? null : b.tournament,
  }))

  const candidateBooking: CreateBookingRequest = {
    game_date,
    slot_time: slot_time as SlotTime,
    format: format as GameFormat,
    tournament_id: tournamentId,
    block_reason: ORGANISER_SELF_SERVICE_REASON,
  }

  const result = validateBooking(
    candidateBooking,
    existing,
    (tournament.captains as any)?.name ?? 'This captain',
    tournament.name,
    tournament.captain_id ?? null
  )

  if (!result.valid || result.warnings.length > 0) {
    return NextResponse.json({ error: 'That slot was just taken.', taken: true }, { status: 409 })
  }

  const { data, error } = await supabase
    .from('bookings')
    .insert({
      game_date,
      slot_time,
      format,
      tournament_id:  tournamentId,
      block_reason:   ORGANISER_SELF_SERVICE_REASON,
      status:         'soft_block',
      reserved_until: new Date(Date.now() + 48 * 60 * 60 * 1000).toISOString(),
      organiser_name,
      organiser_phone,
    })
    .select('id, game_date, slot_time, format, reserved_until')
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Notify GC the moment the hold is made, not just once a CricHeroes link
  // is attached (organiser-attach-url's own notifyGCs call) — an organiser
  // who reserves and never comes back to paste a match link is still an
  // actionable pending hold an admin needs to know exists. Awaited before
  // returning, same reason as every other push in this app: Vercel kills
  // fire-and-forget work the moment the response is sent.
  await notifyGCs(
    '\u{1F514} Self-service slot reserved',
    `${tournament.name} · ${game_date} · ${slot_time} — held by ${organiser_name}, match link pending`,
    `/admin/bookings/${data.id}`
  )

  return NextResponse.json({ booking: data }, { status: 201 })
}
