'use client'

import Link from 'next/link'
import { useEffect, useMemo, useState } from 'react'

interface Booking {
  booking_id:     string
  game_date:      string
  slot_time:      string
  format:         string | null
  opponent_name:  string | null
  match_id:       string
  tournament_id:   string | null
  tournament_name: string | null
  ground_id:       string | null
  ground_name:     string | null
  current_status: string | null
  error_message:  string | null
}

type RowStatus = 'idle' | 'processing' | 'success' | 'failed'

// Respectful pacing between CricHeroes fetches — same spirit as the
// wrangler's standalone download_scorecard.py (a few seconds between
// requests rather than firing them all at once).
const DELAY_BETWEEN_MS = 4000

const RUN_STATUS_CONFIG: Record<RowStatus, { label: string; className: string }> = {
  idle:       { label: 'Pending',   className: 'bg-ink-4 border-ink-5 text-zinc-500' },
  processing: { label: 'Fetching…', className: 'bg-amber-950/40 border-amber-800 text-amber-400' },
  success:    { label: 'Done ✓',    className: 'bg-emerald-950/40 border-emerald-800 text-emerald-400' },
  failed:     { label: 'Failed',    className: 'bg-red-950/40 border-red-800 text-red-400' },
}

// The booking's actual scorecard_uploads.status, shown alongside (not
// instead of) the current run's status — a row can be "already synced"
// and still sit here waiting to be re-run on purpose.
const CURRENT_STATUS_CONFIG: Record<string, { label: string; className: string }> = {
  pending_parse: { label: 'Pending parse', className: 'bg-amber-950/40 border-amber-800 text-amber-400' },
  parsed:        { label: 'Parsed, not synced', className: 'bg-amber-950/40 border-amber-800 text-amber-400' },
  synced:        { label: 'Synced', className: 'bg-emerald-950/40 border-emerald-800 text-emerald-400' },
  fees_applied:  { label: 'Fees applied', className: 'bg-blue-950/40 border-blue-800 text-blue-400' },
}

function CurrentStatusBadge({ status }: { status: string | null }) {
  if (!status) {
    return (
      <span className="font-rajdhani text-[11px] font-bold px-2 py-0.5 rounded border flex-shrink-0 bg-ink-4 border-ink-5 text-zinc-600">
        Never uploaded
      </span>
    )
  }
  const cfg = CURRENT_STATUS_CONFIG[status] ?? { label: status, className: 'bg-ink-4 border-ink-5 text-zinc-500' }
  return (
    <span className={`font-rajdhani text-[11px] font-bold px-2 py-0.5 rounded border flex-shrink-0 ${cfg.className}`}>
      {cfg.label}
    </span>
  )
}

function RunStatusBadge({ status }: { status: RowStatus }) {
  const cfg = RUN_STATUS_CONFIG[status]
  return (
    <span className={`font-rajdhani text-[11px] font-bold px-2.5 py-1 rounded border flex-shrink-0 ${cfg.className}`}>
      {cfg.label}
    </span>
  )
}

const ALL = '__all__'

