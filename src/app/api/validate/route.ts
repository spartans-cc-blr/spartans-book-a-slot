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
const user = session?.user as any
if (!user?.isAdmin) return NextResponse.json({ error: 'Unauthorised' }, { status: 403 })

  const body = await req.json()
  const { game_date, slot_time, format, tournament_id, exclude_id } = body

  if (!game_date || !slot_time || !format || !tournament_id) {
    return NextResponse.json({ valid: false, errors: [], incomplete: true })
  }

  const supabase = createServiceClient()

  const [{ data: existingRaw }, { data: tournament }] = await Promise.all([
    exclude_id
      ? supabase
          .from('bookings')
          .select('*, tournament:tournaments!bookings_tournament_id_fkey(id, name, captain_id)')
          .neq('status', 'cancelled')
          .neq('id', exclude_id)
      : supabase
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
    return NextResponse.json({ valid: false, errors: [], incomplete: true })
  }

  const thisTournamentCaptainId = tournament.captain_id ?? null
  const captainName = (tournament.captains as any)?.name ?? 'This captain'
  const tournamentName = tournament.name

  // Normalise array-wrapped FK joins from Supabase
  const existing = (existingRaw ?? []).map((b: any) => ({
    ...b,
    tournament: Array.isArray(b.tournament) ? b.tournament[0] ?? null : b.tournament,
  }))

  const result = validateBooking(
    body as CreateBookingRequest,
    existing,
    captainName,
    tournamentName,
    thisTournamentCaptainId
  )

  return NextResponse.json(result)
}
