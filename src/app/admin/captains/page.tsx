'use client'

/*
 * Two-step captain promotion flow:
 * 1. /admin/players → toggle is_captain = true on the player
 * 2. /admin/captains → player appears in "Promote to Captain" section → click "+ Add as Captain"
 *    → player is now selectable in booking forms and visible in Tournament Planner bandwidth view
 *
 * SCD (Slowly Changing Dimension) dates:
 * - captain_since: recorded when promoted, admin can set past/future date
 * - inactive_since: recorded when marked inactive, admin can set past/future date
 */

import React, { useState, useEffect } from 'react'

type CaptainPlayer = {
  id: string
  name: string
  cricheroes_url: string | null
  is_captain: boolean
}

type Captain = {
  id: string
  name: string
  active: boolean
  player_id: string | null
  created_at: string
  captain_since: string | null
  inactive_since: string | null
  players: CaptainPlayer | null
}

type Player = {
  id: string
  name: string
  is_captain: boolean
  status: 'active' | 'inactive' | 'expelled'
  cricheroes_url: string | null
}

function InfoCallout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex gap-3 p-4 rounded-lg border border-amber-800/60 bg-amber-950/20 mb-4">
      <span className="text-amber-400 text-base flex-shrink-0">⚠️</span>
      <div className="font-rajdhani text-sm text-amber-200/80 leading-relaxed">
        {children}
      </div>
    </div>
  )
}

function today(): string {
  return new Date().toISOString().split('T')[0]
}

function formatDate(d: string | null): string {
  if (!d) return '—'
  return new Date(d).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })
}

