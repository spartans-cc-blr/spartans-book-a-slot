'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { format, parseISO } from 'date-fns'
import { DateChipSlider } from '@/components/ui/DateChipSlider'
import { groupDatesIntoChips } from '@/lib/dateChipGroups'
import type { NextStep } from '@/lib/matchNextStep'

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
  // What this past match needs next (scorecard / sync / fee) — null when nothing.
  next_step?: NextStep | null
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
    confirmed:  'bg-emerald-50 dark:bg-emerald-950 border-emerald-300 dark:border-emerald-800 text-emerald-700 dark:text-emerald-400',
    soft_block: 'bg-yellow-50 dark:bg-yellow-950 border-yellow-300 dark:border-yellow-800 text-yellow-500',
    cancelled:  'bg-white dark:bg-zinc-900 border-[#D4C9B0] dark:border-zinc-700 text-[#78716C] dark:text-zinc-500',
  }[status] ?? 'bg-parchment-2 dark:bg-ink-4 border-[#D4C9B0] dark:border-ink-5 text-[#78716C] dark:text-zinc-500'

  return (
    <span className={`font-rajdhani text-[10px] font-bold tracking-wide uppercase px-2 py-0.5 rounded-sm border ${cfg}`}>
      {status.replace('_', ' ')}
    </span>
  )
}

