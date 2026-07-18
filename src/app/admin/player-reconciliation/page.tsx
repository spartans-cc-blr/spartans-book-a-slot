'use client'

import { useEffect, useState } from 'react'

interface MatchRef {
  match_id:      string
  game_date:     string | null
  opponent_name: string | null
}

interface Suggestion {
  id:             string
  name:           string
  dist:           number
  jersey_number:  string | number | null
  cricheroes_url: string | null
}

interface NameEntry {
  scorecard_name: string
  matches:        MatchRef[]
  suggestions?:   Suggestion[]
}

interface RosterPlayer {
  id:             string
  name:           string
  jersey_number:  string | number | null
  cricheroes_url: string | null
}

interface ReconciliationData {
  auto_resolved: NameEntry[]
  suggested:     NameEntry[]
  no_match:      NameEntry[]
  roster:        RosterPlayer[]
}

// Pure DB writes, not external-service fetches (unlike the CricHeroes
// courtesy pacing in /admin/scorecard-backfill) — a shorter delay is
// enough to avoid hammering the analytics DB while still keeping the
// "one call at a time, watch it happen" UX of that page.
const DELAY_BETWEEN_MS = 1500

function MatchList({ matches }: { matches: MatchRef[] }) {
  return (
    <p className="font-rajdhani text-xs text-zinc-500 mt-1">
      {matches.length} match{matches.length === 1 ? '' : 'es'}:{' '}
      {matches.slice(0, 4).map((m, i) => (
        <span key={m.match_id}>
          {i > 0 && ', '}
          {m.game_date ?? '?'}{m.opponent_name ? ` vs ${m.opponent_name}` : ''}
        </span>
      ))}
      {matches.length > 4 && ` +${matches.length - 4} more`}
    </p>
  )
}

function SearchPicker({
  roster, onPick, onCancel,
}: {
  roster: RosterPlayer[]
  onPick: (player: RosterPlayer) => void
  onCancel: () => void
}) {
  const [search, setSearch] = useState('')
  const filtered = roster.filter(p => p.name.toLowerCase().includes(search.toLowerCase())).slice(0, 20)
  return (
    <div className="mt-2 bg-ink border border-ink-5 rounded p-2">
      <div className="flex items-center justify-between mb-1.5">
        <input
          autoFocus
          type="text"
          placeholder="Search roster…"
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="flex-1 font-rajdhani text-xs bg-ink-3 border border-ink-5 rounded px-2 py-1 text-zinc-300 placeholder:text-zinc-700 outline-none"
        />
        <button onClick={onCancel} className="ml-2 font-rajdhani text-[11px] text-zinc-600 hover:text-zinc-400">✕</button>
      </div>
      <div className="flex flex-col gap-0.5 max-h-36 overflow-y-auto">
        {filtered.map(p => (
          <div key={p.id} className="flex items-center gap-1">
            <button
              onClick={() => onPick(p)}
              className="flex-1 text-left px-2 py-1 rounded hover:bg-ink-4 font-rajdhani text-xs text-zinc-300">
              {p.name}{p.jersey_number != null ? ` · #${p.jersey_number}` : ''}
            </button>
            {p.cricheroes_url && (
              <a
                href={p.cricheroes_url}
                target="_blank"
                rel="noopener noreferrer"
                title="Open this player's CricHeroes profile"
                className="font-rajdhani text-xs text-zinc-600 hover:text-gold px-1.5 flex-shrink-0">
                ↗
              </a>
            )}
          </div>
        ))}
        {filtered.length === 0 && <p className="font-rajdhani text-xs text-zinc-600 px-2 py-1">No matches.</p>}
      </div>
    </div>
  )
}

