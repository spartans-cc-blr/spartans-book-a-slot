'use client'

/*
 * Two-step captain promotion flow:
 * 1. /admin/players → toggle is_captain = true on the player
 * 2. /admin/captains → player appears in "Action Required" section → click "+ Add to Roster"
 *    → player is now selectable in booking forms and visible in Tournament Planner bandwidth view
 * A captain with no active (upcoming) tournaments sees the full planner view.
 * A captain with at least one upcoming booking sees their personal bandwidth card first.
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
  players: CaptainPlayer | null
}

type Player = {
  id: string
  name: string
  is_captain: boolean
  active: boolean
  cricheroes_url: string | null
}

function InfoCallout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex gap-3 p-4 rounded-lg border border-amber-800/60 bg-amber-950/20 mb-6">
      <span className="text-amber-400 text-base flex-shrink-0">⚠️</span>
      <div className="font-rajdhani text-sm text-amber-200/80 leading-relaxed">
        {children}
      </div>
    </div>
  )
}

export default function AdminCaptainsPage() {
  const [captains,    setCaptains]    = useState<Captain[]>([])
  const [allPlayers,  setAllPlayers]  = useState<Player[]>([])
  const [loading,     setLoading]     = useState(true)
  const [saving,      setSaving]      = useState<string | null>(null)
  const [error,       setError]       = useState('')
  const [linkingId,   setLinkingId]   = useState<string | null>(null)
  const [linkPlayerId, setLinkPlayerId] = useState('')
  const [showInactive, setShowInactive] = useState(false)

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

  const activeCaptains   = captains.filter(c => c.active)
  const inactiveCaptains = captains.filter(c => !c.active)

  const captainPlayers       = allPlayers.filter(p => p.is_captain && p.active)
  const linkedPlayerIds      = new Set(captains.map(c => c.player_id).filter(Boolean))
  const unlinkedCaptainPlayers = captainPlayers.filter(p => !linkedPlayerIds.has(p.id))
  const availableToLink      = captainPlayers.filter(p => !linkedPlayerIds.has(p.id))

  async function markInactive(captain: Captain) {
    setSaving(captain.id)
    const res = await fetch('/api/captains', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: captain.id, active: false }),
    })
    if (res.ok) {
      const d = await res.json()
      setCaptains(prev => prev.map(c => c.id === captain.id ? d.captain : c))
    } else {
      setError('Failed to update.')
    }
    setSaving(null)
  }

  async function reactivate(captain: Captain) {
    setSaving(captain.id)
    const res = await fetch('/api/captains', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: captain.id, active: true }),
    })
    if (res.ok) {
      const d = await res.json()
      setCaptains(prev => prev.map(c => c.id === captain.id ? d.captain : c))
    } else {
      setError('Failed to reactivate.')
    }
    setSaving(null)
  }

  async function linkPlayer(captainId: string, playerId: string) {
    setSaving(captainId)
    const res = await fetch('/api/captains', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: captainId, player_id: playerId }),
    })
    if (res.ok) {
      const d = await res.json()
      setCaptains(prev => prev.map(c => c.id === captainId ? d.captain : c))
      setLinkingId(null)
      setLinkPlayerId('')
    } else {
      const d = await res.json()
      setError(d.error ?? 'Failed to link player.')
    }
    setSaving(null)
  }

  async function addToRoster(player: Player) {
    setSaving(player.id)
    const res = await fetch('/api/captains', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: player.name, player_id: player.id }),
    })
    if (res.ok) {
      const d = await res.json()
      setCaptains(prev => [d.captain, ...prev])
    } else {
      const d = await res.json()
      setError(d.error ?? 'Failed to add to roster.')
    }
    setSaving(null)
  }

  function CaptainTable({ list, inactive = false }: { list: Captain[]; inactive?: boolean }) {
    return (
      <div className={`bg-ink-3 border border-ink-5 rounded overflow-hidden${inactive ? ' opacity-60' : ''}`}>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-ink-5 bg-ink-4">
                {['Name', 'Linked Player', 'CricHeroes', ''].map(h => (
                  <th key={h} className="font-rajdhani text-[10px] font-bold tracking-[2px] uppercase text-zinc-600 px-4 py-2.5 text-left whitespace-nowrap">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {list.length === 0 && (
                <tr><td colSpan={4} className="px-4 py-6 text-center font-rajdhani text-zinc-600 text-sm">None.</td></tr>
              )}
              {list.map(captain => (
                <tr key={captain.id} className="border-b border-ink-4 hover:bg-ink-4 transition-colors">
                  <td className="px-4 py-3 font-rajdhani font-semibold text-sm text-parchment">{captain.name}</td>
                  <td className="px-4 py-3 font-rajdhani text-sm">
                    {linkingId === captain.id ? (
                      <div className="flex items-center gap-2">
                        <select
                          value={linkPlayerId}
                          onChange={e => setLinkPlayerId(e.target.value)}
                          className="form-input text-xs py-1"
                        >
                          <option value="">Select player…</option>
                          {availableToLink.map(p => (
                            <option key={p.id} value={p.id}>{p.name}</option>
                          ))}
                        </select>
                        <button
                          onClick={() => linkPlayerId && linkPlayer(captain.id, linkPlayerId)}
                          disabled={!linkPlayerId || saving === captain.id}
                          className="font-rajdhani text-xs font-bold px-2 py-1 rounded bg-gold/10 border border-gold-dim text-gold hover:bg-gold/20 transition-colors disabled:opacity-50"
                        >
                          {saving === captain.id ? '…' : 'Confirm'}
                        </button>
                        <button
                          onClick={() => { setLinkingId(null); setLinkPlayerId('') }}
                          className="font-rajdhani text-xs text-zinc-500 hover:text-zinc-300 transition-colors"
                        >
                          Cancel
                        </button>
                      </div>
                    ) : captain.player_id && captain.players ? (
                      captain.players.cricheroes_url ? (
                        <a href={captain.players.cricheroes_url} target="_blank" rel="noopener noreferrer"
                           className="hover:text-gold underline underline-offset-2 transition-colors">
                          {captain.players.name}
                        </a>
                      ) : (
                        <span className="text-zinc-400">{captain.players.name}</span>
                      )
                    ) : (
                      <div className="flex items-center gap-2">
                        <span className="text-zinc-600">Not linked</span>
                        {availableToLink.length > 0 && (
                          <button
                            onClick={() => { setLinkingId(captain.id); setLinkPlayerId('') }}
                            className="font-rajdhani text-[10px] font-bold px-1.5 py-0.5 rounded border border-ink-5 text-zinc-500 hover:text-gold hover:border-gold-dim transition-colors"
                          >
                            Link Player
                          </button>
                        )}
                      </div>
                    )}
                  </td>
                  <td className="px-4 py-3 font-rajdhani text-sm text-zinc-400">
                    {captain.players?.cricheroes_url ? (
                      <a href={captain.players.cricheroes_url} target="_blank" rel="noopener noreferrer"
                         className="text-gold hover:text-gold/80 transition-colors" title="CricHeroes profile">
                        ↗
                      </a>
                    ) : '—'}
                  </td>
                  <td className="px-4 py-3">
                    {inactive ? (
                      <button
                        onClick={() => reactivate(captain)}
                        disabled={saving === captain.id}
                        className="font-rajdhani text-xs text-zinc-500 hover:text-emerald-400 border border-ink-5 hover:border-emerald-800 px-2 py-1 rounded transition-colors disabled:opacity-50"
                      >
                        {saving === captain.id ? '…' : 'Reactivate'}
                      </button>
                    ) : (
                      <button
                        onClick={() => markInactive(captain)}
                        disabled={saving === captain.id}
                        className="font-rajdhani text-xs text-zinc-500 hover:text-red-400 border border-ink-5 hover:border-red-900 px-2 py-1 rounded transition-colors disabled:opacity-50"
                        title="Mark inactive"
                      >
                        {saving === captain.id ? '…' : 'Mark Inactive'}
                      </button>
                    )}
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
          Manage the captains roster — link players, activate and deactivate captains.
        </p>
      </div>

      {error && (
        <div className="mb-4 p-3 rounded border border-red-900 bg-red-950/20 font-rajdhani text-sm text-red-400">
          {error}
          <button onClick={() => setError('')} className="ml-3 text-zinc-500 hover:text-zinc-300 transition-colors">✕</button>
        </div>
      )}

      {loading ? (
        <p className="font-rajdhani text-zinc-600 text-sm">Loading…</p>
      ) : (
        <>
          {/* Action Required — unlinked captain players */}
          {unlinkedCaptainPlayers.length > 0 && (
            <div className="mb-8">
              <h2 className="font-cinzel text-sm font-semibold text-amber-400 mb-3 tracking-wide">
                Action Required
              </h2>
              <InfoCallout>
                <strong>Players flagged as captain but not yet on the captains roster.</strong>
                <br />
                These players have the Captain flag set in the Players directory but haven&apos;t been
                added to the captains roster yet. Add them here before they can be assigned to
                bookings or appear in the Tournament Planner.
              </InfoCallout>
              {unlinkedCaptainPlayers.map(player => (
                <div key={player.id} className="flex items-center justify-between p-3 bg-ink-3 border border-ink-5 rounded mb-2">
                  <div>
                    {player.cricheroes_url ? (
                      <a href={player.cricheroes_url} target="_blank" rel="noopener noreferrer"
                         className="font-rajdhani font-semibold text-parchment hover:text-gold underline underline-offset-2">
                        {player.name}
                      </a>
                    ) : (
                      <span className="font-rajdhani font-semibold text-parchment">{player.name}</span>
                    )}
                    <span className="ml-2 font-rajdhani text-[10px] px-1.5 py-0.5 rounded bg-amber-950/40 border border-amber-800/50 text-amber-400">
                      Not on captains roster
                    </span>
                  </div>
                  <button
                    onClick={() => addToRoster(player)}
                    disabled={saving === player.id}
                    className="font-rajdhani text-xs font-bold px-3 py-1.5 rounded bg-gold/10 border border-gold-dim text-gold hover:bg-gold/20 transition-colors disabled:opacity-50">
                    {saving === player.id ? 'Adding…' : '+ Add to Roster'}
                  </button>
                </div>
              ))}
            </div>
          )}

          {/* Active Captains */}
          <div className="mb-8">
            <h2 className="font-cinzel text-sm font-semibold text-gold mb-3 tracking-wide">
              Active Captains
            </h2>
            <CaptainTable list={activeCaptains} />
          </div>

          {/* Inactive Captains — collapsed by default */}
          {inactiveCaptains.length > 0 && (
            <div>
              <button
                onClick={() => setShowInactive(v => !v)}
                className="font-rajdhani text-xs text-zinc-500 hover:text-zinc-300 transition-colors mb-3"
              >
                {showInactive
                  ? `Hide inactive captains`
                  : `Show inactive captains (${inactiveCaptains.length})`}
              </button>
              {showInactive && <CaptainTable list={inactiveCaptains} inactive />}
            </div>
          )}
        </>
      )}
    </div>
  )
}