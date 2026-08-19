import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { createServiceClient } from '@/lib/supabase'
import { validateBooking } from '@/lib/validation'
import { GAME_DATE_REGEX, bookingRuleOverridesSchema } from '@/lib/schemas'
import type { CreateBookingRequest } from '@/types'



// ── GET /api/bookings ─────────────────────────────────────────────
// Admin only. Returns all bookings with tournament (including captain) joined.
export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions)
  const user = session?.user as any
  if (!user?.isAdmin) return NextResponse.json({ error: 'Unauthorised' }, { status: 403 })

  const supabase = createServiceClient()
  const { searchParams } = req.nextUrl
  const status = searchParams.get('status')
  const from   = searchParams.get('from')
  const to     = searchParams.get('to')

  let query = supabase
    .from('bookings')
    .select(`
      *,
      tournament:tournaments!bookings_tournament_id_fkey(
        *, captains!tournaments_captain_id_fkey(id, name, players(cricheroes_url))
      ),
      ground:grounds(id, name, maps_url, hospital_url),
      captain:captains!bookings_captain_id_fkey(id, name, players(cricheroes_url, whatsapp))
    `)
    .order('game_date', { ascending: true })
    .order('slot_time', { ascending: true })

  if (status) query = query.eq('status', status)
  if (from)   query = query.gte('game_date', from)
  if (to)     query = query.lte('game_date', to)

  const { data, error } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ bookings: data })
}

