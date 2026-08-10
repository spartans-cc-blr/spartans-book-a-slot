'use client'

import { useState } from 'react'
import Link from 'next/link'
import { format, parseISO } from 'date-fns'

export interface DashboardBookingRow {
  id:               string
  game_date:        string
  slot_time:        string
  format:           string | null
  status:           string
  block_reason:     string | null
  captain_name:     string | null
  tournament_name:  string | null
  // Scorecard upload/apply status — only populated for past bookings.
  // Drives the "Apply Match Fee" shortcut below.
  scorecard_status?: string | null
}

// A single malformed game_date (e.g. a mistyped year) must never crash the
// whole dashboard for every admin — fall back to the raw value instead.
function formatGameDate(gameDate: string): string {
  try {
    return format(parseISO(gameDate), 'EEE d MMM')
  } catch {
    return `Invalid date (${gameDate})`
  }
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

function BookingsTable({ bookings, emptyLabel }: { bookings: DashboardBookingRow[]; emptyLabel: string }) {
  return (
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
            {bookings.length === 0 && (
              <tr><td colSpan={7} className="px-4 py-8 text-center font-rajdhani text-zinc-600 text-sm">{emptyLabel}</td></tr>
            )}
            {bookings.map(b => (
              <tr key={b.id} className="border-b border-ink-4 hover:bg-ink-4 transition-colors">
                <td className="px-4 py-3 font-rajdhani font-semibold text-sm text-parchment whitespace-nowrap">
                  {formatGameDate(b.game_date)}
                </td>
                <td className="px-4 py-3 font-cinzel text-sm text-parchment">{b.slot_time}</td>
                <td className="px-4 py-3 font-rajdhani text-sm text-zinc-400">{b.format ?? '—'}</td>
                <td className="px-4 py-3 font-rajdhani text-sm text-zinc-400">{b.captain_name ?? '—'}</td>
                <td className="px-4 py-3 font-rajdhani text-sm text-zinc-400 max-w-[140px] truncate" title={
                  b.status === 'soft_block' && b.block_reason && b.tournament_name
                    ? `${b.block_reason} — ${b.tournament_name}`
                    : undefined
                }>
                  {b.status === 'soft_block'
                    ? (b.tournament_name ? `${b.block_reason} — ${b.tournament_name}` : b.block_reason)
                    : b.tournament_name ?? '—'}
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
                    {/* Shown only once the scorecard is synced but fees haven't
                        been applied yet — a shortcut straight to the fee-only
                        view of the same page, so applying a fee doesn't
                        require going through the full booking-edit flow. */}
                    {b.scorecard_status === 'synced' && (
                      <Link href={`/admin/bookings/${b.id}?action=fees`}
                        className="font-rajdhani text-xs text-gold hover:text-gold-light border border-gold-dim hover:bg-gold/10 px-2 py-1 rounded transition-colors">
                        Apply Match Fee
                      </Link>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

export function DashboardBookingsTabs({
  upcoming, past,
}: {
  upcoming: DashboardBookingRow[]
  past:     DashboardBookingRow[]
}) {
  const [tab, setTab] = useState<'upcoming' | 'past'>('upcoming')

  return (
    <div>
      <div className="flex items-center gap-1 mb-3">
        {(['upcoming', 'past'] as const).map(t => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`font-rajdhani text-xs font-bold tracking-widest uppercase px-4 py-2 rounded-t border-b-2 transition-colors
              ${tab === t ? 'text-gold border-gold bg-ink-3' : 'text-zinc-500 border-transparent hover:text-zinc-300'}`}>
            {t === 'upcoming' ? `Upcoming (${upcoming.length})` : `Past (${past.length})`}
          </button>
        ))}
      </div>
      {tab === 'upcoming'
        ? <BookingsTable bookings={upcoming} emptyLabel="No upcoming bookings." />
        : <BookingsTable bookings={past} emptyLabel="No past bookings found." />}
    </div>
  )
}
