import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { createServiceClient } from '@/lib/supabase'
import { validateBooking } from '@/lib/validation'
import type { CreateBookingRequest } from '@/types'

/**
 * POST /api/validate
 * Dry-run all 5 rules without saving anything.
 * Called by the booking form on every field change for live feedback.
 */
export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })

  const body: Partial<CreateBookingRequest> = await req.json()
  const { game_date, slot_time, format, captain_id, tournament_id, exclude_id } = body

  const supabase = createServiceClient()

  // Resolve captain_id server-side from tournament if not explicitly provided
  let resolvedCaptainId = captain_id
  if (!resolvedCaptainId && tournament_id) {
    const { data: t } = await supabase
      .from('tournaments')
      .select('captain_id')
      .eq('id', tournament_id)
      .single()
    resolvedCaptainId = t?.captain_id ?? null
  }

  if (!game_date || !slot_time || !format || !resolvedCaptainId || !tournament_id) {
    return NextResponse.json({ valid: false, errors: [], incomplete: true })
  }

  const [{ data: existing }, { data: captain }, { data: tournament }] =
    await Promise.all([
      exclude_id
  		? supabase.from('bookings').select('*').neq('status', 'cancelled').neq('id', exclude_id)
  		: supabase.from('bookings').select('*').neq('status', 'cancelled'),
      supabase.from('captains').select('name').eq('id', resolvedCaptainId).single(),
      supabase.from('tournaments').select('name').eq('id', tournament_id).single(),
    ])

  const result = validateBooking(
    { ...body, captain_id: resolvedCaptainId } as CreateBookingRequest,
    existing ?? [],
    captain?.name ?? 'This captain',
    tournament?.name ?? 'This tournament'
  )

  return NextResponse.json(result)
}