export default function PlayerReconciliationPage() {
  const [data, setData]       = useState<ReconciliationData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError]     = useState('')
  const [busyName, setBusyName] = useState<string | null>(null)
  const [pickerFor, setPickerFor] = useState<string | null>(null)
  const [running, setRunning] = useState(false)
  const [passResults, setPassResults] = useState<Record<string, { updated: number; error?: string }>>({})

  function load() {
    setLoading(true)
    setError('')
    fetch('/api/admin/player-reconciliation')
      .then(res => res.json())
      .then(d => {
        if (d.error) { setError(d.error); return }
        setData(d)
      })
      .catch(() => setError('Network error'))
      .finally(() => setLoading(false))
  }

  useEffect(load, [])

  async function post(body: any) {
    const res = await fetch('/api/admin/player-reconciliation', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify(body),
    })
    const d = await res.json().catch(() => ({}))
    if (!res.ok) throw new Error(d.error ?? `Failed (${res.status})`)
    return d
  }

  async function confirmGlobal(name: string, player: RosterPlayer) {
    setBusyName(name)
    try {
      await post({ mode: 'confirm', scorecard_name: name, player_id: player.id, scope: 'global' })
      load()
    } catch (e: any) {
      setError(e.message)
    } finally {
      setBusyName(null)
      setPickerFor(null)
    }
  }

  async function ignore(name: string) {
    setBusyName(name)
    try {
      await post({ mode: 'ignore', scorecard_name: name })
      load()
    } catch (e: any) {
      setError(e.message)
    } finally {
      setBusyName(null)
    }
  }

  async function runPass() {
    if (!data) return
    setRunning(true)
    setPassResults({})
    const allNames = [...data.auto_resolved, ...data.suggested, ...data.no_match].map(e => e.scorecard_name)
    for (let i = 0; i < allNames.length; i++) {
      const name = allNames[i]
      try {
        const d = await post({ mode: 'reconcile', scorecard_name: name })
        setPassResults(prev => ({ ...prev, [name]: { updated: d.updated ?? 0 } }))
      } catch (e: any) {
        setPassResults(prev => ({ ...prev, [name]: { updated: 0, error: e.message } }))
      }
      if (i < allNames.length - 1) await new Promise(r => setTimeout(r, DELAY_BETWEEN_MS))
    }
    setRunning(false)
    load()
  }

  const totalPending = data ? data.auto_resolved.length + data.suggested.length + data.no_match.length : 0

  return (
    <div>
      <div className="mb-6">
        <h1 className="font-cinzel text-xl font-bold text-gold">Player Reconciliation</h1>
        <p className="font-rajdhani text-sm text-zinc-500 mt-1">
          Resolves analytics-DB scorecard player names to Hub player profiles, so stats, leaderboards, and CricHeroes
          links survive a name change and never merge two same-named members together. See{' '}
          <code className="text-zinc-400">.claude/rules/features/player-identity-resolution.md</code>.
        </p>
      </div>

      {loading && <p className="font-rajdhani text-sm text-zinc-600">Loading…</p>}
      {error && <p className="font-rajdhani text-sm text-red-400 mb-3">{error}</p>}

      {!loading && data && (
        <>
          <div className="bg-ink-3 border border-ink-5 rounded p-4 mb-5 flex items-center justify-between flex-wrap gap-3">
            <p className="font-rajdhani text-sm text-zinc-400">
              {totalPending === 0
                ? 'Nothing pending — every scorecard name is resolved or ignored.'
                : <>
                    <span className="text-gold font-semibold">{data.auto_resolved.length}</span> ready to backfill ·{' '}
                    <span className="text-amber-400 font-semibold">{data.suggested.length}</span> need a decision ·{' '}
                    <span className="text-zinc-500 font-semibold">{data.no_match.length}</span> no suggestion
                  </>}
            </p>
            <button
              onClick={runPass}
              disabled={running || totalPending === 0}
              className="font-rajdhani text-sm font-bold tracking-widest uppercase bg-gold/10 border border-gold-dim text-gold hover:bg-gold/20 disabled:opacity-40 px-5 py-2.5 rounded transition-colors">
              {running ? 'Running…' : 'Run Reconciliation Pass'}
            </button>
          </div>

          {Object.keys(passResults).length > 0 && (
            <div className="bg-ink-3 border border-ink-5 rounded p-3 mb-5">
              <p className="font-rajdhani text-xs font-bold tracking-widest uppercase text-zinc-500 mb-1.5">Last pass</p>
              <div className="space-y-0.5">
                {Object.entries(passResults).map(([name, r]) => (
                  <p key={name} className="font-rajdhani text-xs text-zinc-400">
                    {name}: {r.error ? <span className="text-red-400">{r.error}</span> : `${r.updated} row(s) updated`}
                  </p>
                ))}
              </div>
            </div>
          )}

          {data.suggested.length > 0 && (
            <div className="mb-6">
              <h2 className="font-rajdhani text-xs font-bold tracking-widest uppercase text-zinc-500 mb-2">
                Needs a decision
              </h2>
              <div className="space-y-2">
                {data.suggested.map(entry => (
                  <div key={entry.scorecard_name} className="bg-ink-3 border border-ink-5 rounded px-4 py-3">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="font-rajdhani text-sm font-semibold text-parchment">{entry.scorecard_name}</p>
                        <MatchList matches={entry.matches} />
                      </div>
                      <button
                        onClick={() => ignore(entry.scorecard_name)}
                        disabled={busyName === entry.scorecard_name}
                        className="font-rajdhani text-[11px] text-zinc-600 hover:text-red-400 disabled:opacity-40 flex-shrink-0">
                        Ignore (not a member)
                      </button>
                    </div>
                    <div className="flex flex-wrap gap-1.5 mt-2">
                      {(entry.suggestions ?? []).map(s => (
                        <div key={s.id} className="flex items-stretch">
                          <button
                            onClick={() => confirmGlobal(entry.scorecard_name, s)}
                            disabled={busyName === entry.scorecard_name}
                            className={`font-rajdhani text-xs bg-ink-4 border border-ink-5 hover:border-gold-dim hover:text-gold text-zinc-300 px-2.5 py-1 disabled:opacity-40 transition-colors ${s.cricheroes_url ? 'rounded-l' : 'rounded'}`}>
                            {s.name}{s.jersey_number != null ? ` #${s.jersey_number}` : ''}
                          </button>
                          {s.cricheroes_url && (
                            <a
                              href={s.cricheroes_url}
                              target="_blank"
                              rel="noopener noreferrer"
                              title="Open this player's CricHeroes profile — cross-check before confirming"
                              className="font-rajdhani text-xs bg-ink-4 border border-l-0 border-ink-5 hover:border-gold-dim hover:text-gold text-zinc-500 px-2 py-1 rounded-r transition-colors">
                              ↗
                            </a>
                          )}
                        </div>
                      ))}
                      <button
                        onClick={() => setPickerFor(pickerFor === entry.scorecard_name ? null : entry.scorecard_name)}
                        className="font-rajdhani text-xs text-zinc-600 hover:text-zinc-400 px-2.5 py-1">
                        Search roster…
                      </button>
                    </div>
                    {(entry.suggestions?.length ?? 0) > 1 && (
                      <p className="font-rajdhani text-[11px] text-amber-500/80 mt-1">
                        Multiple same-named candidates — confirming here applies globally. If this is a per-match
                        collision, use &ldquo;Run Reconciliation Pass&rdquo; instead, which resolves each match
                        against its own squad automatically where possible.
                      </p>
                    )}
                    {pickerFor === entry.scorecard_name && (
                      <SearchPicker
                        roster={data.roster}
                        onPick={p => confirmGlobal(entry.scorecard_name, p)}
                        onCancel={() => setPickerFor(null)}
                      />
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {data.no_match.length > 0 && (
            <div className="mb-6">
              <h2 className="font-rajdhani text-xs font-bold tracking-widest uppercase text-zinc-500 mb-2">
                No suggestion (likely opponents)
              </h2>
              <div className="space-y-2">
                {data.no_match.map(entry => (
                  <div key={entry.scorecard_name} className="bg-ink-3 border border-ink-5 rounded px-4 py-3">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="font-rajdhani text-sm font-semibold text-parchment">{entry.scorecard_name}</p>
                        <MatchList matches={entry.matches} />
                      </div>
                      <button
                        onClick={() => ignore(entry.scorecard_name)}
                        disabled={busyName === entry.scorecard_name}
                        className="font-rajdhani text-[11px] text-zinc-600 hover:text-red-400 disabled:opacity-40 flex-shrink-0">
                        Ignore
                      </button>
                    </div>
                    <button
                      onClick={() => setPickerFor(pickerFor === entry.scorecard_name ? null : entry.scorecard_name)}
                      className="font-rajdhani text-xs text-zinc-600 hover:text-zinc-400 mt-2">
                      Search roster…
                    </button>
                    {pickerFor === entry.scorecard_name && (
                      <SearchPicker
                        roster={data.roster}
                        onPick={p => confirmGlobal(entry.scorecard_name, p)}
                        onCancel={() => setPickerFor(null)}
                      />
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {data.auto_resolved.length > 0 && (
            <div>
              <h2 className="font-rajdhani text-xs font-bold tracking-widest uppercase text-zinc-500 mb-2">
                Already resolved — pending backfill
              </h2>
              <div className="space-y-1.5">
                {data.auto_resolved.map(entry => (
                  <div key={entry.scorecard_name} className="bg-ink-3 border border-ink-5 rounded px-4 py-2.5">
                    <p className="font-rajdhani text-sm text-zinc-300">{entry.scorecard_name}</p>
                    <MatchList matches={entry.matches} />
                  </div>
                ))}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  )
}
