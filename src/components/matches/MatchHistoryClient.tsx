'use client'

import { useEffect, useMemo, useState } from 'react'
import { PlayerNameLink } from '@/lib/playerLink'

interface MatchSummary {
  booking_id:      string
  game_date:       string
  opponent_name:   string | null
  format:          string | null
  tournament_id:   string | null
  tournament_name: string | null
}

interface SquadPlayer {
  player_id:      string
  player_name:    string
  cricheroes_url: string | null
  is_captain:     boolean
  is_vc:          boolean
  is_wk:          boolean
}

interface MatchDetail {
  booking: MatchSummary & { cricheroes_url: string | null }
  squad:   SquadPlayer[]
}

interface Tournament {
  id:     string
  name:   string
  active: boolean
}

function pad(n: number) { return String(n).padStart(2, '0') }

function currentMonthStr(): string {
  const d = new Date()
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}`
}

function shiftMonth(month: string, delta: number): string {
  const [y, m] = month.split('-').map(Number)
  const idx = y * 12 + (m - 1) + delta
  return `${Math.floor(idx / 12)}-${pad((idx % 12) + 1)}`
}

function monthLabel(month: string): string {
  const [y, m] = month.split('-').map(Number)
  return new Date(Date.UTC(y, m - 1, 1)).toLocaleDateString('en-IN', { month: 'long', year: 'numeric', timeZone: 'UTC' })
}

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short' })
}

export function MatchHistoryClient({ canEditRoles, canEditTournament }: { canEditRoles: boolean; canEditTournament: boolean }) {
  const [month, setMonth]     = useState(currentMonthStr())
  const [matches, setMatches] = useState<MatchSummary[]>([])
  const [hasMore, setHasMore] = useState(false)
  const [loading, setLoading] = useState(true)
  const [error, setError]     = useState('')

  const [expandedId, setExpandedId] = useState<string | null>(null)

  const isCurrentMonth = month === currentMonthStr()

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError('')
    fetch(`/api/matches/history?month=${month}`)
      .then(res => res.json())
      .then(data => {
        if (cancelled) return
        if (data.error) { setError(data.error); return }
        setMatches(data.matches ?? [])
        setHasMore(!!data.hasMore)
      })
      .catch(() => { if (!cancelled) setError('Network error') })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [month])

  function toggleExpand(bookingId: string) {
    setExpandedId(prev => prev === bookingId ? null : bookingId)
  }

  return (
    <div className="space-y-4">
      {/* Month nav */}
      <div className="flex items-center justify-between bg-ink-3 border border-ink-5 rounded px-4 py-3">
        <button
          onClick={() => setMonth(m => shiftMonth(m, -1))}
          disabled={!hasMore && !loading}
          className="font-rajdhani text-xs font-bold tracking-wide text-zinc-400 hover:text-gold disabled:opacity-30 disabled:hover:text-zinc-400 transition-colors">
          ← Older
        </button>
        <span className="font-cinzel text-sm font-semibold text-parchment">{monthLabel(month)}</span>
        <button
          onClick={() => setMonth(m => shiftMonth(m, 1))}
          disabled={isCurrentMonth}
          className="font-rajdhani text-xs font-bold tracking-wide text-zinc-400 hover:text-gold disabled:opacity-30 disabled:hover:text-zinc-400 transition-colors">
          Newer →
        </button>
      </div>

      {error && (
        <p className="font-rajdhani text-sm text-red-400 bg-red-950/40 border border-red-800 rounded px-4 py-2.5">{error}</p>
      )}

      {loading && (
        <p className="font-rajdhani text-sm text-zinc-600 text-center py-6">Loading…</p>
      )}

      {!loading && !error && matches.length === 0 && (
        <p className="font-rajdhani text-sm text-zinc-600 text-center py-6">No completed matches in {monthLabel(month)}.</p>
      )}

      <div className="space-y-2">
        {matches.map(m => (
          <MatchRow
            key={m.booking_id}
            match={m}
            expanded={expandedId === m.booking_id}
            onToggle={() => toggleExpand(m.booking_id)}
            canEditRoles={canEditRoles}
            canEditTournament={canEditTournament}
          />
        ))}
      </div>
    </div>
  )
}

function MatchRow({
  match, expanded, onToggle, canEditRoles, canEditTournament,
}: {
  match: MatchSummary
  expanded: boolean
  onToggle: () => void
  canEditRoles: boolean
  canEditTournament: boolean
}) {
  const [detail, setDetail]           = useState<MatchDetail | null>(null)
  const [detailLoading, setDetailLoading] = useState(false)
  const [detailError, setDetailError] = useState('')

  useEffect(() => {
    if (!expanded || detail || detailLoading) return
    setDetailLoading(true)
    setDetailError('')
    fetch(`/api/matches/history/${match.booking_id}`)
      .then(res => res.json())
      .then(data => {
        if (data.error) { setDetailError(data.error); return }
        setDetail(data)
      })
      .catch(() => setDetailError('Network error'))
      .finally(() => setDetailLoading(false))
  }, [expanded, detail, detailLoading, match.booking_id])

  return (
    <div className="bg-ink-3 border border-ink-5 rounded overflow-hidden">
      <button
        onClick={onToggle}
        className="w-full flex items-center justify-between px-4 py-3 hover:bg-ink-4 transition-colors text-left">
        <div className="flex items-center gap-3 min-w-0">
          <span className="font-rajdhani text-xs font-semibold text-zinc-500 w-20 flex-shrink-0">{formatDate(match.game_date)}</span>
          <span className="font-cinzel text-sm text-parchment truncate">
            vs {match.opponent_name ?? 'TBD'}
          </span>
          {match.format && (
            <span className="font-rajdhani text-[10px] font-bold bg-ink-4 border border-ink-5 text-zinc-400 px-1.5 py-0.5 rounded flex-shrink-0">
              {match.format}
            </span>
          )}
        </div>
        <div className="flex items-center gap-3 flex-shrink-0">
          <span className="font-rajdhani text-xs text-zinc-600 hidden sm:inline">
            {match.tournament_name ?? 'Unassigned'}
          </span>
          <span className="text-zinc-600">{expanded ? '▲' : '▼'}</span>
        </div>
      </button>

      {expanded && (
        <div className="border-t border-ink-5 px-4 py-4">
          {detailLoading && <p className="font-rajdhani text-sm text-zinc-600">Loading squad…</p>}
          {detailError && <p className="font-rajdhani text-sm text-red-400">{detailError}</p>}
          {detail && (
            <MatchDetailPanel
              detail={detail}
              onDetailChange={setDetail}
              canEditRoles={canEditRoles}
              canEditTournament={canEditTournament}
            />
          )}
        </div>
      )}
    </div>
  )
}

function MatchDetailPanel({
  detail, onDetailChange, canEditRoles, canEditTournament,
}: {
  detail: MatchDetail
  onDetailChange: (d: MatchDetail) => void
  canEditRoles: boolean
  canEditTournament: boolean
}) {
  const [editedSquad, setEditedSquad] = useState<SquadPlayer[]>(detail.squad)
  const [rolesSaving, setRolesSaving] = useState(false)
  const [rolesError, setRolesError]   = useState('')

  useEffect(() => { setEditedSquad(detail.squad) }, [detail.squad])

  const captainCount = editedSquad.filter(p => p.is_captain).length
  const vcCount      = editedSquad.filter(p => p.is_vc).length
  const showWarning  = canEditRoles && (captainCount !== 1 || vcCount !== 1)

  function toggleRole(playerId: string, role: 'is_captain' | 'is_vc' | 'is_wk') {
    setEditedSquad(prev => prev.map(p => p.player_id === playerId ? { ...p, [role]: !p[role] } : p))
  }

  const rolesDirty = editedSquad.some(p => {
    const orig = detail.squad.find(o => o.player_id === p.player_id)
    return !orig || orig.is_captain !== p.is_captain || orig.is_vc !== p.is_vc || orig.is_wk !== p.is_wk
  })

  async function saveRoles() {
    setRolesSaving(true)
    setRolesError('')
    try {
      const res = await fetch(`/api/matches/history/${detail.booking.booking_id}/roles`, {
        method:  'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(editedSquad.map(p => ({
          player_id:  p.player_id,
          is_captain: p.is_captain,
          is_vc:      p.is_vc,
          is_wk:      p.is_wk,
        }))),
      })
      const data = await res.json()
      if (!res.ok) { setRolesError(data.error ?? 'Failed to save roles'); return }
      onDetailChange({ ...detail, squad: editedSquad })
    } catch {
      setRolesError('Network error')
    } finally {
      setRolesSaving(false)
    }
  }

  return (
    <div className="space-y-4">
      <div className="space-y-1.5">
        {editedSquad
          .slice()
          .sort((a, b) => a.player_name.localeCompare(b.player_name))
          .map(p => (
            <div key={p.player_id} className="flex items-center justify-between gap-3 py-1">
              <div className="flex items-center gap-2 min-w-0">
                <PlayerNameLink
                  name={p.player_name}
                  cricHeroesUrl={p.cricheroes_url}
                  className="font-rajdhani text-sm text-zinc-300 truncate"
                />
                {!canEditRoles && (
                  <>
                    {p.is_captain && <RoleBadge label="C" />}
                    {p.is_vc      && <RoleBadge label="VC" />}
                    {p.is_wk      && <RoleBadge label="WK" />}
                  </>
                )}
              </div>
              {canEditRoles && (
                <div className="flex items-center gap-1.5 flex-shrink-0">
                  <RoleToggle active={p.is_captain} label="C"  onClick={() => toggleRole(p.player_id, 'is_captain')} />
                  <RoleToggle active={p.is_vc}      label="VC" onClick={() => toggleRole(p.player_id, 'is_vc')} />
                  <RoleToggle active={p.is_wk}      label="WK" onClick={() => toggleRole(p.player_id, 'is_wk')} />
                </div>
              )}
            </div>
          ))}
        {editedSquad.length === 0 && (
          <p className="font-rajdhani text-sm text-zinc-600">No squad recorded for this match.</p>
        )}
      </div>

      {showWarning && (
        <p className="font-rajdhani text-xs text-amber-400 bg-amber-950/30 border border-amber-800/50 rounded px-3 py-2">
          ⚠ This squad has {captainCount} captain{captainCount === 1 ? '' : 's'} and {vcCount} vice-captain{vcCount === 1 ? '' : 's'} marked — expected exactly one of each.
        </p>
      )}

      {canEditRoles && (
        <div className="flex items-center gap-3">
          <button
            onClick={saveRoles}
            disabled={!rolesDirty || rolesSaving}
            className="font-rajdhani text-xs font-bold tracking-wide bg-gold/10 border border-gold-dim text-gold hover:bg-gold/20 disabled:opacity-40 px-3 py-1.5 rounded transition-colors">
            {rolesSaving ? 'Saving…' : 'Save Role Changes'}
          </button>
          {rolesError && <p className="font-rajdhani text-xs text-red-400">{rolesError}</p>}
        </div>
      )}

      {canEditTournament && (
        <TournamentReassign
          bookingId={detail.booking.booking_id}
          currentTournamentId={detail.booking.tournament_id}
          currentTournamentName={detail.booking.tournament_name}
          onSaved={(id, name) => onDetailChange({
            ...detail,
            booking: { ...detail.booking, tournament_id: id, tournament_name: name },
          })}
        />
      )}
    </div>
  )
}

function RoleBadge({ label }: { label: string }) {
  return (
    <span className="font-rajdhani text-[9px] font-bold bg-gold/10 border border-gold-dim text-gold px-1.5 py-0.5 rounded">
      {label}
    </span>
  )
}

function RoleToggle({ active, label, onClick }: { active: boolean; label: string; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className={`font-rajdhani text-[10px] font-bold px-2 py-1 rounded border transition-colors ${
        active
          ? 'bg-gold/20 border-gold-dim text-gold'
          : 'bg-ink-4 border-ink-5 text-zinc-600 hover:text-zinc-400'
      }`}>
      {label}
    </button>
  )
}

function TournamentReassign({
  bookingId, currentTournamentId, currentTournamentName, onSaved,
}: {
  bookingId: string
  currentTournamentId: string | null
  currentTournamentName: string | null
  onSaved: (id: string | null, name: string | null) => void
}) {
  const [tournaments, setTournaments] = useState<Tournament[]>([])
  const [selected, setSelected]       = useState(currentTournamentId ?? '')
  const [saving, setSaving]           = useState(false)
  const [error, setError]             = useState('')

  useEffect(() => {
    fetch('/api/tournaments')
      .then(res => res.json())
      .then(data => setTournaments((data.tournaments ?? []).filter((t: Tournament) => t.active)))
      .catch(() => {})
  }, [])

  const dirty = selected !== (currentTournamentId ?? '')

  async function save() {
    setSaving(true)
    setError('')
    try {
      const res = await fetch(`/api/matches/history/${bookingId}/tournament`, {
        method:  'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ tournament_id: selected || null }),
      })
      const data = await res.json()
      if (!res.ok) { setError(data.error ?? 'Failed to reassign tournament'); return }
      const name = tournaments.find(t => t.id === selected)?.name ?? null
      onSaved(selected || null, name)
    } catch {
      setError('Network error')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="border-t border-ink-5 pt-3 space-y-2">
      <label className="form-label">Tournament (admin correction)</label>
      <div className="flex items-center gap-2">
        <select value={selected} onChange={e => setSelected(e.target.value)} className="form-input text-xs flex-1">
          <option value="">— Unassigned —</option>
          {tournaments.map(t => (
            <option key={t.id} value={t.id}>{t.name}</option>
          ))}
        </select>
        <button
          onClick={save}
          disabled={!dirty || saving}
          className="font-rajdhani text-xs font-bold tracking-wide bg-crimson hover:bg-crimson-dark disabled:opacity-40 text-white px-3 py-2 rounded transition-colors flex-shrink-0">
          {saving ? 'Saving…' : 'Save'}
        </button>
      </div>
      {error && <p className="font-rajdhani text-xs text-red-400">{error}</p>}
      {!dirty && currentTournamentName && (
        <p className="font-rajdhani text-[10px] text-zinc-600">Currently: {currentTournamentName}</p>
      )}
    </div>
  )
}
