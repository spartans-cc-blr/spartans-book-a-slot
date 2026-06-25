import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { createServiceClient } from '@/lib/supabase'
import { sendPushToPlayer } from '@/lib/webpush'

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  const user = session?.user as any
  if (!user?.playerId) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
  if (!user?.isCaptain && !user?.isAdmin) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { booking_id } = await req.json()
  if (!booking_id) return NextResponse.json({ error: 'booking_id required' }, { status: 400 })

  const supabase = createServiceClient()

  const { data: rows } = await supabase
    .from('squad')
    .select('status')
    .eq('booking_id', booking_id)
    .limit(1)

  if (!rows?.length)
    return NextResponse.json({ error: 'No squad found for this booking' }, { status: 404 })

  if (!['approved', 'announced'].includes(rows[0].status))
    return NextResponse.json({ error: 'Squad must be approved by GC before announcement' }, { status: 400 })

  const { error } = await supabase
    .from('squad')
    .update({ status: 'announced' })
    .eq('booking_id', booking_id)
    .in('status', ['approved', 'announced'])

  console.log('[announce] squad flipped, attempting push for booking:', booking_id)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const [{ data: squadRows }, { data: booking }] = await Promise.all([
    supabase.from('squad').select('player_id').eq('booking_id', booking_id).eq('status', 'announced'),
    supabase.from('bookings').select('id, game_date, slot_time, format, opponent_name, tournament:tournaments(name)').eq('id', booking_id).single()
  ])

  console.log('[announce] booking fetched:', booking?.game_date, 'squad players:', squadRows?.length)

  if (squadRows?.length && booking) {
    const tournamentName = (booking.tournament as any)?.name
    const congratulations = ["You're in! 🏏", "Pads on! 🏏", "Time to shine! ⭐", "Let's go! 🔥", "Game day beckons! 🏆"]
    const congrats = congratulations[Math.floor(Math.random() * congratulations.length)]
    const body = `${congrats} ${tournamentName ? tournamentName + ' · ' : ''}${booking.format} vs ${booking.opponent_name ?? 'opponents'} · ${new Date(booking.game_date).toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short' })} ${booking.slot_time}`

    await Promise.allSettled(
      squadRows.map(row =>
        sendPushToPlayer(row.player_id, {
          title: "🏏 Squad Announced — You're Selected!",
          body,
          url: `/fixtures/${booking_id}`,
        })
      )
    )
  }
	
	// Notify GC members (and admin if they happen to be in players table)
  const { data: gcPlayers } = await supabase
    .from('players')
    .select('id')
    .eq('is_gc', true)
    .eq('status', 'active')
  
  if (gcPlayers?.length && booking) {
    const gcBody = `Squad announced for ${booking.format} vs ${booking.opponent_name ?? 'opponents'} · ${new Date(booking.game_date).toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short' })} ${booking.slot_time}`
    await Promise.allSettled(
      gcPlayers.map(p =>
        sendPushToPlayer(p.id, {
          title: '📋 Squad Announced',
          body: gcBody,
          url: `/fixtures/${booking_id}`,
        })
      )
    )
  }

  return NextResponse.json({ ok: true })
}
