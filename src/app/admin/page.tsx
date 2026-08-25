import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { createServiceClient } from '@/lib/supabase'
import Link from 'next/link'
import { format, addDays } from 'date-fns'
import type { Booking } from '@/types'
import NLPBookingBar from '@/components/admin/NLPBookingBar'
import { DashboardBookingsTabs, type DashboardBookingRow } from '@/components/admin/DashboardBookingsTabs'

export const revalidate = 0  // Always fresh for admin

function toDashboardRow(b: any, applyFeeEligible?: boolean): DashboardBookingRow {
  return {
    id:                b.id,
    game_date:         b.game_date,
    slot_time:         b.slot_time,
    format:            b.format ?? null,
    status:            b.status,
    block_reason:      b.block_reason ?? null,
    captain_name:      b.tournament?.captains?.name ?? null,
    tournament_name:   b.tournament?.name ?? null,
    apply_fee_eligible: applyFeeEligible ?? false,
  }
}

export default async function AdminDashboard({
  searchParams,
}: {
  searchParams?: { saved?: string; booked?: string; reserved?: string; blocked?: string }
}) {
  const session  = await getServerSession(authOptions)
  const supabase = createServiceClient()
  const today    = format(new Date(), 'yyyy-MM-dd')

  const tournamentSelect = `
    id, game_date, slot_time, format, status, venue, opponent_name, block_reason, notes, created_at, updated_at, tournament_id,
    tournament:tournaments!bookings_tournament_id_fkey(
      id, name, captains!tournaments_captain_id_fkey(id, name)
    )
  `

  // Upcoming confirmed bookings + soft blocks
  const { data: bookings } = await supabase
    .from('bookings')
    .select(tournamentSelect)
    .neq('status', 'cancelled')
    .gte('game_date', today)
    .order('game_date')
    .order('slot_time')
    .limit(100) as { data: Booking[] | null }

  // Past bookings are no longer fetched here — the "Past" tab
  // (DashboardBookingsTabs / AdminPastMatchesPanel) now paginates them
  // itself month-by-month via GET /api/admin/bookings/past, so a booking's
  // admin edit page (Post-Match panel: reset upload, sync stats, apply
  // fees) stays reachable from that tab no matter how far back its match
  // was played — the old `.limit(100)` fetch here silently capped both the
  // list and the "(100)" tab count once history grew past 100 bookings.

  const { data: captains }     = await supabase.from('captains').select('id, name').eq('active', true).order('name')
  const { data: grounds }      = await supabase.from('grounds').select('id, name').order('name')
  const { data: tournamentsMd } = await supabase.from('tournaments').select('id, name').eq('active', true).order('name')

  // This weekend games count
  const day = new Date().getDay()
  const sat = format(addDays(new Date(), day === 6 ? 0 : (6 - day)), 'yyyy-MM-dd')
  const sun = format(addDays(new Date(), day === 0 ? 0 : (7 - day)), 'yyyy-MM-dd')
  const weekendGames = (bookings ?? []).filter(
    b => (b.game_date === sat || b.game_date === sun) && b.status === 'confirmed'
  )
  const softBlocks = (bookings ?? []).filter(b => b.status === 'soft_block')

  return (
    <div>
      <div className="mb-6">
        <h1 className="font-cinzel text-xl font-bold text-gold">Matches - List View</h1>
        <p className="font-rajdhani text-zinc-500 text-sm mt-1">
          Welcome back, {session?.user?.name?.split(' ')[0]}. Here's your weekend at a glance.
        </p>
      </div>

      {/* Alert if weekend near capacity */}
      {weekendGames.length >= 2 && (
        <div className="bg-red-950/50 border border-red-900 border-l-4 border-l-crimson px-4 py-3 rounded mb-5 flex items-center gap-3 font-rajdhani text-sm text-red-300">
          ⚠️ <span><strong>This weekend</strong> has {weekendGames.length} of 3 game slots filled.{weekendGames.length === 3 ? ' Weekend is full.' : ' 1 slot remaining.'}</span>
        </div>
      )}

      {searchParams?.saved && (
        <div className="bg-emerald-950 border border-emerald-800 text-emerald-400 font-rajdhani text-sm px-4 py-3 rounded mb-5 flex items-center gap-3">
          ✓ Booking saved successfully.
        </div>
      )}

      {/* Stat cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-8">
        {[
          { label: 'This Weekend',  value: `${weekendGames.length}/3`, sub: 'Games booked',     alert: weekendGames.length === 3 },
          { label: 'Upcoming',      value: (bookings ?? []).filter(b=>b.status==='confirmed').length, sub: 'Confirmed games', alert: false },
          { label: 'Soft Blocks',   value: softBlocks.length, sub: 'Active reservations',       alert: false },
          { label: 'Open Slots',    value: 3 - weekendGames.length, sub: 'This weekend',         alert: false },
        ].map(card => (
          <div key={card.label} className={`bg-ink-3 border rounded p-4 border-t-2 ${card.alert ? 'border-t-crimson border-ink-5' : 'border-t-gold-dim border-ink-5'}`}>
            <p className="font-rajdhani text-[10px] font-bold tracking-[2px] uppercase text-zinc-600 mb-1">{card.label}</p>
            <p className={`font-cinzel text-3xl font-bold ${card.alert ? 'text-crimson' : 'text-gold'}`}>{card.value}</p>
            <p className="font-rajdhani text-xs text-zinc-600 mt-1">{card.sub}</p>
          </div>
        ))}
      </div>

      {/* NLP Command Bar */}
      <div className="mb-5">
        <NLPBookingBar
          captains={captains ?? []}
          grounds={grounds ?? []}
          tournaments={tournamentsMd ?? []}
          upcomingBookings={(bookings ?? [])
            .filter(b => b.status !== 'cancelled')
            .map(b => ({
              id: b.id,
              game_date: b.game_date,
              slot_time: b.slot_time,
              format: b.format ?? null,
              status: b.status,
              captain_name: (b as any).tournament?.captains?.name ?? null,
              tournament_name: (b as any).tournament?.name ?? null,
            }))}
        />
      </div>

      <div className="flex items-center justify-end mb-3">
        <div className="flex gap-2">
          <Link href="/admin/soft-blocks/new"
            className="font-rajdhani text-xs font-bold tracking-wide border border-gold-dim text-gold px-3 py-1.5 rounded hover:bg-gold/10 transition-colors">
            🔒 Soft Block
          </Link>
          <Link href="/admin/bookings/new"
            className="font-rajdhani text-xs font-bold tracking-wide bg-crimson hover:bg-crimson-dark text-white px-3 py-1.5 rounded transition-colors">
            ＋ New Booking
          </Link>
        </div>
      </div>

      <DashboardBookingsTabs
        upcoming={(bookings ?? []).map(b => toDashboardRow(b))}
      />
    </div>
  )
}
