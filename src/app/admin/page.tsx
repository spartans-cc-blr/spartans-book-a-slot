import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { createServiceClient } from '@/lib/supabase'
import Link from 'next/link'
import { format, parseISO, startOfDay, addDays } from 'date-fns'
import type { Booking } from '@/types'
import NLPBookingBar from ‘@/components/admin/NLPBookingBar’

export const revalidate = 0  // Always fresh for admin

export default async function AdminDashboard({
  searchParams,
}: {
  searchParams?: { saved?: string; booked?: string; reserved?: string; blocked?: string }
}) {
  const session  = await getServerSession(authOptions)
  const supabase = createServiceClient()
  const today    = format(new Date(), 'yyyy-MM-dd')

  // Upcoming confirmed bookings + soft blocks
  const { data: bookings } = await supabase
    .from('bookings')
    .select('*, captain:captains(*), tournament:tournaments(*)')
    .neq('status', 'cancelled')
    .gte('game_date', today)
    .order('game_date')
    .order('slot_time')
    .limit(100) as { data: Booking[] | null }

  const { data: captains }     = await supabase.from(‘captains’).select(‘id, name’).eq(‘active’, true).order(‘name’)
  const { data: grounds }      = await supabase.from(‘grounds’).select(‘id, name’).order(‘name’)
  const { data: tournamentsMd } = await supabase.from(‘tournaments’).select(‘id, name’).eq(‘active’, true).order(‘name’)

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
        <h1 className="font-cinzel text-xl font-bold text-gold">Dashboard</h1>
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

      {/* Upcoming bookings */}
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
          captain_name: (b as any).captain?.name ?? null,
          tournament_name: (b as any).tournament?.name ?? null,
        }))}
    />
  </div>

  <div className="flex items-center justify-between mb-3">
    <h2 className="font-cinzel text-sm font-semibold text-gold flex items-center gap-2">
      <span className="w-1 h-4 bg-crimson rounded-sm inline-block" /> Upcoming Bookings
    </h2>
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

      <div className="bg-ink-3 border border-ink-5 rounded overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-ink-5 bg-ink-4">
                {['Date', 'Slot', 'Format', 'Captain', 'Tournament', 'Status', ''].map(h => (
                  <th key={h} className="font-rajdhani text-[10px] font-bold tracking-[2px] uppercase text-zinc-600 px-4 py-2.5 text-left whitespace-nowrap">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {(bookings ?? []).length === 0 && (
                <tr><td colSpan={7} className="px-4 py-8 text-center font-rajdhani text-zinc-600 text-sm">No upcoming bookings.</td></tr>
              )}
              {(bookings ?? []).map(b => (
                <tr key={b.id} className="border-b border-ink-4 hover:bg-ink-4 transition-colors">
                  <td className="px-4 py-3 font-rajdhani font-semibold text-sm text-parchment whitespace-nowrap">
                    {format(parseISO(b.game_date), 'EEE d MMM')}
                  </td>
                  <td className="px-4 py-3 font-cinzel text-sm text-parchment">{b.slot_time}</td>
                  <td className="px-4 py-3 font-rajdhani text-sm text-zinc-400">{b.format ?? '—'}</td>
                  <td className="px-4 py-3 font-rajdhani text-sm text-zinc-400">{(b as any).captain?.name ?? '—'}</td>
                  <td className="px-4 py-3 font-rajdhani text-sm text-zinc-400 max-w-[140px] truncate">
                    {b.status === 'soft_block' ? b.block_reason : (b as any).tournament?.name ?? '—'}
                  </td>
                  <td className="px-4 py-3">
                    <StatusBadge status={b.status} />
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex gap-1">
                      <Link href={`/admin/bookings/${b.id}`}
                        className="font-rajdhani text-xs text-zinc-600 hover:text-gold border border-ink-5 hover:border-gold-dim px-2 py-1 rounded transition-colors">
                        Edit
                      </Link>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}

function StatusBadge({ status }: { status: string }) {
  const cfg = {
    confirmed:  'bg-emerald-950 border-emerald-800 text-emerald-400',
    soft_block: 'bg-yellow-950 border-yellow-800 text-yellow-500',
    cancelled:  'bg-zinc-900 border-zinc-700 text-zinc-500',
  }[status] ?? 'bg-ink-4 border-ink-5 text-zinc-500'

  return (
    <span className={`font-rajdhani text-[10px] font-bold tracking-wide uppercase px-2 py-0.5 rounded-sm border ${cfg}`}>
      {status.replace('_', ' ')}
    </span>
  )
}
