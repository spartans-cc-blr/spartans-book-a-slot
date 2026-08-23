// GET /api/matches/history/[bookingId]
// Signed-in members only — this returns full squad rows (player names with
// CricHeroes links), so it's gated the same way as the list route rather
// than being public like /schedule.
//
// vibe-security: also gated to bookings that actually satisfy the "past"
// predicate (status = 'confirmed' AND isPastMatch(), src/lib/matchStatus.ts)
// — the same one the list route uses. Without this, a signed-in-but-non-
// privileged request for a *future* confirmed booking's id would leak its
// in-progress squad selection (draft captain/VC/WK picks, not yet
// announced) to anyone who can guess or enumerate a booking_id. Non-past
// bookings are treated as not-found here, matching the list view's scope.

import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { createServiceClient } from '@/lib/supabase'
import { isPastMatch } from '@/lib/matchStatus'

export async function GET(
  req: NextRequest,
  { params }: { params: { bookingId: string } }
) {
  const session = await getServerSession(authOptions)
  const user = session?.user as any
  if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
  if (user?.playerStatus === 'expelled') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const today = new Date().toISOString().split('T')[0]
  const supabase = createServiceClient()

  const { data: booking, error: bookingErr } = await supabase
    .from('bookings')
    .select('id, game_date, slot_time, opponent_name, format, tournament_id, cricheroes_url, tournament:tournaments(name)')
    .eq('id', params.bookingId)
    .eq('status', 'confirmed')
    .lte('game_date', today)
    .single()

  if (bookingErr || !booking) return NextResponse.json({ error: 'Match not found' }, { status: 404 })
  if (!isPastMatch(booking.game_date, booking.slot_time, booking.format, today)) {
    return NextResponse.json({ error: 'Match not found' }, { status: 404 })
  }

  const { data: squadRows, error: squadErr } = await supabase
    .from('squad')
    .select('player_id, is_captain, is_vc, is_wk, players(id, name, cricheroes_url)')
    .eq('booking_id', params.bookingId)

  if (squadErr) return NextResponse.json({ error: squadErr.message }, { status: 500 })

  const squad = (squadRows ?? []).map((r: any) => ({
    player_id:      r.player_id,
    player_name:    r.players?.name ?? 'Unknown',
    cricheroes_url: r.players?.cricheroes_url ?? null,
    is_captain:     r.is_captain,
    is_vc:          r.is_vc,
    is_wk:          r.is_wk,
  }))

  return NextResponse.json({
    booking: {
      booking_id:      booking.id,
      game_date:       booking.game_date,
      opponent_name:   booking.opponent_name,
      format:          booking.format,
      tournament_id:   booking.tournament_id,
      tournament_name: (booking.tournament as any)?.name ?? null,
      cricheroes_url:  booking.cricheroes_url,
    },
    squad,
  })
}