export default function AdminCaptainsPage() {
  const [captains,      setCaptains]      = useState<Captain[]>([])
  const [allPlayers,    setAllPlayers]    = useState<Player[]>([])
  const [loading,       setLoading]       = useState(true)
  const [saving,        setSaving]        = useState<string | null>(null)
  const [error,         setError]         = useState('')
  const [showInactive,  setShowInactive]  = useState(false)

  // Inline date pickers — keyed by captain/player id
  const [inactiveDate,  setInactiveDate]  = useState<Record<string, string>>({})
  const [promoteDate,   setPromoteDate]   = useState<Record<string, string>>({})

  useEffect(() => {
    Promise.all([
      fetch('/api/captains?all=true').then(r => r.json()),
      fetch('/api/players').then(r => r.json()),
    ]).then(([c, p]) => {
      setCaptains(c.captains ?? [])
      setAllPlayers(p.players ?? [])
      setLoading(false)
    })
  }, [])

  const activeCaptains     = captains.filter(c => c.active)
  const inactiveCaptains   = captains.filter(c => !c.active)
  const captainPlayers     = allPlayers.filter(p => p.is_captain && p.status !== 'expelled')
  const linkedPlayerIds    = new Set(captains.map(c => c.player_id).filter(Boolean))
  const unlinkedCaptainPlayers = captainPlayers.filter(p => !linkedPlayerIds.has(p.id))

  async function markInactive(captain: Captain) {
    const date = inactiveDate[captain.id] || today()
    setSaving(captain.id)
    const res = await fetch('/api/captains', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: captain.id, active: false, inactive_since: date }),
    })
    if (res.ok) {
      const d = await res.json()
      setCaptains(prev => prev.map(c => c.id === captain.id ? d.captain : c))
    } else {
      setError('Failed to mark inactive.')
    }
    setSaving(null)
  }

  async function reactivate(captain: Captain) {
    setSaving(captain.id)
    const res = await fetch('/api/captains', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: captain.id, active: true, inactive_since: null }),
    })
    if (res.ok) {
      const d = await res.json()
      setCaptains(prev => prev.map(c => c.id === captain.id ? d.captain : c))
    } else {
      setError('Failed to reactivate.')
    }
    setSaving(null)
  }

  async function addAsCaptain(player: Player) {
    const date = promoteDate[player.id] || today()
    setSaving(player.id)
    const res = await fetch('/api/captains', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: player.name, player_id: player.id, captain_since: date }),
    })
    if (res.ok) {
      const d = await res.json()
      setCaptains(prev => [d.captain, ...prev])
    } else {
      const d = await res.json()
      setError(d.error ?? 'Failed to add as captain.')
    }
    setSaving(null)
  }

  function CaptainName({ captain }: { captain: Captain }) {
    const url = captain.players?.cricheroes_url
    if (url) {
      return (
        <a href={url} target="_blank" rel="noopener noreferrer"
           onClick={e => e.stopPropagation()}
           className="font-rajdhani font-semibold text-sm text-parchment hover:text-gold underline underline-offset-2 transition-colors">
          {captain.name}
        </a>
      )
    }
    return <span className="font-rajdhani font-semibold text-sm text-parchment">{captain.name}</span>
  }

  function ActiveCaptainsTable() {
    if (activeCaptains.length === 0) {
      return (
        <div className="bg-ink-3 border border-ink-5 rounded p-6 text-center font-rajdhani text-zinc-600 text-sm">
          No active captains.
        </div>
      )
    }
    return (
      <div className="bg-ink-3 border border-ink-5 rounded overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-ink-5 bg-ink-4">
                {['Name', 'Captain Since', ''].map(h => (
                  <th key={h} className="font-rajdhani text-[10px] font-bold tracking-[2px] uppercase text-zinc-600 px-4 py-2.5 text-left whitespace-nowrap">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {activeCaptains.map(captain => (
                <tr key={captain.id} className="border-b border-ink-4 last:border-0 hover:bg-ink-4 transition-colors">
                  <td className="px-4 py-3">
                    <CaptainName captain={captain} />
                  </td>
                  <td className="px-4 py-3 font-rajdhani text-sm text-zinc-400">
                    {formatDate(captain.captain_since)}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2 justify-end">
                      <input
                        type="date"
                        value={inactiveDate[captain.id] || today()}
                        onChange={e => setInactiveDate(prev => ({ ...prev, [captain.id]: e.target.value }))}
                        className="font-rajdhani text-xs bg-ink-4 border border-ink-5 rounded px-2 py-1 text-zinc-400 focus:border-zinc-600 focus:outline-none"
                        title="Inactive since date"
                      />
                      <button
                        onClick={() => markInactive(captain)}
                        disabled={saving === captain.id}
                        className="font-rajdhani text-xs text-zinc-500 hover:text-red-400 border border-ink-5 hover:border-red-900 px-2 py-1 rounded transition-colors disabled:opacity-50 whitespace-nowrap"
                      >
                        {saving === captain.id ? '…' : 'Mark Inactive'}
                      </button>
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

  function InactiveCaptainsTable() {
    return (
      <div className="bg-ink-3 border border-ink-5 rounded overflow-hidden opacity-70">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-ink-5 bg-ink-4">
                {['Name', 'Captain Since', 'Inactive Since', ''].map(h => (
                  <th key={h} className="font-rajdhani text-[10px] font-bold tracking-[2px] uppercase text-zinc-600 px-4 py-2.5 text-left whitespace-nowrap">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {inactiveCaptains.map(captain => (
                <tr key={captain.id} className="border-b border-ink-4 last:border-0 hover:bg-ink-4 transition-colors">
                  <td className="px-4 py-3">
                    <CaptainName captain={captain} />
                  </td>
                  <td className="px-4 py-3 font-rajdhani text-sm text-zinc-500">
                    {formatDate(captain.captain_since)}
                  </td>
                  <td className="px-4 py-3 font-rajdhani text-sm text-zinc-500">
                    {formatDate(captain.inactive_since)}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <button
                      onClick={() => reactivate(captain)}
                      disabled={saving === captain.id}
                      className="font-rajdhani text-xs text-zinc-500 hover:text-emerald-400 border border-ink-5 hover:border-emerald-800 px-2 py-1 rounded transition-colors disabled:opacity-50"
                    >
                      {saving === captain.id ? '…' : 'Reactivate'}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    )
  }

  return (
    <div>
      <div className="mb-6">
        <h1 className="font-cinzel text-xl font-bold text-gold">Captains</h1>
        <p className="font-rajdhani text-zinc-500 text-sm mt-1">
          Manage captains — track promotion dates, activate and deactivate.
        </p>
      </div>

      {error && (
        <div className="mb-4 p-3 rounded border border-red-900 bg-red-950/20 font-rajdhani text-sm text-red-400 flex items-center justify-between">
          {error}
          <button onClick={() => setError('')} className="ml-3 text-zinc-500 hover:text-zinc-300 transition-colors">✕</button>
        </div>
      )}

      {loading ? (
        <p className="font-rajdhani text-zinc-600 text-sm">Loading…</p>
      ) : (
        <>
          {/* ── 1. Active Captains ── */}
          <div className="mb-8">
            <h2 className="font-cinzel text-sm font-semibold text-gold mb-3 tracking-wide">
              Active Captains
            </h2>
            <ActiveCaptainsTable />
          </div>

          {/* ── 2. Promote to Captain ── */}
          {unlinkedCaptainPlayers.length > 0 && (
            <div className="mb-8">
              <h2 className="font-cinzel text-sm font-semibold text-amber-400 mb-3 tracking-wide">
                Promote to Captain
              </h2>
              <InfoCallout>
                <strong>Players flagged as captain but not yet added here.</strong>
                <br />
                These players have the Captain flag set in the Players directory but haven&apos;t been
                added here yet. Add them before they can be assigned to bookings or appear in the
                Tournament Planner. Set the date they became captain — defaults to today.
              </InfoCallout>
              {unlinkedCaptainPlayers.map(player => (
                <div key={player.id} className="flex items-center justify-between p-3 bg-ink-3 border border-ink-5 rounded mb-2">
                  <div className="flex items-center gap-2">
                    {player.cricheroes_url ? (
                      <a href={player.cricheroes_url} target="_blank" rel="noopener noreferrer"
                         className="font-rajdhani font-semibold text-parchment hover:text-gold underline underline-offset-2 transition-colors">
                        {player.name}
                      </a>
                    ) : (
                      <span className="font-rajdhani font-semibold text-parchment">{player.name}</span>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="flex flex-col items-end gap-0.5">
                      <label className="font-rajdhani text-[10px] text-zinc-600 uppercase tracking-wide">Captain since</label>
                      <input
                        type="date"
                        value={promoteDate[player.id] || today()}
                        onChange={e => setPromoteDate(prev => ({ ...prev, [player.id]: e.target.value }))}
                        className="font-rajdhani text-xs bg-ink-4 border border-ink-5 rounded px-2 py-1 text-zinc-400 focus:border-zinc-600 focus:outline-none"
                      />
                    </div>
                    <button
                      onClick={() => addAsCaptain(player)}
                      disabled={saving === player.id}
                      className="font-rajdhani text-xs font-bold px-3 py-1.5 rounded bg-gold/10 border border-gold-dim text-gold hover:bg-gold/20 transition-colors disabled:opacity-50 whitespace-nowrap">
                      {saving === player.id ? 'Adding…' : '+ Add as Captain'}
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* ── 3. Inactive Captains ── */}
          {inactiveCaptains.length > 0 && (
            <div>
              <button
                onClick={() => setShowInactive(v => !v)}
                className="font-rajdhani text-xs text-zinc-500 hover:text-zinc-300 transition-colors mb-3 flex items-center gap-1"
              >
                <span>{showInactive ? '▾' : '▸'}</span>
                {showInactive
                  ? 'Hide inactive captains'
                  : `Show inactive captains (${inactiveCaptains.length})`}
              </button>
              {showInactive && <InactiveCaptainsTable />}
            </div>
          )}
        </>
      )}
    </div>
  )
}