// Public — no auth required. Renders a single tournament card
// for sharing with organisers or captains via WhatsApp link.
import { createServiceClient } from '@/lib/supabase'
import { redirect } from 'next/navigation'
import { TournamentShareCard } from '@/components/tournament-planner/TournamentShareCard'
import { getSuggestedOpenDates, getSuggestedSlotDates } from '@/lib/suggestedSlots'
import type { SuggestedDate, SuggestedSlotBucket } from '@/lib/suggestedSlots'
import type { Metadata } from 'next'

// Fixed regardless of the tournament's own unbooked count — this is a
// "here's what's open soon" nudge for the organiser, not an exhaustive
// booking plan (the GC/Admin suggested-slots panel is the exhaustive one).
// Only used for non-self-service tournaments' plain WhatsApp-enquiry list —
// self-service tournaments use getSuggestedSlotDates instead, which returns
// one entry per deficient slot bucket rather than a capped flat list.
const SHARE_CARD_SUGGESTION_COUNT = 3

// Always rendered fresh — no ISR cache. This page used to carry
// `revalidate = 300` (5 min), which caused a real staleness bug: an admin
// editing the tournament from /tournament-planner and immediately opening
// the share link would sometimes see the pre-edit render (Next serves the
// stale cached HTML on the first hit after expiry while regenerating in
// the background — classic stale-while-revalidate — so only a follow-up
// refresh picked up the change). Given how few visits this page actually
// gets (an occasional organiser open, or an admin sanity-checking right
// after a change), correctness beats the marginal Supabase-read savings.
export const dynamic = 'force-dynamic'
export const revalidate = 0

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

  // Fetch tournament — captain lives on tournaments, not bookings (bookings
  // has no captain_id column/FK at all; a prior version of this query joined
  // captains via a nonexistent bookings_captain_id_fkey, which failed
  // silently and made every booking fetch below return nothing).
  const { data: rawTournament } = await supabase
    .from('tournaments')
    .select('id, name, organiser_name, organiser_contact, total_league_games, vc_captain_id, organiser_self_service, cricheroes_points_table_url, captains!tournaments_captain_id_fkey(id, name, players(cricheroes_url))')
    .eq('id', params.tournamentId)
    .single()

  if (!rawTournament) redirect('/')

  const rawCaptain = Array.isArray(rawTournament.captains) ? rawTournament.captains[0] ?? null : rawTournament.captains
  // captains.player_id is nullable (legacy rows) — no linked player means
  // no CricHeroes URL to show, same as any other player without one.
  const captainPlayer = rawCaptain
    ? (Array.isArray(rawCaptain.players) ? rawCaptain.players[0] ?? null : rawCaptain.players)
    : null

  const tournament = {
    ...rawTournament,
    captain: rawCaptain
      ? { id: rawCaptain.id, name: rawCaptain.name, cricheroes_url: captainPlayer?.cricheroes_url ?? null }
      : null,
  }

  // Fetch confirmed bookings for this tournament
  const { data: rawBookings } = await supabase
    .from('bookings')
    .select('id, game_date, slot_time, format, cricheroes_url, opponent_name, match_id')
    .eq('status', 'confirmed')
    .eq('tournament_id', params.tournamentId)
    .order('game_date', { ascending: true })

  // Match result for any finished games with a synced scorecard — read-through
  // cache table, same source matches/history uses. Not every past game has
  // one yet (scorecard sync is a separate manual/cron step), so this is a
  // best-effort attach, not a requirement.
  const matchIds = (rawBookings ?? []).map(b => b.match_id).filter((id): id is string => !!id)
  const { data: statsRows } = matchIds.length
    ? await supabase.from('match_stats_cache').select('match_id, match_result').in('match_id', matchIds)
    : { data: [] }
  const resultByMatchId = new Map((statsRows ?? []).map(r => [r.match_id, r.match_result]))

  const bookings = (rawBookings ?? []).map(b => ({
    ...b,
    match_result: b.match_id ? resultByMatchId.get(b.match_id) ?? null : null,
  }))

  const today = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' })

  // Self-service tournaments get one recommendation per deficient slot
  // bucket (getSuggestedSlotDates — see src/lib/suggestedSlots.ts), matching
  // the same count/target slot balance shown further down this card.
  // Everyone else keeps the plain "here's what's open soon" day list feeding
  // a WhatsApp enquiry link. Only one of the two is ever fetched.
  let suggestedDates: SuggestedDate[] = []
  let suggestedBuckets: SuggestedSlotBucket[] = []

  if (rawTournament.organiser_self_service) {
    const bucketResult = await getSuggestedSlotDates(params.tournamentId)
    suggestedBuckets = bucketResult.ok ? bucketResult.buckets : []
  } else {
    const dateResult = await getSuggestedOpenDates(params.tournamentId, SHARE_CARD_SUGGESTION_COUNT)
    suggestedDates = dateResult.ok ? dateResult.suggestions : []
  }

  return (
    <div className="min-h-screen bg-parchment px-4 py-8 max-w-2xl mx-auto">
      {/* Spartans branding strip */}
      <div className="flex items-center gap-3 mb-6">
        <img src="/Transparent High Resolution.png" alt="Spartans CC" className="w-8 h-8 object-contain" />
        <div>
          <p className="font-cinzel text-xs font-bold text-gold-dim tracking-[2px]">SPARTANS CC</p>
          <p className="font-rajdhani text-[10px] text-stone-500 uppercase tracking-widest">Tournament Update</p>
        </div>
      </div>

      <TournamentShareCard
        tournament={tournament}
        bookings={bookings}
        today={today}
        suggestedDates={suggestedDates}
        suggestedBuckets={suggestedBuckets}
        waNumber={process.env.NEXT_PUBLIC_WA_NUMBER ?? ''}
      />

      {/* Footer */}
      <p className="font-rajdhani text-[10px] text-stone-400 text-center mt-6">
        hub.spartanscricketclub.in · Spartans Cricket Club Bangalore
      </p>
    </div>
  )
}