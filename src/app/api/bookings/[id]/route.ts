import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { createServiceClient } from '@/lib/supabase'
import { GAME_DATE_REGEX, bookingRuleOverridesSchema } from '@/lib/schemas'

export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const session = await getServerSession(authOptions)
  const user = session?.user as any
  if (!user?.isAdmin) return NextResponse.json({ error: 'Unauthorised' }, { status: 403 })

  const supabase = createServiceClient()

  const { data, error } = await supabase
    .from('bookings')
    .select(`
      *,
      tournament:tournaments!bookings_tournament_id_fkey(
        *, captains!tournaments_captain_id_fkey(id, name, players(cricheroes_url))
      )
    `)
    .eq('id', params.id)
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ booking: data })
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

  // vibe-security: strip captain_id — captain is always derived from tournament
  // vibe-security: overrides is not a bookings column — parsed separately below, never spread into the update
  const { captain_id: _dropped, overrides: rawOverrides, ...safeUpdates } = body

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
  .select('game_date, slot_time')
  .eq('id', params.id)
  .single()

  const dateOrSlotChanged =
    (safeUpdates.game_date && safeUpdates.game_date !== existing?.game_date) ||
    (safeUpdates.slot_time && safeUpdates.slot_time !== existing?.slot_time)

  const { data, error } = await supabase
    .from('bookings')
    .update({ ...safeUpdates, updated_at: new Date().toISOString() })
    .eq('id', params.id)
    .select(`
      *,
      tournament:tournaments!bookings_tournament_id_fkey(
        *, captains!tournaments_captain_id_fkey(id, name, players(cricheroes_url))
      )
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
