import { SiteNav } from '@/components/ui/SiteNav'
import { FixturesCard } from '@/components/fixtures/FixturesCard'
import { FixturesAvailability } from '@/components/fixtures/FixturesAvailability'
import { createServiceClient } from '@/lib/supabase'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { getISOWeek, getISOWeekYear, parseISO } from 'date-fns'
import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Upcoming Fixtures — Spartans Cricket Club',
  description: 'Upcoming match fixtures for Spartans CC players.',
}

export const revalidate = 60

// Group bookings into weekends using ISO week
function weekKey(dateStr: string): string {
  const d = parseISO(dateStr)
  return `${getISOWeekYear(d)}-W${String(getISOWeek(d)).padStart(2, '0')}`
}

export default async function FixturesPage() {
  const supabase = createServiceClient()
  const session  = await getServerSession(authOptions)
  const player   = session?.user as any
  const today    = new Date().toISOString().split('T')[0]

  const { data: bookings } = await supabase
    .from('bookings')
    .select(`
      id, game_date, slot_time, match_time, format, opponent_name, cricheroes_url,
      tournament:tournaments(name, ball_type, ground:grounds(name, maps_url, hospital_url))
    `)
    .eq('status', 'confirmed')
    .gte('game_date', today)
    .order('game_date', { ascending: true })
    .order('slot_time', { ascending: true })

  // Fetch this player's availability responses
  let existingResponses: Record<string, string> = {}
  if (player?.playerId) {
    const { data: avail } = await supabase
      .from('availability')
      .select('booking_id, response')
      .eq('player_id', player.playerId)
    existingResponses = Object.fromEntries((avail ?? []).map(r => [r.booking_id, r.response]))
  }

  const isPlayer  = !!player?.playerId && player?.playerStatus !== 'expelled'
  const isCaptain = isPlayer && !!player?.isCaptain

  // Build a weekend → bookings map for cross-match context
  const weekendBookingsMap: Record<string, { id: string; game_date: string; slot_time: string }[]> = {}
  for (const b of bookings ?? []) {
    const wk = weekKey((b as any).game_date)
    if (!weekendBookingsMap[wk]) weekendBookingsMap[wk] = []
    weekendBookingsMap[wk].push({ id: b.id, game_date: (b as any).game_date, slot_time: (b as any).slot_time })
  }

  // Build weekend → player responses map
  const weekendResponsesMap: Record<string, Record<string, string>> = {}
  for (const b of bookings ?? []) {
    const wk = weekKey((b as any).game_date)
    if (!weekendResponsesMap[wk]) weekendResponsesMap[wk] = {}
    if (existingResponses[b.id]) {
      weekendResponsesMap[wk][b.id] = existingResponses[b.id]
    }
  }

  return (
    <div className="min-h-screen bg-ink grain">
      <SiteNav activePage="fixtures" />

      {/* Hero */}
      <div className="bg-ink-2 border-b border-ink-4 px-5 md:px-8 lg:px-10 py-7 md:py-9 relative overflow-hidden">
        <div className="absolute -top-8 -right-8 w-48 h-48 rounded-full pointer-events-none"
          style={{ background: 'radial-gradient(circle, rgba(201,168,76,0.1) 0%, transparent 70%)' }} />
        <p className="text-gold text-xs font-rajdhani font-semibold tracking-[3px] uppercase mb-2 flex items-center gap-2">
          <span className="w-4 h-px bg-gold inline-block" />
          Spartans Cricket Club · Bengaluru
        </p>
        <h1 className="font-cinzel text-2xl md:text-3xl font-bold text-parchment mb-2 tracking-wide">
          Upcoming Fixtures
        </h1>
        <p className="text-muted text-sm md:text-base max-w-xl leading-relaxed font-rajdhani">
          Confirmed matches for Spartans CC. Mark your availability below each card.
        </p>

        {/* Captain link */}
        {isCaptain && (
          <a href="/captains-corner"
            className="mt-3 inline-flex items-center gap-2 font-rajdhani text-xs font-bold tracking-widest uppercase bg-gold/10 border border-gold-dim text-gold px-4 py-2 rounded hover:bg-gold/20 transition-colors">
            ⚔ Captains Corner →
          </a>
        )}
      </div>

      {/* Not registered */}
      {session && !player?.playerId && player?.playerStatus !== 'expelled' && (
        <div className="px-5 md:px-8 lg:px-10 py-3 bg-amber-950/30 border-b border-amber-800/40">
          <p className="font-rajdhani text-sm text-amber-300">
            You're signed in but not yet registered as a Spartans player.{' '}
            <a href="/join" className="text-gold underline">Complete your registration →</a>
          </p>
        </div>
      )}

      {/* Expelled */}
      {player?.playerStatus === 'expelled' && (
        <div className="px-5 md:px-8 lg:px-10 py-3 bg-red-950/30 border-b border-red-800/40">
          <p className="font-rajdhani text-sm text-red-400">
            Your account has been suspended. Contact the club admin for more information.
          </p>
        </div>
      )}

      {/* Availability legend for logged-in players */}
      {isPlayer && (
        <div className="px-5 md:px-8 lg:px-10 py-2 bg-ink-2 border-b border-ink-4 flex gap-4 flex-wrap">
          {[
            { code: 'Y', color: '#4ade80', label: 'Available' },
            { code: 'N', color: '#f87171', label: 'Not available' },
            { code: 'O', color: '#fb923c', label: 'One game this weekend' },
            { code: 'E', color: '#fbbf24', label: 'Either game same day' },
            { code: 'L', color: '#71717a', label: 'On leave' },
          ].map(item => (
            <div key={item.code} className="flex items-center gap-1.5">
              <span className="font-rajdhani text-xs font-bold" style={{ color: item.color }}>{item.code}</span>
              <span className="font-rajdhani text-xs text-zinc-600">{item.label}</span>
            </div>
          ))}
        </div>
      )}

      <div className="px-5 md:px-8 lg:px-10 py-6 max-w-2xl">
        {!bookings || bookings.length === 0 ? (
          <p className="font-rajdhani text-zinc-500 text-sm">No upcoming fixtures confirmed yet. Check back soon.</p>
        ) : (
          <div className="flex flex-col gap-4">
            {bookings.map((b: any) => {
              const wk = weekKey(b.game_date)
              return (
                <div key={b.id}>
                  <FixturesCard booking={b} />
                  <FixturesAvailability
                    bookingId={b.id}
                    slotDate={b.game_date}
                    isPlayer={isPlayer}
                    isCaptain={isCaptain}
                    initialResponse={existingResponses[b.id] ?? null}
                    weekendResponses={weekendResponsesMap[wk] ?? {}}
                    weekendBookings={weekendBookingsMap[wk] ?? []}
                  />
                </div>
              )
            })}
          </div>
        )}
      </div>

      <footer className="border-t border-ink-4 py-5 text-center font-rajdhani text-xs text-zinc-600 mt-8">
        © 2026 <span className="text-gold-dim">Spartans Cricket Club</span> · Bengaluru · Est. 2014
      </footer>
    </div>
  )
}