// ── POST /api/bookings ────────────────────────────────────────────
// Admin only. Creates a confirmed booking after running all 5 rule checks.
export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  const user = session?.user as any
  if (!user?.isAdmin) return NextResponse.json({ error: 'Unauthorised' }, { status: 403 })

  const body = await req.json()
  // vibe-security: overrides is parsed separately below (Zod-validated) — never spread into the insert
  const { overrides: rawOverrides, ...safeBody } = body
  const {
    game_date, slot_time, format, tournament_id,
    notes, opponent_name, match_id, cricheroes_url,
    match_time, match_stage, match_fee_override,
    // Both validated below and defaulted from the tournament when the key
    // is omitted entirely — see the resolution after the tournament fetch.
    captain_id, ground_id,
  } = safeBody

  if (!game_date || !slot_time || !format || !tournament_id) {
    return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
  }

  if (!GAME_DATE_REGEX.test(game_date)) {
    return NextResponse.json({ error: 'game_date must be in YYYY-MM-DD format' }, { status: 400 })
  }

  const overridesParsed = bookingRuleOverridesSchema.safeParse(rawOverrides)
  if (!overridesParsed.success) {
    return NextResponse.json({ error: overridesParsed.error.issues[0]?.message ?? 'Invalid overrides' }, { status: 400 })
  }
  const overrides = overridesParsed.data ?? []
  const overriddenRules = new Set(overrides.map(o => o.rule))

  const supabase = createServiceClient()

  const [{ data: existingRaw }, { data: tournament }] = await Promise.all([
    supabase
      .from('bookings')
      .select('*, tournament:tournaments!bookings_tournament_id_fkey(id, name, captain_id)')
      .neq('status', 'cancelled'),
    supabase
      .from('tournaments')
      .select('id, name, captain_id, ground_id, captains!tournaments_captain_id_fkey(id, name, player_id)')
      .eq('id', tournament_id)
      .single(),
  ])

  if (!tournament) {
    return NextResponse.json({ error: 'Tournament not found' }, { status: 400 })
  }

  const thisTournamentCaptainPlayerId = (tournament.captains as any)?.player_id ?? null

  // Omitted key → default to the tournament's own ground/captain (this is
  // what the admin form's pickers already pre-fill client-side, but the
  // server defends the same way for any other caller, e.g. the NLP quick-
  // command bar). An explicit null is a deliberate "no captain/ground"
  // override and is respected as such, not coerced back to the default.
  const resolvedCaptainId: string | null =
    'captain_id' in safeBody ? (captain_id ?? null) : (tournament.captain_id ?? null)
  const resolvedGroundId: string | null =
    'ground_id' in safeBody ? (ground_id ?? null) : (tournament.ground_id ?? null)

  // vibe-security: never trust a client-supplied FK without checking it's real
  if (resolvedCaptainId) {
    const { data: cap } = await supabase.from('captains').select('id, active').eq('id', resolvedCaptainId).single()
    if (!cap) return NextResponse.json({ error: 'Captain not found' }, { status: 400 })
    if (!cap.active) return NextResponse.json({ error: 'Captain is not active' }, { status: 400 })
  }
  if (resolvedGroundId) {
    const { data: gr } = await supabase.from('grounds').select('id').eq('id', resolvedGroundId).single()
    if (!gr) return NextResponse.json({ error: 'Ground not found' }, { status: 400 })
  }

  const existing = (existingRaw ?? []).map((b: any) => ({
    ...b,
    tournament: Array.isArray(b.tournament) ? b.tournament[0] ?? null : b.tournament,
  }))

  // R8 input — this exact game_date's future-availability rows for the
  // tournament's own leading captain only (see validateBooking in
  // src/lib/validation.ts).
  const { data: captainFutureAvailability } = thisTournamentCaptainPlayerId
    ? await supabase
        .from('player_future_availability')
        .select('game_date, slot_time, response')
        .eq('player_id', thisTournamentCaptainPlayerId)
        .eq('game_date', game_date)
    : { data: [] as { game_date: string; slot_time: string; response: string }[] }

  const result = validateBooking(
    safeBody as CreateBookingRequest,
    existing,
    (tournament.captains as any)?.name ?? 'This captain',
    tournament.name,
    tournament.captain_id ?? null,
    overriddenRules,
    captainFutureAvailability ?? []
  )

  if (!result.valid) {
    return NextResponse.json({ errors: result.errors }, { status: 422 })
  }

  const { data, error } = await supabase
    .from('bookings')
    .insert({
      game_date, slot_time, format,
      tournament_id,
      captain_id:         resolvedCaptainId,
      ground_id:          resolvedGroundId,
      notes:              notes ?? null,
      status:             'confirmed',
      opponent_name:      opponent_name ?? null,
      match_id:           match_id ?? null,
      cricheroes_url:     cricheroes_url ?? null,
      match_time:         match_time ?? null,
      match_stage:        match_stage ?? null,
      match_fee_override: match_fee_override ?? null,
    })
    .select(`
      *,
      tournament:tournaments!bookings_tournament_id_fkey(
        *, captains!tournaments_captain_id_fkey(id, name, players(cricheroes_url))
      ),
      ground:grounds(id, name, maps_url, hospital_url),
      captain:captains!bookings_captain_id_fkey(id, name, players(cricheroes_url, whatsapp))
    `)
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // ── Carry pre-filled future availability into the real availability
  // table for this exact date + slot, for every player who filled it in —
  // not just the captain. Failure here must not roll back the booking (the
  // booking is real regardless of whether a pre-fill happened to exist);
  // log and continue, same posture as the audit-insert error handling in
  // captain-availability/route.ts. Only this route (confirmed bookings) —
  // not /api/bookings/reserve or the organiser self-service reserve route,
  // both of which create soft_block holds that might expire, not real games.
  const { data: futureRows } = await supabase
    .from('player_future_availability')
    .select('player_id, response')
    .eq('game_date', game_date)
    .eq('slot_time', slot_time)

  if (futureRows && futureRows.length > 0) {
    const availabilityRows = futureRows.map(r => ({
      player_id:     r.player_id,
      booking_id:    data.id,
      response:      r.response,
      updated_by:    null,
      update_source: 'future_carryover',
    }))
    const { error: carryError } = await supabase
      .from('availability')
      .insert(availabilityRows)

    if (carryError) {
      console.error('Future-availability carryover failed:', carryError.message)
    } else {
      const auditRows = futureRows.map(r => ({
        player_id:     r.player_id,
        booking_id:    data.id,
        old_response:  null,
        new_response:  r.response,
        // availability_audit.updated_by is NOT NULL — credit the player
        // themselves, same convention player-availability/route.ts uses
        // for a genuine self-update audit row.
        updated_by:    r.player_id,
        update_source: 'future_carryover',
        note:          'Auto-filled from future availability',
      }))
      const { error: auditError } = await supabase.from('availability_audit').insert(auditRows)
      if (auditError) console.error('Carryover audit insert failed:', auditError.message)
    }
  }

  // Log every rule the admin actually overrode (only ones that genuinely
  // fired — see validateBooking's `overridden` list, not just whatever the
  // client sent) as an immutable audit row. A booking created by bypassing
  // a rule must never exist without its reason logged, so a failure here
  // rolls the booking back rather than silently dropping the audit trail.
  if (result.overridden && result.overridden.length > 0) {
    const reasonByRule = new Map(overrides.map(o => [o.rule, o.reason]))
    const overrideRows = result.overridden.map(e => ({
      booking_id:          data.id,
      rule:                e.rule,
      rule_message:        e.message,
      reason:              reasonByRule.get(e.rule) ?? '',
      overridden_by:       user.playerId ?? null,
      overridden_by_email: user.email ?? 'unknown',
    }))

    const { error: overrideError } = await supabase
      .from('booking_rule_overrides')
      .insert(overrideRows)

    if (overrideError) {
      await supabase.from('bookings').delete().eq('id', data.id)
      return NextResponse.json(
        { error: `Booking not created — could not log rule override (${overrideError.message}). Please retry.` },
        { status: 500 }
      )
    }
  }

  return NextResponse.json({ booking: data }, { status: 201 })
}
