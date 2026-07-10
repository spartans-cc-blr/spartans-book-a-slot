// PATCH /api/matches/history/[bookingId]/tournament
// Admin only — corrects the tournament assignment on a past match, with an
// audit trail. Deliberately separate from the general PATCH /api/bookings/[id]
// route (which also allows editing tournament_id) so this specific correction
// gets logged to squad_audit — the general route isn't being retrofitted with
// audit logging as part of this phase.

import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { createServiceClient } from '@/lib/supabase'
import { RATE_LIMITS, rateLimit } from '@/lib/rateLimit'

export async function PATCH(
  req: NextRequest,
  { params }: { params: { bookingId: string } }
) {
  const session = await getServerSession(authOptions)
  const user = session?.user as any
  if (!user?.playerId) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
  if (!user?.isAdmin) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const limited = await rateLimit(req, RATE_LIMITS.adminWrite, user.playerId)
  if (limited) return limited

  const { tournament_id } = await req.json()
  const bookingId = params.bookingId
  const supabase = createServiceClient()

  const { data: booking, error: bookingErr } = await supabase
    .from('bookings')
    .select('tournament_id')
    .eq('id', bookingId)
    .single()

  if (bookingErr || !booking) return NextResponse.json({ error: 'Match not found' }, { status: 404 })

  if (tournament_id) {
    const { data: tournament } = await supabase
      .from('tournaments')
      .select('id')
      .eq('id', tournament_id)
      .single()
    if (!tournament) return NextResponse.json({ error: 'Tournament not found' }, { status: 400 })
  }

  const nextTournamentId = tournament_id || null

  const { error: updErr } = await supabase
    .from('bookings')
    .update({ tournament_id: nextTournamentId })
    .eq('id', bookingId)

  if (updErr) return NextResponse.json({ error: updErr.message }, { status: 500 })

  const { error: auditErr } = await supabase.from('squad_audit').insert({
    booking_id: bookingId,
    action:     'tournament_corrected',
    actor_id:   user.playerId,
    note: JSON.stringify({
      from_tournament_id: booking.tournament_id,
      to_tournament_id:   nextTournamentId,
    }),
  })
  if (auditErr) console.error('[squad_audit] insert failed:', auditErr.message)

  return NextResponse.json({ ok: true, tournament_id: nextTournamentId })
}
