// Public — no auth required. Renders a single tournament card
// for sharing with organisers or captains via WhatsApp link.
import { createServiceClient } from '@/lib/supabase'
import { redirect } from 'next/navigation'
import { TournamentShareCard } from '@/components/tournament-planner/TournamentShareCard'
import type { Metadata } from 'next'

export const revalidate = 300 // 5 min cache — public page

export async function generateMetadata(
  { params }: { params: { tournamentId: string } }
): Promise<Metadata> {
  const supabase = createServiceClient()
  const { data: t } = await supabase
    .from('tournaments')
    .select('name, organiser_name')
    .eq('id', params.tournamentId)
    .single()
  return {
    title: t ? `${t.name} — Spartans CC Tournament Update` : 'Tournament Update',
    description: t ? `Slot balance and schedule pace for ${t.name}` : '',
  }
}

export default async function TournamentSharePage({
  params,
}: { params: { tournamentId: string } }) {
  const supabase = createServiceClient()

  // Fetch tournament
  const { data: tournament } = await supabase
    .from('tournaments')
    .select('id, name, organiser_name, organiser_contact, total_league_games, vc_captain_id')
    .eq('id', params.tournamentId)
    .single()

  if (!tournament) redirect('/')

  // Fetch confirmed bookings for this tournament
  const { data: rawBookings } = await supabase
    .from('bookings')
    .select(`
      id, game_date, slot_time, format, captain_id,
      captain:captains!bookings_captain_id_fkey(id, name)
    `)
    .eq('status', 'confirmed')
    .eq('tournament_id', params.tournamentId)
    .order('game_date', { ascending: true })

  const bookings = (rawBookings ?? []).map(b => ({
    ...b,
    captain: Array.isArray(b.captain) ? b.captain[0] ?? null : b.captain,
  }))

  const today = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' })

  return (
    <div className="min-h-screen bg-ink-1 px-4 py-8 max-w-2xl mx-auto">
      {/* Spartans branding strip */}
      <div className="flex items-center gap-3 mb-6">
        <img src="/Transparent High Resolution.png" alt="Spartans CC" className="w-8 h-8 object-contain" />
        <div>
          <p className="font-cinzel text-xs font-bold text-gold tracking-[2px]">SPARTANS CC</p>
          <p className="font-rajdhani text-[10px] text-zinc-600 uppercase tracking-widest">Tournament Update</p>
        </div>
      </div>

      <TournamentShareCard
        tournament={tournament}
        bookings={bookings}
        today={today}
      />

      {/* Footer */}
      <p className="font-rajdhani text-[10px] text-zinc-700 text-center mt-6">
        hub.spartanscricketclub.in · Spartans Cricket Club Bangalore
      </p>
    </div>
  )
}