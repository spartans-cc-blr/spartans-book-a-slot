import { redirect } from 'next/navigation'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { createServiceClient } from '@/lib/supabase'
import { FixturesWeekendGroup } from '@/components/fixtures/FixturesWeekend'
import { ShareMatchButton } from '@/components/fixtures/ShareMatchButton'

export const revalidate = 60

export default async function MatchCardPage({ params }: { params: { id: string } }) {
  const supabase = createServiceClient()
  const session  = await getServerSession(authOptions)
  const user     = session?.user as any
  const isPlayer  = !!user?.playerId
  const isCaptain = !!user?.isCaptain || !!user?.isAdmin

  // Fetch the single booking
  const { data: booking, error } = await supabase
    .from('bookings')
    .select(`
      id, game_date, slot_time, format, opponent_name, cricheroes_url, match_stage, match_time,
      tournament:tournaments(name, ball_type, ground:grounds(name, maps_url, hospital_url))
    `)
    .eq('id', params.id)
    .eq('status', 'confirmed')
    .single()

  if (error || !booking) redirect('/fixtures')

  // Check match hasn't expired
  function isExpired(gameDate: string, slotTime: string, format: string): boolean {
    const end = new Date(`${gameDate}T${slotTime}:00+05:30`)
    end.setTime(end.getTime() + (format === 'T30' ? 5.5 : 3.5) * 60 * 60 * 1000)
    return new Date() >= end
  }
  if (isExpired(booking.game_date, booking.slot_time, booking.format)) redirect('/fixtures')

  // Match status
  function getMatchStatus(gameDate: string, slotTime: string, format: string): 'upcoming' | 'in_progress' {
    const start = new Date(`${gameDate}T${slotTime}:00+05:30`)
    const end   = new Date(start.getTime() + (format === 'T30' ? 5.5 : 3.5) * 60 * 60 * 1000)
    const now   = new Date()
    return now >= start && now < end ? 'in_progress' : 'upcoming'
  }

  // Fetch announced squad
  const { data: squadRows } = await supabase
    .from('squad')
    .select('is_captain, is_vc, is_wk, player:players(id, name, jersey_name, jersey_number, primary_skill)')
    .eq('booking_id', booking.id)
    .eq('status', 'announced')

  const squad = (squadRows ?? [])
    .filter(r => r.player)
    .map(r => ({
      ...r.player,
      is_match_captain: r.is_captain,
      is_vc:            r.is_vc,
      is_wk:            r.is_wk,
    })) as any[]  

  // Fetch player's existing response if logged in
  let initialResponse: string | null = null
  if (isPlayer && user?.playerId) {
    const { data: av } = await supabase
      .from('availability')
      .select('response')
      .eq('booking_id', booking.id)
      .eq('player_id', user.playerId)
      .single()
    initialResponse = av?.response ?? null
  }

  const entry = {
    id:              booking.id,
    game_date:       booking.game_date,
    slot_time:       booking.slot_time,
    initialResponse,
    matchStatus:     getMatchStatus(booking.game_date, booking.slot_time, booking.format) as 'upcoming' | 'in_progress',
    squad,
    cardData:        { ...booking, squad, matchStatus: getMatchStatus(booking.game_date, booking.slot_time, booking.format) },
  }

  return (
    <main style={{
      minHeight: '100dvh',
      background: '#0D1117',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      padding: '24px 16px 48px',
      fontFamily: "'DM Sans', 'Segoe UI', sans-serif",
    }}>
      {/* Header */}
      <div style={{ width: '100%', maxWidth: '480px', marginBottom: '16px' }}>
        <a href="/fixtures" style={{
          fontSize: '12px', color: '#6B7280', textDecoration: 'none',
          display: 'inline-flex', alignItems: 'center', gap: '4px',
        }}>
          ← All fixtures
        </a>
      </div>

      {/* Card + availability — reuses the exact same components */}
      <div style={{ width: '100%', maxWidth: '480px' }}>
        <FixturesWeekendGroup
          isPlayer={isPlayer}
          isCaptain={isCaptain}
          bookings={[entry]}
          initialWeekendResponses={
            initialResponse ? { [booking.id]: initialResponse } : {}
          }
        />
      </div>

      {/* Share button */}
      <div style={{ width: '100%', maxWidth: '480px', marginTop: '16px' }}>
        <ShareMatchButton bookingId={booking.id} />
      </div>
    </main>
  )
}