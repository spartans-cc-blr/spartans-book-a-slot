'use client'

import { useEffect, useState } from 'react'

interface Candidate {
  id:             string
  name:           string
  cricheroes_url: string
}

type RowStatus = 'idle' | 'processing' | 'resolved' | 'unresolved' | 'failed'

// Real network calls to chshare.link/Render, not pure DB writes — some
// courtesy pacing between attempts, same spirit as the CricHeroes PDF
// backfill page, though this one's per-item worst case is longer (up to
// ~36s: 6s direct Vercel attempt + up to 30s Render cold-start fallback).
const DELAY_BETWEEN_MS = 3000

const STATUS_CONFIG: Record<RowStatus, { label: string; className: string }> = {
  idle:       { label: 'Pending',    className: 'bg-ink-4 border-ink-5 text-zinc-500' },
  processing: { label: 'Resolving…', className: 'bg-amber-950/40 border-amber-800 text-amber-400' },
  resolved:   { label: 'Resolved ✓', className: 'bg-emerald-950/40 border-emerald-800 text-emerald-400' },
  unresolved: { label: 'No ID found', className: 'bg-ink-4 border-ink-5 text-zinc-500' },
  failed:     { label: 'Failed',     className: 'bg-red-950/40 border-red-800 text-red-400' },
}

function StatusBadge({ status }: { status: RowStatus }) {
  const cfg = STATUS_CONFIG[status]
  return (
    <span className={`font-rajdhani text-[11px] font-bold px-2.5 py-1 rounded border flex-shrink-0 ${cfg.className}`}>
      {cfg.label}
    </span>
  )
}

export default function CricheroesIdBackfillPage() {
  const [candidates, setCandidates] = useState<Candidate[]>([])
  const [selected, setSelected]     = useState<Set<string>>(new Set())
  const [loading, setLoading]       = useState(true)
  const [loadError, setLoadError]   = useState('')
  const [running, setRunning]       = useState(false)
  const [results, setResults]       = useState<Record<string, { status: RowStatus; message?: string }>>({})

  useEffect(() => {
    fetch('/api/admin/cricheroes-id-backfill')
      .then(res => res.json())
      .then(data => {
        if (data.error) { setLoadError(data.error); return }
        setCandidates(data.players ?? [])
        setSelected(new Set((data.players ?? []).map((p: Candidate) => p.id)))
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
    setSelected(prev => prev.size === candidates.length ? new Set() : new Set(candidates.map(c => c.id)))
  }

  async function runBackfill() {
    setRunning(true)
    const toProcess = candidates.filter(c => selected.has(c.id))

    for (let i = 0; i < toProcess.length; i++) {
      const c = toProcess[i]
      setResults(prev => ({ ...prev, [c.id]: { status: 'processing' } }))
      try {
        const res = await fetch('/api/admin/cricheroes-id-backfill', {
          method:  'POST',
          headers: { 'Content-Type': 'application/json' },
          body:    JSON.stringify({ player_id: c.id }),
        })
        const data = await res.json()
        if (!res.ok) {
          setResults(prev => ({ ...prev, [c.id]: { status: 'failed', message: data.error ?? 'Unknown error' } }))
        } else if (data.cricheroes_player_id) {
          setResults(prev => ({ ...prev, [c.id]: { status: 'resolved', message: data.cricheroes_player_id } }))
        } else {
          setResults(prev => ({ ...prev, [c.id]: { status: 'unresolved' } }))
        }
      } catch {
        setResults(prev => ({ ...prev, [c.id]: { status: 'failed', message: 'Network error' } }))
      }
      if (i < toProcess.length - 1) {
        await new Promise(r => setTimeout(r, DELAY_BETWEEN_MS))
      }
    }
    setRunning(false)
  }

  const resolvedCount   = Object.values(results).filter(r => r.status === 'resolved').length
  const unresolvedCount = Object.values(results).filter(r => r.status === 'unresolved').length
  const failedCount     = Object.values(results).filter(r => r.status === 'failed').length
  const hasRun          = Object.keys(results).length > 0

  return (
    <div>
      <div className="mb-6">
        <h1 className="font-cinzel text-xl font-bold text-gold">CricHeroes ID Backfill</h1>
        <p className="font-rajdhani text-sm text-zinc-500 mt-1">
          Re-resolves <code className="text-zinc-400">cricheroes_player_id</code> for players who already have a{' '}
          <code className="text-zinc-400">cricheroes_url</code> saved but no extracted ID yet — most likely because
          they saved before the resolver (or its Render fallback for chshare.link share links) existed. Doesn&apos;t
          touch <code className="text-zinc-400">cricheroes_url</code> itself, only re-derives the ID from what&apos;s
          already there.
        </p>
      </div>

      {loading && <p className="font-rajdhani text-sm text-zinc-600">Loading…</p>}
      {loadError && <p className="font-rajdhani text-sm text-red-400">{loadError}</p>}

      {!loading && !loadError && candidates.length === 0 && (
        <p className="font-rajdhani text-sm text-zinc-600">Nothing pending — every saved CricHeroes URL already has an extracted ID.</p>
      )}

      {!loading && !loadError && candidates.length > 0 && (
        <>
          <div className="bg-ink-3 border border-ink-5 rounded p-4 mb-4 flex items-center justify-between flex-wrap gap-3">
            <div className="flex items-center gap-3">
              <button
                onClick={toggleAll}
                disabled={running}
                className="font-rajdhani text-xs font-semibold text-zinc-500 hover:text-gold disabled:opacity-40 transition-colors">
                {selected.size === candidates.length ? 'Deselect all' : 'Select all'}
              </button>
              <p className="font-rajdhani text-sm text-zinc-400">
                {selected.size} of {candidates.length} selected
                {hasRun && ` · ${resolvedCount} resolved, ${unresolvedCount} no ID, ${failedCount} failed`}
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
            {candidates.map(c => {
              const result = results[c.id]
              const status: RowStatus = result?.status ?? 'idle'
              return (
                <div key={c.id} className="bg-ink-3 border border-ink-5 rounded px-4 py-3 flex items-center gap-3">
                  <input
                    type="checkbox"
                    checked={selected.has(c.id)}
                    disabled={running}
                    onChange={() => toggle(c.id)}
                    className="flex-shrink-0"
                  />
                  <div className="flex-1 min-w-0">
                    <p className="font-rajdhani text-sm text-zinc-300">{c.name}</p>
                    <p className="font-rajdhani text-xs text-zinc-600 truncate">{c.cricheroes_url}</p>
                    {status === 'resolved' && result?.message && (
                      <p className="font-rajdhani text-xs text-emerald-500 mt-0.5">ID: {result.message}</p>
                    )}
                    {status === 'failed' && result?.message && (
                      <p className="font-rajdhani text-xs text-red-400 mt-0.5">{result.message}</p>
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
