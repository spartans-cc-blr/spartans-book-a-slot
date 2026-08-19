import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { createServiceClient } from '@/lib/supabase'
import { GAME_DATE_REGEX, bookingRuleOverridesSchema } from '@/lib/schemas'
import { ORGANISER_SELF_SERVICE_REASON } from '@/types'

export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const session = await getServerSession(authOptions)
  const user = session?.user as any
  if (!user?.isAdmin) return NextResponse.json({ error: 'Unauthorised' }, { status: 403 })

  const supabase = createServiceClient()

  const [{ data, error }, { data: overrideRows }] = await Promise.all([
    supabase
      .from('bookings')
      .select(`
        *,
        tournament:tournaments!bookings_tournament_id_fkey(
          *, captains!tournaments_captain_id_fkey(id, name, players(cricheroes_url))
        ),
        ground:grounds(id, name, maps_url, hospital_url),
        captain:captains!bookings_captain_id_fkey(id, name, players(cricheroes_url, whatsapp))
      `)
      .eq('id', params.id)
      .single(),
    supabase
      .from('booking_rule_overrides')
      .select('rule, reason, created_at')
      .eq('booking_id', params.id)
      .order('created_at', { ascending: false }),
  ])

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Most recent reason per rule — pre-fills the edit page's override box so
  // an admin reopening an already-overridden booking doesn't have to retype
  // it. Only matters for rules still actually failing; the page itself
  // drops any rule that isn't (see ruleChecks pruning in the edit page).
  const overrides: Record<string, string> = {}
  for (const row of overrideRows ?? []) {
    if (!(row.rule in overrides)) overrides[row.rule] = row.reason
  }

  return NextResponse.json({ booking: data, overrides })
}

// ── PATCH /api/bookings/[id] ──────────────────────────────────────
// Update status (cancel, restore) or edit fields.
export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
 const session = await getServerSession(authOptions)
const user = session?.user as any
if (!user?.isAdmin) return NextResponse.json({ error: 'Unauthorised' }, { status: 403 })

  const body = await req.json()

  // vibe-security: overrides is not a bookings column — parsed separately below, never spread into the update
  const { overrides: rawOverrides, ...safeUpdates } = body

  // match_fee_override is admin-only — strip it from non-admin requests
  //const user = session.user as any
  if (!user?.isAdmin && 'match_fee_override' in safeUpdates) {
    delete safeUpdates.match_fee_override
  }

  if (safeUpdates.game_date && !GAME_DATE_REGEX.test(safeUpdates.game_date)) {
    return NextResponse.json({ error: 'game_date must be in YYYY-MM-DD format' }, { status: 400 })
  }

  const overridesParsed = bookingRuleOverridesSchema.safeParse(rawOverrides)
  if (!overridesParsed.success) {
    return NextResponse.json({ error: overridesParsed.error.issues[0]?.message ?? 'Invalid overrides' }, { status: 400 })
  }
  const overrides = overridesParsed.data ?? []

  const supabase = createServiceClient()

  const { data: existing } = await supabase
  .from('bookings')
  .select('game_date, slot_time, status, block_reason, cricheroes_url, captain_id')
  .eq('id', params.id)
  .single()

  const dateOrSlotChanged =
    (safeUpdates.game_date && safeUpdates.game_date !== existing?.game_date) ||
    (safeUpdates.slot_time && safeUpdates.slot_time !== existing?.slot_time)

  // vibe-security: never trust a client-supplied FK without checking it's
  // real — but only when it's actually changing. The edit page always
  // re-sends the booking's already-stored captain_id on every save (even
  // one that only touches an unrelated field), so re-validating it
  // unconditionally would make a booking permanently uneditable the moment
  // its assigned captain is later deactivated. Only a genuine reassignment
  // needs to point at someone currently active.
  if (safeUpdates.captain_id && safeUpdates.captain_id !== existing?.captain_id) {
    const { data: cap } = await supabase.from('captains').select('id, active').eq('id', safeUpdates.captain_id).single()
    if (!cap) return NextResponse.json({ error: 'Captain not found' }, { status: 400 })
    if (!cap.active) return NextResponse.json({ error: 'Captain is not active' }, { status: 400 })
  }
  if (safeUpdates.ground_id) {
    const { data: gr } = await supabase.from('grounds').select('id').eq('id', safeUpdates.ground_id).single()
    if (!gr) return NextResponse.json({ error: 'Ground not found' }, { status: 400 })
  }

  // An organiser self-service hold must not go permanent until the
  // organiser is actually ready — i.e. a CricHeroes match link exists,
  // whether the organiser attached it themselves (organiser-attach-url) or
  // the admin pasted it in here. Client-side this is mirrored by the
  // Confirm Booking button's disabled state on /admin/bookings/[id], but
  // that's a UX nicety, not the real gate — this is, so the rule holds
  // regardless of which path a PATCH comes from.
  if (
    safeUpdates.status === 'confirmed' &&
    existing?.status === 'soft_block' &&
    existing.block_reason === ORGANISER_SELF_SERVICE_REASON
  ) {
    const resultingCricheroesUrl = 'cricheroes_url' in safeUpdates
      ? safeUpdates.cricheroes_url
      : existing.cricheroes_url
    if (!resultingCricheroesUrl) {
      return NextResponse.json(
        { error: 'Cannot confirm yet — waiting for the organiser\'s CricHeroes match link. Add it below or wait for them to attach it via the share page.' },
        { status: 400 }
      )
    }
  }

  const { data, error } = await supabase
    .from('bookings')
    .update({ ...safeUpdates, updated_at: new Date().toISOString() })
    .eq('id', params.id)
    .select(`
      *,
      tournament:tournaments!bookings_tournament_id_fkey(
        *, captains!tournaments_captain_id_fkey(id, name, players(cricheroes_url))
      ),
      ground:grounds(id, name, maps_url, hospital_url),
      captain:captains!bookings_captain_id_fkey(id, name, players(cricheroes_url, whatsapp))
    `)
    .single()

  if (dateOrSlotChanged) {
    await supabase.from('availability').delete().eq('booking_id', params.id)
  }

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Log any rule overrides the admin acknowledged while editing. Note:
  // PATCH never re-runs validateBooking server-side (see architecture.md
  // §5's booking flow — edits aren't rule-checked the way creates are), so
  // this is a best-effort acknowledgement log, not a bypass-and-log like
  // POST /api/bookings — a failure here doesn't block the save, since
  // nothing was actually blocked to begin with.
  let overrideLogError: string | null = null
  if (overrides.length > 0) {
    const { error: overrideError } = await supabase.from('booking_rule_overrides').insert(
      overrides.map(o => ({
        booking_id:          params.id,
        rule:                o.rule,
        rule_message:        o.message ?? `${o.rule} flagged on edit`,
        reason:              o.reason,
        overridden_by:       user.playerId ?? null,
        overridden_by_email: user.email ?? 'unknown',
      }))
    )
    if (overrideError) overrideLogError = overrideError.message
  }

  return NextResponse.json({ booking: data, ...(overrideLogError ? { overrideLogError } : {}) })
}

// ── DELETE /api/bookings/[id] ─────────────────────────────────────
// Soft-deletes by setting status to 'cancelled'. Slot reopens immediately.
export async function DELETE(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
 const session = await getServerSession(authOptions)
const user = session?.user as any
if (!user?.isAdmin) return NextResponse.json({ error: 'Unauthorised' }, { status: 403 })

  const supabase = createServiceClient()

  const { error } = await supabase
    .from('bookings')
    .update({ status: 'cancelled', updated_at: new Date().toISOString() })
    .eq('id', params.id)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ success: true })
}
