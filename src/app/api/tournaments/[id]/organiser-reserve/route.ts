// POST /api/tournaments/[id]/organiser-reserve
//
// Fully public, unauthenticated — the first write path in this app that
// doesn't require a Hub session. Reachable only from the tournament share
// page, and only once an admin has flipped tournaments.organiser_self_service
// on for that tournament (off by default for every tournament).
//
// The organiser never picks a slot_time — only ever one of the fully-open
// dates the share page already showed them (mirroring getSuggestedOpenDates'
// own "only a wide-open day counts" rule, re-checked here against live data
// so a date taken between page-load and click is caught, not silently
// double-booked). A slot_time/format is picked server-side from this
// tournament's own recent format mix, walked through the same validateBooking
// engine (R1-R7) every other booking path uses.
//
// Creates a soft_block (48h), never a confirmed booking — an admin still
// does the final confirm from /admin/bookings/[id], which already shows
// every field this route writes (tournament, format, organiser contact).

import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase'
import { validateBooking } from '@/lib/validation'
import { rateLimit, RATE_LIMITS } from '@/lib/rateLimit'
import { GAME_DATE_REGEX } from '@/lib/schemas'
import { SLOT_TIMES, SLOT_FORMATS, ORGANISER_SELF_SERVICE_REASON } from '@/types'
import type { CreateBookingRequest, GameFormat, SlotTime } from '@/types'

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const tournamentId = params.id
  const body = await req.json().catch(() => null)

  const game_date = body?.game_date
  const organiser_name  = typeof body?.organiser_name  === 'string' ? body.organiser_name.trim()  : ''
  const organiser_phone = typeof body?.organiser_phone === 'string' ? body.organiser_phone.trim() : ''
  const phoneDigits = organiser_phone.replace(/\D/g, '')

  if (!game_date || !GAME_DATE_REGEX.test(game_date)) {
    return NextResponse.json({ error: 'game_date must be in YYYY-MM-DD format' }, { status: 400 })
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

  const [{ data: existingRaw }, { data: ownGames }] = await Promise.all([
    supabase
      .from('bookings')
      .select('*, tournament:tournaments!bookings_tournament_id_fkey(id, name, captain_id)')
      .neq('status', 'cancelled'),
    supabase
      .from('bookings')
      .select('format')
      .eq('tournament_id', tournamentId)
      .eq('status', 'confirmed'),
  ])

  const existing = (existingRaw ?? []).map((b: any) => ({
    ...b,
    tournament: Array.isArray(b.tournament) ? b.tournament[0] ?? null : b.tournament,
  }))

  // Mirror getSuggestedOpenDates' own invariant: only a genuinely wide-open
  // day (no booking of any kind, any slot_time) is reservable this way — if
  // anything landed on this date since the share page was rendered, it's no
  // longer valid and the client should move to its next candidate.
  const bookedToday = existing.some((b: any) => b.game_date === game_date)
  if (bookedToday) {
    return NextResponse.json({ error: 'That date was just taken.', taken: true }, { status: 409 })
  }

  const activeFormats = Array.from(
    new Set((ownGames ?? []).map((g: any) => g.format).filter(Boolean))
  ) as GameFormat[]
  const formatPreference: GameFormat[] = activeFormats.length ? activeFormats : ['T20', 'T30']

  const slotCandidates: { slot_time: SlotTime; format: GameFormat }[] = []
  for (const slot of SLOT_TIMES) {
    for (const fmt of SLOT_FORMATS[slot]) {
      if (formatPreference.includes(fmt)) slotCandidates.push({ slot_time: slot, format: fmt })
    }
  }

  const captainName = (tournament.captains as any)?.name ?? 'This captain'
  let picked: { slot_time: SlotTime; format: GameFormat } | null = null

  for (const candidate of slotCandidates) {
    const candidateBooking: CreateBookingRequest = {
      game_date,
      slot_time: candidate.slot_time,
      format: candidate.format,
      tournament_id: tournamentId,
      block_reason: ORGANISER_SELF_SERVICE_REASON,
    }
    const result = validateBooking(
      candidateBooking,
      existing,
      captainName,
      tournament.name,
      tournament.captain_id ?? null
    )
    if (result.valid && result.warnings.length === 0) {
      picked = candidate
      break
    }
  }

  if (!picked) {
    return NextResponse.json({ error: 'That date is no longer available.', taken: true }, { status: 409 })
  }

  const { data, error } = await supabase
    .from('bookings')
    .insert({
      game_date,
      slot_time:      picked.slot_time,
      format:         picked.format,
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

  return NextResponse.json({ booking: data }, { status: 201 })
}