export default function ScorecardBackfillPage() {
  const [bookings, setBookings] = useState<Booking[]>([])
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [loading, setLoading]   = useState(true)
  const [loadError, setLoadError] = useState('')
  const [running, setRunning]   = useState(false)
  const [results, setResults]   = useState<Record<string, { status: RowStatus; message?: string }>>({})

  // Filters
  const [matchIdQuery, setMatchIdQuery]       = useState('')
  const [tournamentFilter, setTournamentFilter] = useState(ALL)
  const [groundFilter, setGroundFilter]       = useState(ALL)
  const [formatFilter, setFormatFilter]       = useState(ALL)

  useEffect(() => {
    fetch('/api/admin/scorecard-backfill')
      .then(res => res.json())
      .then(data => {
        if (data.error) { setLoadError(data.error); return }
        const rows: Booking[] = data.bookings ?? []
        setBookings(rows)
        // Only pre-select rows that genuinely need a run — an already
        // synced/fees_applied match is visible and filterable here, but
        // re-running it is a deliberate choice, not the default action.
        setSelected(new Set(
          rows.filter(b => !['synced', 'fees_applied'].includes(b.current_status ?? '')).map(b => b.booking_id)
        ))
      })
      .catch(() => setLoadError('Network error'))
      .finally(() => setLoading(false))
  }, [])

  const tournamentOptions = useMemo(() => {
    const map = new Map<string, string>()
    for (const b of bookings) if (b.tournament_id) map.set(b.tournament_id, b.tournament_name ?? b.tournament_id)
    return Array.from(map.entries()).sort((a, b) => a[1].localeCompare(b[1]))
  }, [bookings])

  const groundOptions = useMemo(() => {
    const map = new Map<string, string>()
    for (const b of bookings) if (b.ground_id) map.set(b.ground_id, b.ground_name ?? b.ground_id)
    return Array.from(map.entries()).sort((a, b) => a[1].localeCompare(b[1]))
  }, [bookings])

  const formatOptions = useMemo(() => {
    return Array.from(new Set(bookings.map(b => b.format).filter(Boolean))) as string[]
  }, [bookings])

  const filtered = useMemo(() => {
    const q = matchIdQuery.trim().toLowerCase()
    return bookings.filter(b => {
      if (q && !b.match_id.toLowerCase().includes(q)) return false
      if (tournamentFilter !== ALL && b.tournament_id !== tournamentFilter) return false
      if (groundFilter !== ALL && b.ground_id !== groundFilter) return false
      if (formatFilter !== ALL && b.format !== formatFilter) return false
      return true
    })
  }, [bookings, matchIdQuery, tournamentFilter, groundFilter, formatFilter])

  const hasActiveFilter = matchIdQuery.trim() !== '' || tournamentFilter !== ALL || groundFilter !== ALL || formatFilter !== ALL

  function toggle(id: string) {
    setSelected(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id); else next.add(id)
      return next
    })
  }

  function toggleAllFiltered() {
    const filteredIds = filtered.map(b => b.booking_id)
    const allFilteredSelected = filteredIds.length > 0 && filteredIds.every(id => selected.has(id))
    setSelected(prev => {
      const next = new Set(prev)
      if (allFilteredSelected) {
        filteredIds.forEach(id => next.delete(id))
      } else {
        filteredIds.forEach(id => next.add(id))
      }
      return next
    })
  }

  async function runBackfill() {
    setRunning(true)
    const toProcess = filtered.filter(b => selected.has(b.booking_id))

    for (let i = 0; i < toProcess.length; i++) {
      const b = toProcess[i]
      setResults(prev => ({ ...prev, [b.booking_id]: { status: 'processing' } }))
      try {
        const res = await fetch('/api/admin/scorecard-backfill', {
          method:  'POST',
          headers: { 'Content-Type': 'application/json' },
          body:    JSON.stringify({ booking_id: b.booking_id }),
        })
        const data = await res.json()
        setResults(prev => ({
          ...prev,
          [b.booking_id]: data.ok
            ? { status: 'success' }
            : { status: 'failed', message: data.error ?? 'Unknown error' },
        }))
      } catch {
        setResults(prev => ({ ...prev, [b.booking_id]: { status: 'failed', message: 'Network error' } }))
      }
      if (i < toProcess.length - 1) {
        await new Promise(r => setTimeout(r, DELAY_BETWEEN_MS))
      }
    }
    setRunning(false)
  }

  const selectedInFiltered = filtered.filter(b => selected.has(b.booking_id))
  const selectedFeesApplied = selectedInFiltered.filter(b => b.current_status === 'fees_applied')

  const successCount = Object.values(results).filter(r => r.status === 'success').length
  const failedCount  = Object.values(results).filter(r => r.status === 'failed').length
  const hasRun       = Object.keys(results).length > 0

  return (
    <div>
      <div className="mb-6">
        <h1 className="font-cinzel text-xl font-bold text-gold">Scorecard Backfill</h1>
        <p className="font-rajdhani text-sm text-zinc-500 mt-1">
          Fetch, parse, and sync scorecards directly from CricHeroes for any past match — including one that&apos;s
          already synced, if you need to re-run it after a parsing fix. Match fees are never touched by this —
          that stays a fully separate, manual step.
        </p>
      </div>

      {loading && <p className="font-rajdhani text-sm text-zinc-600">Loading…</p>}
      {loadError && <p className="font-rajdhani text-sm text-red-400">{loadError}</p>}

      {!loading && !loadError && bookings.length === 0 && (
        <p className="font-rajdhani text-sm text-zinc-600">No past matches with a CricHeroes match_id found.</p>
      )}

      {!loading && !loadError && bookings.length > 0 && (
        <>
          <div className="bg-ink-3 border border-ink-5 rounded p-4 mb-4 flex flex-wrap gap-3 items-end">
            <div className="flex-1 min-w-[160px]">
              <label className="font-rajdhani text-[11px] font-bold tracking-widest uppercase text-zinc-500">
                Match ID
              </label>
              <input
                value={matchIdQuery}
                onChange={e => setMatchIdQuery(e.target.value)}
                placeholder="e.g. 21868467"
                className="w-full mt-1 bg-ink-4 border border-ink-5 rounded px-2.5 py-1.5 font-rajdhani text-sm text-zinc-200"
              />
            </div>
            <div className="flex-1 min-w-[160px]">
              <label className="font-rajdhani text-[11px] font-bold tracking-widest uppercase text-zinc-500">
                Tournament
              </label>
              <select
                value={tournamentFilter}
                onChange={e => setTournamentFilter(e.target.value)}
                className="w-full mt-1 bg-ink-4 border border-ink-5 rounded px-2.5 py-1.5 font-rajdhani text-sm text-zinc-200">
                <option value={ALL}>All tournaments</option>
                {tournamentOptions.map(([id, name]) => <option key={id} value={id}>{name}</option>)}
              </select>
            </div>
            <div className="flex-1 min-w-[160px]">
              <label className="font-rajdhani text-[11px] font-bold tracking-widest uppercase text-zinc-500">
                Ground
              </label>
              <select
                value={groundFilter}
                onChange={e => setGroundFilter(e.target.value)}
                className="w-full mt-1 bg-ink-4 border border-ink-5 rounded px-2.5 py-1.5 font-rajdhani text-sm text-zinc-200">
                <option value={ALL}>All grounds</option>
                {groundOptions.map(([id, name]) => <option key={id} value={id}>{name}</option>)}
              </select>
            </div>
            <div className="min-w-[120px]">
              <label className="font-rajdhani text-[11px] font-bold tracking-widest uppercase text-zinc-500">
                Format
              </label>
              <select
                value={formatFilter}
                onChange={e => setFormatFilter(e.target.value)}
                className="w-full mt-1 bg-ink-4 border border-ink-5 rounded px-2.5 py-1.5 font-rajdhani text-sm text-zinc-200">
                <option value={ALL}>All formats</option>
                {formatOptions.map(f => <option key={f} value={f}>{f}</option>)}
              </select>
            </div>
            {hasActiveFilter && (
              <button
                onClick={() => { setMatchIdQuery(''); setTournamentFilter(ALL); setGroundFilter(ALL); setFormatFilter(ALL) }}
                className="font-rajdhani text-xs font-semibold text-zinc-500 hover:text-gold px-2 py-1.5 transition-colors">
                Clear filters
              </button>
            )}
          </div>

          {filtered.length === 0 ? (
            <p className="font-rajdhani text-sm text-zinc-600">No matches found for the current filters.</p>
          ) : (
            <>
              <div className="bg-ink-3 border border-ink-5 rounded p-4 mb-4 flex items-center justify-between flex-wrap gap-3">
                <div className="flex items-center gap-3">
                  <button
                    onClick={toggleAllFiltered}
                    disabled={running}
                    className="font-rajdhani text-xs font-semibold text-zinc-500 hover:text-gold disabled:opacity-40 transition-colors">
                    {filtered.every(b => selected.has(b.booking_id)) ? 'Deselect all shown' : 'Select all shown'}
                  </button>
                  <p className="font-rajdhani text-sm text-zinc-400">
                    {selectedInFiltered.length} of {filtered.length} shown selected
                    {hasActiveFilter && ` (${bookings.length} total)`}
                    {hasRun && ` · ${successCount} done, ${failedCount} failed`}
                  </p>
                </div>
                <button
                  onClick={runBackfill}
                  disabled={running || selectedInFiltered.length === 0}
                  className="font-rajdhani text-sm font-bold tracking-widest uppercase bg-gold/10 border border-gold-dim text-gold hover:bg-gold/20 disabled:opacity-40 px-5 py-2.5 rounded transition-colors">
                  {running ? 'Running…' : `Run Backfill (${selectedInFiltered.length})`}
                </button>
              </div>

              {selectedFeesApplied.length > 0 && (
                <div className="bg-blue-950/30 border border-blue-800 text-blue-300 font-rajdhani text-sm px-4 py-3 rounded mb-4">
                  ⚠ {selectedFeesApplied.length} selected match{selectedFeesApplied.length > 1 ? 'es' : ''} already
                  {selectedFeesApplied.length > 1 ? ' have' : ' has'} fees applied. Re-running will re-fetch and
                  re-sync stats only — fees are never re-applied here. Do not click &ldquo;Apply Fees&rdquo; again for
                  {selectedFeesApplied.length > 1 ? ' these matches' : ' this match'} afterwards, or players get
                  double-charged.
                </div>
              )}

              <div className="space-y-2">
                {filtered.map(b => {
                  const result = results[b.booking_id]
                  const status: RowStatus = result?.status ?? 'idle'
                  return (
                    <div key={b.booking_id} className="bg-ink-3 border border-ink-5 rounded px-4 py-3 flex items-center gap-3">
                      <input
                        type="checkbox"
                        checked={selected.has(b.booking_id)}
                        disabled={running}
                        onChange={() => toggle(b.booking_id)}
                        className="flex-shrink-0"
                      />
                      <div className="flex-1 min-w-0">
                        <p className="font-rajdhani text-sm text-zinc-300">
                          {b.game_date} · {b.slot_time} {b.format ?? ''} · vs {b.opponent_name ?? 'TBD'}
                          <span className="text-zinc-600"> · match_id {b.match_id}</span>
                        </p>
                        <p className="font-rajdhani text-xs text-zinc-600 mt-0.5">
                          {b.tournament_name ?? 'No tournament'}{b.ground_name ? ` · ${b.ground_name}` : ''}
                        </p>
                        {(result?.message || (status === 'idle' && b.error_message)) && (
                          <p className="font-rajdhani text-xs text-red-400 mt-0.5">
                            {result?.message ?? b.error_message}
                          </p>
                        )}
                      </div>
                      <CurrentStatusBadge status={b.current_status} />
                      <RunStatusBadge status={status} />
                      <Link
                        href={`/admin/bookings/${b.booking_id}`}
                        className="font-rajdhani text-xs text-zinc-600 hover:text-gold border border-ink-5 hover:border-gold-dim px-2 py-1 rounded transition-colors flex-shrink-0">
                        Edit ↗
                      </Link>
                    </div>
                  )
                })}
              </div>
            </>
          )}
        </>
      )}
    </div>
  )
}