function BookingsTable({ bookings, emptyLabel }: { bookings: DashboardBookingRow[]; emptyLabel: string }) {
  return (
    <div className="bg-white dark:bg-ink-3 border border-[#D4C9B0] dark:border-ink-5 rounded overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr className="border-b border-[#D4C9B0] dark:border-ink-5 bg-parchment-2 dark:bg-ink-4">
              {['Date', 'Slot', 'Format', 'Captain', 'Tournament', 'Status', 'Next', ''].map(h => (
                <th key={h} className="font-rajdhani text-[10px] font-bold tracking-[2px] uppercase text-[#78716C] dark:text-zinc-600 px-4 py-2.5 text-left whitespace-nowrap">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {bookings.length === 0 && (
              <tr><td colSpan={8} className="px-4 py-8 text-center font-rajdhani text-[#78716C] dark:text-zinc-600 text-sm">{emptyLabel}</td></tr>
            )}
            {bookings.map(b => (
              <tr key={b.id} className="border-b border-[#E2DACE] dark:border-ink-4 hover:bg-parchment-2 dark:hover:bg-ink-4 transition-colors">
                <td className="px-4 py-3 font-rajdhani font-semibold text-sm text-[#1C1917] dark:text-parchment whitespace-nowrap">
                  {formatGameDate(b.game_date)}
                </td>
                <td className="px-4 py-3 font-cinzel text-sm text-[#1C1917] dark:text-parchment">{b.slot_time}</td>
                <td className="px-4 py-3 font-rajdhani text-sm text-[#57534E] dark:text-zinc-400">{b.format ?? '—'}</td>
                <td className="px-4 py-3 font-rajdhani text-sm text-[#57534E] dark:text-zinc-400">{b.captain_name ?? '—'}</td>
                <td className="px-4 py-3 font-rajdhani text-sm text-[#57534E] dark:text-zinc-400 max-w-[140px] truncate" title={
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
                <td className="px-4 py-3 whitespace-nowrap">
                  {b.next_step ? (
                    <Link href={b.next_step.kind === 'fee_due' ? `/admin/bookings/${b.id}?action=fees` : `/admin/bookings/${b.id}`}
                      className={`font-rajdhani text-[11px] font-bold tracking-wide uppercase px-2 py-0.5 rounded-sm border transition-colors ${
                        b.next_step.kind === 'fee_due'
                          ? 'border-gold-dim text-amber-700 dark:text-gold hover:bg-gold/10'
                          : 'border-[#D4C9B0] dark:border-ink-5 text-[#57534E] dark:text-zinc-400 hover:border-gold-dim'
                      }`}>
                      {b.next_step.label} ›
                    </Link>
                  ) : <span className="text-[#A8A29E] dark:text-zinc-700">—</span>}
                </td>
                <td className="px-4 py-3">
                  <Link href={`/admin/bookings/${b.id}`}
                    className="font-rajdhani text-xs text-[#78716C] dark:text-zinc-600 hover:text-amber-700 dark:hover:text-gold border border-[#D4C9B0] dark:border-ink-5 hover:border-gold-dim px-2 py-1 rounded transition-colors">
                    Edit
                  </Link>
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
  const [dayFilter, setDayFilter]   = useState<string | null>(null)
  const [months, setMonths]         = useState<string[]>([])
  const [bookings, setBookings]     = useState<DashboardBookingRow[]>([])
  const [truncated, setTruncated]   = useState(false)
  const [loading, setLoading]       = useState(true)
  const [error, setError]           = useState('')

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError('')
    setDayFilter(null) // a new month/all-time selection can't still contain the previously-picked date
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

  // Date-chip quick filter — same combined-weekend-chip convention as
  // Upcoming Matches (/fixtures) and Past Matches (/matches/history),
  // layered on top of the month stepper above rather than replacing it:
  // the month picker scopes the server fetch, this just narrows what's
  // shown from whatever that fetch already returned. Reverse-chronological
  // (most recent first), matching the query's own game_date-desc order.
  const distinctDates = useMemo(
    () => Array.from(new Set(bookings.map(b => b.game_date))).sort(),
    [bookings]
  )
  const dateChipGroups = useMemo(() => groupDatesIntoChips(distinctDates).reverse(), [distinctDates])
  const selectedGroup = dayFilter ? dateChipGroups.find(g => g.key === dayFilter) : undefined
  const visibleBookings = dayFilter && selectedGroup
    ? bookings.filter(b => selectedGroup.dates.includes(b.game_date))
    : bookings

  return (
    <div className="space-y-3">
      {months.length > 0 && (
        <div>
          <div className="flex items-center gap-2 bg-parchment-2 dark:bg-ink-4 border border-[#D4C9B0] dark:border-ink-5 rounded-full px-2 py-1.5">
            <button
              onClick={goOlderMonth}
              disabled={!canGoOlder}
              aria-label="Older month"
              className="w-7 h-7 flex-shrink-0 flex items-center justify-center border border-gold-dim text-amber-700 dark:text-gold rounded-full text-sm disabled:opacity-30 disabled:border-[#D4C9B0] dark:disabled:border-ink-5 disabled:text-[#78716C] dark:disabled:text-zinc-600 hover:bg-gold-dim transition-colors">
              ‹
            </button>
            <button
              onClick={() => setMonthPickerOpen(v => !v)}
              className="flex-1 flex items-center justify-center gap-1.5 font-rajdhani text-xs font-bold tracking-wide text-amber-700 dark:text-gold py-1">
              {monthFilter ? monthChipLabel(monthFilter) : 'All time'}
              <span className="text-[#78716C] dark:text-zinc-500 text-[10px]">{monthPickerOpen ? '▲' : '▾'}</span>
            </button>
            <button
              onClick={goNewerMonth}
              disabled={!canGoNewer}
              aria-label="Newer month"
              className="w-7 h-7 flex-shrink-0 flex items-center justify-center border border-gold-dim text-amber-700 dark:text-gold rounded-full text-sm disabled:opacity-30 disabled:border-[#D4C9B0] dark:disabled:border-ink-5 disabled:text-[#78716C] dark:disabled:text-zinc-600 hover:bg-gold-dim transition-colors">
              ›
            </button>
          </div>

          {monthPickerOpen && (
            <div className="mt-2 bg-parchment-2 dark:bg-ink-4 border border-[#D4C9B0] dark:border-ink-5 rounded-lg p-3 space-y-3">
              <button
                onClick={() => { setMonthFilter(''); setMonthPickerOpen(false) }}
                className={`font-rajdhani text-xs font-bold tracking-wide px-3 py-1.5 rounded-full border transition-colors ${
                  !monthFilter
                    ? 'bg-gold/20 border-gold-dim text-amber-700 dark:text-gold'
                    : 'bg-white dark:bg-ink-3 border-[#D4C9B0] dark:border-ink-5 text-[#78716C] dark:text-zinc-500 hover:text-[#44403C] dark:hover:text-zinc-300'
                }`}>
                All time
              </button>
              {monthGroups.map(group => (
                <div key={group.year} className="space-y-1.5">
                  <span className="font-rajdhani text-[10px] font-bold tracking-widest uppercase text-[#78716C] dark:text-zinc-600">
                    {group.year}
                  </span>
                  <div className="flex flex-wrap gap-2">
                    {group.months.map(month => (
                      <button
                        key={month}
                        onClick={() => selectMonth(month)}
                        className={`font-rajdhani text-xs font-bold tracking-wide px-3 py-1.5 rounded-full border transition-colors ${
                          monthFilter === month
                            ? 'bg-gold/20 border-gold-dim text-amber-700 dark:text-gold'
                            : 'bg-white dark:bg-ink-3 border-[#D4C9B0] dark:border-ink-5 text-[#78716C] dark:text-zinc-500 hover:text-[#44403C] dark:hover:text-zinc-300'
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
        <p className="font-rajdhani text-sm text-red-700 dark:text-red-400 bg-red-50 dark:bg-red-950/40 border border-red-300 dark:border-red-800 rounded px-4 py-2.5">{error}</p>
      )}
      {loading && (
        <p className="font-rajdhani text-sm text-[#78716C] dark:text-zinc-600 text-center py-6">Loading…</p>
      )}
      {!loading && !error && bookings.length === 0 && (
        <p className="font-rajdhani text-sm text-[#78716C] dark:text-zinc-600 text-center py-6">
          {monthFilter ? (
            <>
              No past bookings for {monthChipLabel(monthFilter)}.{' '}
              <button onClick={() => setMonthFilter('')} className="text-amber-700 dark:text-gold underline">
                Show all past bookings
              </button>
            </>
          ) : 'No past bookings found.'}
        </p>
      )}
      {!loading && !error && bookings.length > 0 && (
        <>
          {truncated && (
            <p className="font-rajdhani text-xs text-amber-500 bg-amber-50 dark:bg-amber-950/30 border border-amber-300/50 dark:border-amber-800/50 rounded px-3 py-2">
              Showing the most recent {bookings.length} bookings across all time — pick a specific month above to see everything from that period.
            </p>
          )}
          {dateChipGroups.length > 0 && (
            <div className="bg-parchment-2 dark:bg-ink-4 border border-[#D4C9B0] dark:border-ink-5 rounded-xl p-3">
              <DateChipSlider groups={dateChipGroups} selected={dayFilter} onSelect={setDayFilter} />
            </div>
          )}
          {dayFilter && visibleBookings.length === 0 ? (
            <p className="font-rajdhani text-sm text-[#78716C] dark:text-zinc-600 text-center py-6">
              No past bookings on {selectedGroup && selectedGroup.dates.length > 1 ? 'those dates' : 'that date'}.{' '}
              <button onClick={() => setDayFilter(null)} className="text-amber-700 dark:text-gold underline">
                Show all dates
              </button>
            </p>
          ) : (
            <BookingsTable bookings={visibleBookings} emptyLabel="No past bookings found." />
          )}
        </>
      )}
    </div>
  )
}

function NeedsActionPanel({ rows, loading, error, windowDays }: {
  rows: DashboardBookingRow[]; loading: boolean; error: string; windowDays: number
}) {
  if (loading) return <p className="font-rajdhani text-sm text-[#78716C] dark:text-zinc-600 text-center py-6">Loading…</p>
  if (error) return <p className="font-rajdhani text-sm text-red-700 dark:text-red-400 bg-red-50 dark:bg-red-950/40 border border-red-300 dark:border-red-800 rounded px-4 py-2.5">{error}</p>
  return (
    <div className="space-y-3">
      <p className="font-rajdhani text-xs text-[#78716C] dark:text-zinc-500">
        Played in the last {windowDays} days with a scorecard, sync or fee still to do. Older history: Utilities → Scorecard Backfill.
      </p>
      <BookingsTable bookings={rows} emptyLabel="All caught up — nothing needs action." />
    </div>
  )
}

export function DashboardBookingsTabs({
  upcoming,
}: {
  upcoming: DashboardBookingRow[]
}) {
  const [tab, setTab] = useState<'upcoming' | 'needs' | 'past'>('upcoming')
  // Lifted out of AdminPastMatchesPanel so the tab label stays accurate —
  // populated as soon as that panel's first fetch resolves.
  const [pastTotal, setPastTotal] = useState<number | null>(null)
  // Fetched on mount so the tab label can show how much is waiting.
  const [needs, setNeeds] = useState<DashboardBookingRow[]>([])
  const [needsLoading, setNeedsLoading] = useState(true)
  const [needsError, setNeedsError] = useState('')
  const [needsWindow, setNeedsWindow] = useState(60)
  useEffect(() => {
    fetch('/api/admin/bookings/needs-action')
      .then(r => r.json())
      .then(d => {
        if (d.error) setNeedsError(d.error)
        else { setNeeds(d.bookings ?? []); setNeedsWindow(d.windowDays ?? 60) }
      })
      .catch(() => setNeedsError('Network error'))
      .finally(() => setNeedsLoading(false))
  }, [])

  const tabCls = (t: string) =>
    `font-rajdhani text-xs font-bold tracking-widest uppercase px-4 py-2 rounded-t border-b-2 transition-colors ${
      tab === t ? 'text-amber-700 dark:text-gold border-gold bg-white dark:bg-ink-3' : 'text-[#78716C] dark:text-zinc-500 border-transparent hover:text-[#44403C] dark:hover:text-zinc-300'}`

  return (
    <div>
      <div className="flex items-center gap-1 mb-3 overflow-x-auto">
        <button onClick={() => setTab('upcoming')} className={tabCls('upcoming')}>
          {`Upcoming (${upcoming.length})`}
        </button>
        <button onClick={() => setTab('needs')} className={tabCls('needs')}>
          {needsLoading ? 'Needs action' : `Needs action (${needs.length})`}
        </button>
        <button onClick={() => setTab('past')} className={tabCls('past')}>
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
      <div className={tab === 'needs' ? '' : 'hidden'}>
        <NeedsActionPanel rows={needs} loading={needsLoading} error={needsError} windowDays={needsWindow} />
      </div>
      <div className={tab === 'past' ? '' : 'hidden'}>
        <AdminPastMatchesPanel onTotalCountChange={setPastTotal} />
      </div>
    </div>
  )
}
