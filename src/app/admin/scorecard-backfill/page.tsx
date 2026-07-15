'use client'

import { useEffect, useState } from 'react'

interface EligibleBooking {
  booking_id:     string
  game_date:      string
  slot_time:      string
  opponent_name:  string | null
  match_id:       string
  current_status: string | null
  error_message:  string | null
}

type RowStatus = 'idle' | 'processing' | 'success' | 'failed'

// Respectful pacing between CricHeroes fetches — same spirit as the
// wrangler's standalone download_scorecard.py (a few seconds between
// requests rather than firing them all at once).
const DELAY_BETWEEN_MS = 4000

const STATUS_CONFIG: Record<RowStatus, { label: string; className: string }> = {
  idle:       { label: 'Pending',   className: 'bg-ink-4 border-ink-5 text-zinc-500' },
  processing: { label: 'Fetching…', className: 'bg-amber-950/40 border-amber-800 text-amber-400' },
  success:    { label: 'Done ✓',    className: 'bg-emerald-950/40 border-emerald-800 text-emerald-400' },
  failed:     { label: 'Failed',    className: 'bg-red-950/40 border-red-800 text-red-400' },
}

function StatusBadge({ status }: { status: RowStatus }) {
  const cfg = STATUS_CONFIG[status]
  return (
    <span className={`font-rajdhani text-[11px] font-bold px-2.5 py-1 rounded border flex-shrink-0 ${cfg.className}`}>
      {cfg.label}
    </span>
  )
}

export default function ScorecardBackfillPage() {
  const [bookings, setBookings] = useState<EligibleBooking[]>([])
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [loading, setLoading]   = useState(true)
  const [loadError, setLoadError] = useState('')
  const [running, setRunning]   = useState(false)
  const [results, setResults]   = useState<Record<string, { status: RowStatus; message?: string }>>({})

  useEffect(() => {
    fetch('/api/admin/scorecard-backfill')
      .then(res => res.json())
      .then(data => {
        if (data.error) { setLoadError(data.error); return }
        setBookings(data.bookings ?? [])
        setSelected(new Set((data.bookings ?? []).map((b: EligibleBooking) => b.booking_id)))
      })
      .catch(() => setLoadError('Network error'))
      .finally(() => setLoading(false))
  }, [])

  function toggle(id: string) {
    setSelected(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id); else next.add(id)
      return next
    })
  }

  function toggleAll() {
    setSelected(prev => prev.size === bookings.length ? new Set() : new Set(bookings.map(b => b.booking_id)))
  }

  async function runBackfill() {
    setRunning(true)
    const toProcess = bookings.filter(b => selected.has(b.booking_id))

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

  const successCount = Object.values(results).filter(r => r.status === 'success').length
  const failedCount  = Object.values(results).filter(r => r.status === 'failed').length
  const hasRun       = Object.keys(results).length > 0

  return (
    <div>
      <div className="mb-6">
        <h1 className="font-cinzel text-xl font-bold text-gold">Scorecard Backfill</h1>
        <p className="font-rajdhani text-sm text-zinc-500 mt-1">
          Fetch and parse scorecards directly from CricHeroes for past matches that were never uploaded.
          Each match still needs a manual &ldquo;Sync Stats&rdquo; confirmation afterwards — this only gets them
          to &ldquo;Awaiting Admin Sync&rdquo;.
        </p>
      </div>

      {loading && <p className="font-rajdhani text-sm text-zinc-600">Loading…</p>}
      {loadError && <p className="font-rajdhani text-sm text-red-400">{loadError}</p>}

      {!loading && !loadError && bookings.length === 0 && (
        <p className="font-rajdhani text-sm text-zinc-600">No unsynced past matches found — everything&apos;s up to date.</p>
      )}

      {!loading && !loadError && bookings.length > 0 && (
        <>
          <div className="bg-ink-3 border border-ink-5 rounded p-4 mb-4 flex items-center justify-between flex-wrap gap-3">
            <div className="flex items-center gap-3">
              <button
                onClick={toggleAll}
                disabled={running}
                className="font-rajdhani text-xs font-semibold text-zinc-500 hover:text-gold disabled:opacity-40 transition-colors">
                {selected.size === bookings.length ? 'Deselect all' : 'Select all'}
              </button>
              <p className="font-rajdhani text-sm text-zinc-400">
                {selected.size} of {bookings.length} selected
                {hasRun && ` · ${successCount} done, ${failedCount} failed`}
              </p>
            </div>
            <button
              onClick={runBackfill}
              disabled={running || selected.size === 0}
              className="font-rajdhani text-sm font-bold tracking-widest uppercase bg-gold/10 border border-gold-dim text-gold hover:bg-gold/20 disabled:opacity-40 px-5 py-2.5 rounded transition-colors">
              {running ? 'Running…' : `Run Backfill (${selected.size})`}
            </button>
          </div>

          <div className="space-y-2">
            {bookings.map(b => {
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
                      {b.game_date} · vs {b.opponent_name ?? 'TBD'}
                      <span className="text-zinc-600"> · match_id {b.match_id}</span>
                    </p>
                    {(result?.message || (status === 'idle' && b.error_message)) && (
                      <p className="font-rajdhani text-xs text-red-400 mt-0.5">
                        {result?.message ?? b.error_message}
                      </p>
                    )}
                  </div>
                  <StatusBadge status={status} />
                </div>
              )
            })}
          </div>
        </>
      )}
    </div>
  )
}
