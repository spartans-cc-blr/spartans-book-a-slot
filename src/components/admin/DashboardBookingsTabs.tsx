'use client'

import { useEffect, useState } from 'react'
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
  // Only meaningful for past bookings — scorecard synced, fees not yet
  // applied, and not already reconciled outside the Hub via the legacy
  // spreadsheet. Drives the "Apply Match Fee" shortcut below.
  apply_fee_eligible?: boolean
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
                    {b.apply_fee_eligible && (
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

// Mirrors MatchHistoryClient.tsx's month stepper (/matches/history) but
// scoped to the admin dashboard's own past-bookings definition (confirmed +
// soft_block, not just confirmed) and with none of that page's role/
// tournament/ground/format/result filters — admin just wants to browse
// booking history month by month. Kept as local pure helpers rather than a
// shared import so this component doesn't reach into an unrelated client
// component's internals.
function monthChipLabel(month: string): string {
  const [y, m] = month.split('-').map(Number)
  return new Date(Date.UTC(y, m - 1, 1)).toLocaleDateString('en-IN', { month: 'short', year: 'numeric', timeZone: 'UTC' })
}

function monthOnlyLabel(month: string): string {
  const [y, m] = month.split('-').map(Number)
  return new Date(Date.UTC(y, m - 1, 1)).toLocaleDateString('en-IN', { month: 'short', timeZone: 'UTC' })
}

// months arrives sorted most-recent-first with each year's months
// contiguous, so a simple running-group walk keeps that order intact.
function groupMonthsByYear(months: string[]): { year: string; months: string[] }[] {
  const groups: { year: string; months: string[] }[] = []
  for (const month of months) {
    const year = month.slice(0, 4)
    const last = groups[groups.length - 1]
    if (last && last.year === year) last.months.push(month)
    else groups.push({ year, months: [month] })
  }
  return groups
}

// Matches the API's own month bucketing (plain UTC date-string slicing) so
// the default view lines up with the month chip the server actually
// returns bookings for.
function currentMonthStr(): string {
  const d = new Date()
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`
}

function AdminPastMatchesPanel({ onTotalCountChange }: { onTotalCountChange: (n: number) => void }) {
  // Defaults to the current month, same rationale as /matches/history —
  // most visits are for "what happened recently," and it keeps the first
  // fetch small. Explicitly clearing the month chip shows everything.
  const [monthFilter, setMonthFilter]         = useState(currentMonthStr())
  const [monthPickerOpen, setMonthPickerOpen] = useState(false)
  const [months, setMonths]         = useState<string[]>([])
  const [bookings, setBookings]     = useState<DashboardBookingRow[]>([])
  const [truncated, setTruncated]   = useState(false)
  const [loading, setLoading]       = useState(true)
  const [error, setError]           = useState('')

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError('')
    const qs = monthFilter ? `?month=${monthFilter}` : ''
    fetch(`/api/admin/bookings/past${qs}`)
      .then(res => res.json())
      .then(data => {
        if (cancelled) return
        if (data.error) { setError(data.error); return }
        setBookings(data.bookings ?? [])
        setMonths(data.months ?? [])
        setTruncated(!!data.truncated)
        onTotalCountChange(data.totalCount ?? 0)
      })
      .catch(() => { if (!cancelled) setError('Network error') })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [monthFilter])

  // months is sorted most-recent-first, so index 0 is newest. "Older" moves
  // toward the end of the array, "newer" moves toward index 0. Both arrows
  // are disabled once monthFilter is '' (All time).
  const monthIndex = months.indexOf(monthFilter)
  const hasMonth    = monthIndex !== -1
  const canGoNewer  = hasMonth && monthIndex > 0
  const canGoOlder  = hasMonth && monthIndex < months.length - 1
  function goNewerMonth() { if (canGoNewer) setMonthFilter(months[monthIndex - 1]) }
  function goOlderMonth() { if (canGoOlder) setMonthFilter(months[monthIndex + 1]) }
  function selectMonth(month: string) {
    setMonthFilter(prev => prev === month ? '' : month)
    setMonthPickerOpen(false)
  }
  const monthGroups = groupMonthsByYear(months)

  return (
    <div className="space-y-3">
      {months.length > 0 && (
        <div>
          <div className="flex items-center gap-2 bg-ink-4 border border-ink-5 rounded-full px-2 py-1.5">
            <button
              onClick={goOlderMonth}
              disabled={!canGoOlder}
              aria-label="Older month"
              className="w-7 h-7 flex-shrink-0 flex items-center justify-center border border-gold-dim text-gold rounded-full text-sm disabled:opacity-30 disabled:border-ink-5 disabled:text-zinc-600 hover:bg-gold-dim transition-colors">
              ‹
            </button>
            <button
              onClick={() => setMonthPickerOpen(v => !v)}
              className="flex-1 flex items-center justify-center gap-1.5 font-rajdhani text-xs font-bold tracking-wide text-gold py-1">
              {monthFilter ? monthChipLabel(monthFilter) : 'All time'}
              <span className="text-zinc-500 text-[10px]">{monthPickerOpen ? '▲' : '▾'}</span>
            </button>
            <button
              onClick={goNewerMonth}
              disabled={!canGoNewer}
              aria-label="Newer month"
              className="w-7 h-7 flex-shrink-0 flex items-center justify-center border border-gold-dim text-gold rounded-full text-sm disabled:opacity-30 disabled:border-ink-5 disabled:text-zinc-600 hover:bg-gold-dim transition-colors">
              ›
            </button>
          </div>

          {monthPickerOpen && (
            <div className="mt-2 bg-ink-4 border border-ink-5 rounded-lg p-3 space-y-3">
              <button
                onClick={() => { setMonthFilter(''); setMonthPickerOpen(false) }}
                className={`font-rajdhani text-xs font-bold tracking-wide px-3 py-1.5 rounded-full border transition-colors ${
                  !monthFilter
                    ? 'bg-gold/20 border-gold-dim text-gold'
                    : 'bg-ink-3 border-ink-5 text-zinc-500 hover:text-zinc-300'
                }`}>
                All time
              </button>
              {monthGroups.map(group => (
                <div key={group.year} className="space-y-1.5">
                  <span className="font-rajdhani text-[10px] font-bold tracking-widest uppercase text-zinc-600">
                    {group.year}
                  </span>
                  <div className="flex flex-wrap gap-2">
                    {group.months.map(month => (
                      <button
                        key={month}
                        onClick={() => selectMonth(month)}
                        className={`font-rajdhani text-xs font-bold tracking-wide px-3 py-1.5 rounded-full border transition-colors ${
                          monthFilter === month
                            ? 'bg-gold/20 border-gold-dim text-gold'
                            : 'bg-ink-3 border-ink-5 text-zinc-500 hover:text-zinc-300'
                        }`}>
                        {monthOnlyLabel(month)}
                      </button>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {error && (
        <p className="font-rajdhani text-sm text-red-400 bg-red-950/40 border border-red-800 rounded px-4 py-2.5">{error}</p>
      )}
      {loading && (
        <p className="font-rajdhani text-sm text-zinc-600 text-center py-6">Loading…</p>
      )}
      {!loading && !error && bookings.length === 0 && (
        <p className="font-rajdhani text-sm text-zinc-600 text-center py-6">
          {monthFilter ? (
            <>
              No past bookings for {monthChipLabel(monthFilter)}.{' '}
              <button onClick={() => setMonthFilter('')} className="text-gold underline">
                Show all past bookings
              </button>
            </>
          ) : 'No past bookings found.'}
        </p>
      )}
      {!loading && !error && bookings.length > 0 && (
        <>
          {truncated && (
            <p className="font-rajdhani text-xs text-amber-500 bg-amber-950/30 border border-amber-800/50 rounded px-3 py-2">
              Showing the most recent {bookings.length} bookings across all time — pick a specific month above to see everything from that period.
            </p>
          )}
          <BookingsTable bookings={bookings} emptyLabel="No past bookings found." />
        </>
      )}
    </div>
  )
}

export function DashboardBookingsTabs({
  upcoming,
}: {
  upcoming: DashboardBookingRow[]
}) {
  const [tab, setTab] = useState<'upcoming' | 'past'>('upcoming')
  // Lifted out of AdminPastMatchesPanel so the tab label stays accurate —
  // populated as soon as that panel's first fetch resolves.
  const [pastTotal, setPastTotal] = useState<number | null>(null)

  return (
    <div>
      <div className="flex items-center gap-1 mb-3">
        <button
          onClick={() => setTab('upcoming')}
          className={`font-rajdhani text-xs font-bold tracking-widest uppercase px-4 py-2 rounded-t border-b-2 transition-colors
            ${tab === 'upcoming' ? 'text-gold border-gold bg-ink-3' : 'text-zinc-500 border-transparent hover:text-zinc-300'}`}>
          {`Upcoming (${upcoming.length})`}
        </button>
        <button
          onClick={() => setTab('past')}
          className={`font-rajdhani text-xs font-bold tracking-widest uppercase px-4 py-2 rounded-t border-b-2 transition-colors
            ${tab === 'past' ? 'text-gold border-gold bg-ink-3' : 'text-zinc-500 border-transparent hover:text-zinc-300'}`}>
          {pastTotal === null ? 'Past' : `Past (${pastTotal})`}
        </button>
      </div>
      {/* Upcoming is server-rendered and cheap to keep mounted always.
          Past is client-fetched and kept mounted (hidden, not unmounted)
          once visited so its month selection survives tab switches and the
          tab-label count doesn't have to be refetched every time. */}
      <div className={tab === 'upcoming' ? '' : 'hidden'}>
        <BookingsTable bookings={upcoming} emptyLabel="No upcoming bookings." />
      </div>
      <div className={tab === 'past' ? '' : 'hidden'}>
        <AdminPastMatchesPanel onTotalCountChange={setPastTotal} />
      </div>
    </div>
  )
}
