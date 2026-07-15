'use client'

import { useEffect, useState } from 'react'
import { PlayerNameLink } from '@/lib/playerLink'
import { JerseyIcon } from '@/components/ui/JerseyIcon'
import { ScorecardUploadButton, type ScorecardStatus } from '@/components/matches/ScorecardUploadButton'
import { ScorecardTables } from '@/components/matches/ScorecardTables'

type BallType = 'red' | 'white' | 'pink'

interface StatsSummary {
  match_result:     string | null
  team_total:       number | null
  team_wickets:     number | null
  team_overs:       number | null
  opponent_total:   number | null
  opponent_wickets: number | null
  opponent_overs:   number | null
  top_bat:  { name: string; runs: number; balls: number } | null
  top_bowl: { name: string; wickets: number; runs: number; overs: number } | null
}

interface MatchSummary {
  booking_id:      string
  game_date:       string
  slot_time:       string
  match_time:      string | null
  opponent_name:   string | null
  format:          string | null
  tournament_id:   string | null
  tournament_name: string | null
  ball_type:       BallType | null
  venue:           string | null
  cricheroes_url:  string | null
  scorecard_status:      ScorecardStatus | null
  scorecard_uploaded_at: string | null
  can_upload:      boolean
  stats:           StatsSummary | null
  roles_complete:  boolean
}

type RoleFilter = 'all' | 'played' | 'led'

interface FilterOptions {
  tournaments: { id: string; name: string }[]
  venues:      string[]
  formats:     string[]
  months:      string[]
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
  booking: { booking_id: string; tournament_id: string | null; tournament_name: string | null }
  squad:   SquadPlayer[]
}

interface FullScorecard {
  batting:   any[]
  bowling:   any[]
  fielding:  any[]
  team_list: any[]
}

interface Tournament {
  id:     string
  name:   string
  active: boolean
}

function monthChipLabel(month: string): string {
  const [y, m] = month.split('-').map(Number)
  return new Date(Date.UTC(y, m - 1, 1)).toLocaleDateString('en-IN', { month: 'short', year: 'numeric', timeZone: 'UTC' })
}

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short' })
}

function slotLabel(slot: string): string {
  const map: Record<string, string> = { '07:30': '7:15 AM', '10:30': '10:15 AM', '12:30': '12:15 PM', '14:30': '2:15 PM' }
  return map[slot] || slot
}

// ── Ball icons (mirrors src/components/fixtures/FixturesCard.tsx) ──────────
function RedBall({ size = 20 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 60 60" fill="none" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <radialGradient id="mh-rb" cx="38%" cy="30%" r="62%">
          <stop offset="0%" stopColor="#E8553A"/><stop offset="35%" stopColor="#C0392B"/>
          <stop offset="75%" stopColor="#8B1A0F"/><stop offset="100%" stopColor="#5C0E08"/>
        </radialGradient>
        <clipPath id="mh-rc"><circle cx="30" cy="30" r="28"/></clipPath>
      </defs>
      <circle cx="30" cy="30" r="28" fill="url(#mh-rb)"/>
      <g transform="rotate(-30 30 30)" clipPath="url(#mh-rc)">
        <line x1="2" y1="30" x2="58" y2="30" stroke="#5C0E08" strokeWidth="3"/>
        <line x1="2" y1="24" x2="58" y2="24" stroke="#E8C49A" strokeWidth="1" strokeDasharray="3 2.5"/>
        <line x1="2" y1="36" x2="58" y2="36" stroke="#E8C49A" strokeWidth="1" strokeDasharray="3 2.5"/>
      </g>
      <ellipse cx="21" cy="17" rx="9" ry="5" fill="white" opacity="0.13" transform="rotate(-30 21 17)"/>
    </svg>
  )
}

function WhiteBall({ size = 20 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 60 60" fill="none" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <radialGradient id="mh-wb" cx="38%" cy="30%" r="62%">
          <stop offset="0%" stopColor="#FFFFFF"/><stop offset="45%" stopColor="#EDE9DF"/>
          <stop offset="80%" stopColor="#C8C2B0"/><stop offset="100%" stopColor="#A09880"/>
        </radialGradient>
        <clipPath id="mh-wc"><circle cx="30" cy="30" r="28"/></clipPath>
      </defs>
      <circle cx="30" cy="30" r="28" fill="url(#mh-wb)" stroke="#C0BAA8" strokeWidth="0.5"/>
      <g transform="rotate(-30 30 30)" clipPath="url(#mh-wc)">
        <line x1="2" y1="30" x2="58" y2="30" stroke="#9A9080" strokeWidth="3"/>
        <line x1="2" y1="24" x2="58" y2="24" stroke="#707060" strokeWidth="1" strokeDasharray="3 2.5"/>
        <line x1="2" y1="36" x2="58" y2="36" stroke="#707060" strokeWidth="1" strokeDasharray="3 2.5"/>
      </g>
      <ellipse cx="21" cy="17" rx="9" ry="5" fill="white" opacity="0.45" transform="rotate(-30 21 17)"/>
    </svg>
  )
}

function PinkBall({ size = 20 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 60 60" fill="none" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <radialGradient id="mh-pb" cx="38%" cy="30%" r="62%">
          <stop offset="0%" stopColor="#F780B8"/><stop offset="35%" stopColor="#EC4899"/>
          <stop offset="75%" stopColor="#9D1A5C"/><stop offset="100%" stopColor="#6B0D3A"/>
        </radialGradient>
        <clipPath id="mh-pc"><circle cx="30" cy="30" r="28"/></clipPath>
      </defs>
      <circle cx="30" cy="30" r="28" fill="url(#mh-pb)"/>
      <g transform="rotate(-30 30 30)" clipPath="url(#mh-pc)">
        <line x1="2" y1="30" x2="58" y2="30" stroke="#7A0A3C" strokeWidth="3"/>
        <line x1="2" y1="24" x2="58" y2="24" stroke="#C9956B" strokeWidth="1" strokeDasharray="3 2.5"/>
        <line x1="2" y1="36" x2="58" y2="36" stroke="#C9956B" strokeWidth="1" strokeDasharray="3 2.5"/>
      </g>
      <ellipse cx="21" cy="17" rx="9" ry="5" fill="white" opacity="0.16" transform="rotate(-30 21 17)"/>
    </svg>
  )
}

function BallIcon({ type, size = 20 }: { type: BallType; size?: number }) {
  if (type === 'white') return <WhiteBall size={size} />
  if (type === 'pink')  return <PinkBall size={size} />
  return <RedBall size={size} />
}

function CricHeroesIcon({ size = 20 }: { size?: number }) {
  return (
    <img src="/cricheroes-logo.jpg" alt="CricHeroes" width={size} height={size}
      style={{ borderRadius: '50%', objectFit: 'cover' }} />
  )
}

function jerseyColour(ballType: BallType): 'gold' | 'white' {
  return ballType === 'white' ? 'gold' : 'white'
}

function resultBadgeStyle(result: string | null): { bg: string; color: string; label: string } {
  const r = (result ?? '').toLowerCase()
  if (r.includes('win'))  return { bg: '#052E1E', color: '#059669', label: 'WON' }
  if (r.includes('los'))  return { bg: '#3B0A0A', color: '#DC2626', label: 'LOST' }
  if (r.includes('tie'))  return { bg: '#3B2F0A', color: '#D97706', label: 'TIED' }
  return { bg: '#1E293B', color: '#94A3B8', label: (result ?? 'NO RESULT').toUpperCase() }
}

function scoreLine(stats: StatsSummary): string {
  const own = `${stats.team_total ?? '—'}/${stats.team_wickets ?? '—'} (${stats.team_overs ?? '—'} ov)`
  const opp = `${stats.opponent_total ?? '—'}/${stats.opponent_wickets ?? '—'} (${stats.opponent_overs ?? '—'} ov)`
  return `${own} vs ${opp}`
}

export function MatchHistoryClient({
  canEditRoles, canEditTournament, viewerPlayerId,
}: {
  canEditRoles: boolean
  canEditTournament: boolean
  viewerPlayerId: string | null
}) {
  const [roleFilter, setRoleFilter]     = useState<RoleFilter>('all')
  const [monthFilter, setMonthFilter]   = useState('')
  const [tournamentId, setTournamentId] = useState('')
  const [venue, setVenue]               = useState('')
  const [format, setFormat]             = useState('')

  const [filterOptions, setFilterOptions] = useState<FilterOptions>({ tournaments: [], venues: [], months: [], formats: ['T20', 'T30'] })

  const [matches, setMatches]         = useState<MatchSummary[]>([])
  const [nextCursor, setNextCursor]   = useState<string | null>(null)
  const [totalCount, setTotalCount]   = useState(0)
  const [loading, setLoading]         = useState(true)
  const [loadingMore, setLoadingMore] = useState(false)
  const [error, setError]             = useState('')

  useEffect(() => {
    fetch('/api/matches/history/filters')
      .then(res => res.json())
      .then(data => { if (!data.error) setFilterOptions(data) })
      .catch(() => {})
  }, [])

  function buildParams(cursor?: string | null) {
    const p = new URLSearchParams()
    if (cursor) p.set('cursor', cursor)
    if (roleFilter === 'played') p.set('mine', '1')
    if (roleFilter === 'led')    p.set('led', '1')
    if (monthFilter)  p.set('month', monthFilter)
    if (tournamentId) p.set('tournament_id', tournamentId)
    if (venue)        p.set('venue', venue)
    if (format)       p.set('format', format)
    return p.toString()
  }

  // Re-run from scratch whenever a filter changes.
  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError('')
    fetch(`/api/matches/history?${buildParams()}`)
      .then(res => res.json())
      .then(data => {
        if (cancelled) return
        if (data.error) { setError(data.error); return }
        setMatches(data.matches ?? [])
        setNextCursor(data.nextCursor ?? null)
        setTotalCount(data.totalCount ?? 0)
      })
      .catch(() => { if (!cancelled) setError('Network error') })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [roleFilter, monthFilter, tournamentId, venue, format])

  async function loadMore() {
    if (!nextCursor) return
    setLoadingMore(true)
    try {
      const res = await fetch(`/api/matches/history?${buildParams(nextCursor)}`)
      const data = await res.json()
      if (data.error) { setError(data.error); return }
      setMatches(prev => [...prev, ...(data.matches ?? [])])
      setNextCursor(data.nextCursor ?? null)
    } catch {
      setError('Network error')
    } finally {
      setLoadingMore(false)
    }
  }

  const hasActiveFilters = roleFilter !== 'all' || !!monthFilter || !!tournamentId || !!venue || !!format

  function clearFilters() {
    setRoleFilter('all'); setMonthFilter(''); setTournamentId(''); setVenue(''); setFormat('')
  }

  return (
    <div className="space-y-4">
      {/* Filter bar — stacks on mobile, single row from sm up */}
      <div className="bg-ink-3 border border-ink-5 rounded px-4 py-3 space-y-3">
        {/* Month chip strip — horizontally scrollable, independent of every
            other filter below (an AND'd param, not a replacement for them) */}
        {filterOptions.months.length > 0 && (
          <div className="flex gap-2 overflow-x-auto pb-1 -mx-1 px-1" style={{ scrollbarWidth: 'thin' }}>
            {filterOptions.months.map(month => (
              <button
                key={month}
                onClick={() => setMonthFilter(prev => prev === month ? '' : month)}
                className={`font-rajdhani text-xs font-bold tracking-wide px-3 py-1.5 rounded-full border whitespace-nowrap flex-shrink-0 transition-colors ${
                  monthFilter === month
                    ? 'bg-gold/20 border-gold-dim text-gold'
                    : 'bg-ink-4 border-ink-5 text-zinc-500 hover:text-zinc-300'
                }`}>
                {monthChipLabel(month)}
              </button>
            ))}
          </div>
        )}

        {viewerPlayerId && (
          <div className="flex flex-wrap gap-2">
            {(['all', 'played', 'led'] as RoleFilter[]).map(rf => (
              <button
                key={rf}
                onClick={() => setRoleFilter(rf)}
                className={`font-rajdhani text-xs font-bold tracking-wide uppercase px-3 py-1.5 rounded-full border transition-colors ${
                  roleFilter === rf
                    ? 'bg-gold/20 border-gold-dim text-gold'
                    : 'bg-ink-4 border-ink-5 text-zinc-500 hover:text-zinc-300'
                }`}>
                {rf === 'all' ? 'All Matches' : rf === 'played' ? 'I Played' : 'I Led (C/VC)'}
              </button>
            ))}
          </div>
        )}

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
          <select value={tournamentId} onChange={e => setTournamentId(e.target.value)} className="form-input text-xs">
            <option value="">All tournaments</option>
            {filterOptions.tournaments.map(t => (
              <option key={t.id} value={t.id}>{t.name}</option>
            ))}
          </select>
          <select value={venue} onChange={e => setVenue(e.target.value)} className="form-input text-xs">
            <option value="">All grounds</option>
            {filterOptions.venues.map(v => (
              <option key={v} value={v}>{v}</option>
            ))}
          </select>
          <select value={format} onChange={e => setFormat(e.target.value)} className="form-input text-xs">
            <option value="">All formats</option>
            {filterOptions.formats.map(f => (
              <option key={f} value={f}>{f}</option>
            ))}
          </select>
        </div>

        {hasActiveFilters && (
          <button
            onClick={clearFilters}
            className="font-rajdhani text-xs font-semibold text-zinc-500 hover:text-gold transition-colors">
            ✕ Clear filters
          </button>
        )}
      </div>

      {error && (
        <p className="font-rajdhani text-sm text-red-400 bg-red-950/40 border border-red-800 rounded px-4 py-2.5">{error}</p>
      )}
      {loading && (
        <p className="font-rajdhani text-sm text-zinc-600 text-center py-6">Loading…</p>
      )}
      {!loading && !error && matches.length === 0 && (
        <p className="font-rajdhani text-sm text-zinc-600 text-center py-6">
          {hasActiveFilters ? 'No matches found for these filters.' : 'No completed matches yet.'}
        </p>
      )}

      {/* Always reflects every active filter together (role + month +
          tournament + venue + format) — unlike a per-chip count, this can't
          go stale relative to whatever's currently selected. */}
      {!loading && !error && matches.length > 0 && (
        <p className="font-rajdhani text-xs text-zinc-600">
          {totalCount} match{totalCount === 1 ? '' : 'es'}
          {matches.length < totalCount ? ` · showing ${matches.length}` : ''}
        </p>
      )}

      <div className="space-y-3">
        {matches.map(m => (
          <MatchHistoryCard
            key={m.booking_id}
            match={m}
            canEditRoles={canEditRoles}
            canEditTournament={canEditTournament}
            onScorecardStatusChange={(bookingId, status) =>
              setMatches(prev => prev.map(x => x.booking_id === bookingId ? { ...x, scorecard_status: status } : x))
            }
          />
        ))}
      </div>

      {!loading && nextCursor && (
        <div className="text-center pt-2">
          <button
            onClick={loadMore}
            disabled={loadingMore}
            className="font-rajdhani text-xs font-bold tracking-wide uppercase bg-ink-3 border border-ink-5 hover:border-gold-dim text-zinc-400 hover:text-gold disabled:opacity-40 px-5 py-2.5 rounded transition-colors">
            {loadingMore ? 'Loading…' : 'Load Older Matches'}
          </button>
        </div>
      )}
    </div>
  )
}

function MatchHistoryCard({
  match, canEditRoles, canEditTournament, onScorecardStatusChange,
}: {
  match: MatchSummary
  canEditRoles: boolean
  canEditTournament: boolean
  onScorecardStatusChange: (bookingId: string, status: ScorecardStatus) => void
}) {
  const [squadOpen, setSquadOpen]     = useState(false)
  const [detail, setDetail]           = useState<MatchDetail | null>(null)
  const [detailLoading, setDetailLoading] = useState(false)
  const [detailError, setDetailError] = useState('')

  const [scorecardOpen, setScorecardOpen]       = useState(false)
  const [scorecard, setScorecard]               = useState<FullScorecard | null>(null)
  const [scorecardLoading, setScorecardLoading] = useState(false)
  const [scorecardError, setScorecardError]     = useState('')

  const [syncLoading, setSyncLoading] = useState(false)
  const [syncError, setSyncError]     = useState('')

  const ballType = match.ball_type ?? 'red'

  // Squad detail is also needed to resolve CricHeroes links in the
  // scorecard tables, so either panel opening triggers the same fetch.
  useEffect(() => {
    if (!(squadOpen || scorecardOpen) || detail || detailLoading) return
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
  }, [squadOpen, scorecardOpen, detail, detailLoading, match.booking_id])

  useEffect(() => {
    if (!scorecardOpen || scorecard || scorecardLoading) return
    setScorecardLoading(true)
    setScorecardError('')
    fetch(`/api/matches/history/${match.booking_id}/scorecard`)
      .then(res => res.json().then(data => ({ ok: res.ok, data })))
      .then(({ ok, data }) => {
        if (!ok) { setScorecardError(data.error ?? 'Failed to load scorecard'); return }
        setScorecard(data)
      })
      .catch(() => setScorecardError('Network error'))
      .finally(() => setScorecardLoading(false))
  }, [scorecardOpen, scorecard, scorecardLoading, match.booking_id])

  async function handleSyncStats() {
    setSyncLoading(true)
    setSyncError('')
    try {
      const res = await fetch('/api/admin/sync-match-stats', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ booking_id: match.booking_id }),
      })
      const data = await res.json()
      if (!res.ok) { setSyncError(data.error ?? 'Sync failed'); return }
      onScorecardStatusChange(match.booking_id, 'synced')
    } catch {
      setSyncError('Network error')
    } finally {
      setSyncLoading(false)
    }
  }

  return (
    <div style={{
      background: 'linear-gradient(135deg, #1C2333 0%, #111827 100%)',
      border: '1px solid #2D3748',
      borderRadius: '12px',
      padding: '14px 16px',
      display: 'flex',
      flexDirection: 'column',
      gap: '10px',
      fontFamily: "'DM Sans', 'Segoe UI', sans-serif",
      boxShadow: '0 4px 20px rgba(0,0,0,0.4)',
      position: 'relative',
      overflow: 'hidden',
    }}>
      <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: '3px', background: 'linear-gradient(90deg, #C9A84C, #F5D78E, #C9A84C)' }} />

      {/* Date + slot + format */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span style={{ fontSize: '12px', fontWeight: 600, color: '#C9A84C', letterSpacing: '0.05em' }}>
          {formatDate(match.game_date)} · {match.match_time
            ? match.match_time.slice(0, 5).replace(/^0/, '') + ' ' + (parseInt(match.match_time) < 12 ? 'AM' : 'PM')
            : slotLabel(match.slot_time)}
        </span>
        {match.format && (
          <span style={{ background: '#1E3A5F', color: '#93C5FD', fontSize: '10px', fontWeight: 700, padding: '2px 8px', borderRadius: '999px', letterSpacing: '0.08em' }}>
            {match.format}
          </span>
        )}
      </div>

      {/* Tournament + opponent */}
      <div>
        <div style={{ fontSize: '15px', fontWeight: 700, color: '#F5F5F5', lineHeight: 1.3, marginBottom: '3px' }}>
          {match.tournament_name ?? 'Unassigned'}
        </div>
        <div style={{ fontSize: '12px', color: '#9CA3AF' }}>
          vs <span style={{ color: '#D1D5DB', fontWeight: 500 }}>{match.opponent_name || 'TBD'}</span>
        </div>
        {match.venue && (
          <div style={{ fontSize: '11px', color: '#6B7280', marginTop: '4px' }}>📍 {match.venue}</div>
        )}
      </div>

      {/* Result strip — only once stats have been synced */}
      {match.stats && (() => {
        const badge = resultBadgeStyle(match.stats.match_result)
        return (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span style={{ background: badge.bg, color: badge.color, fontSize: '10px', fontWeight: 800, padding: '2px 8px', borderRadius: '4px', letterSpacing: '0.06em' }}>
                {badge.label}
              </span>
              <span style={{ fontSize: '11px', color: '#9CA3AF' }}>{scoreLine(match.stats)}</span>
            </div>
            {(match.stats.top_bat || match.stats.top_bowl) && (
              <div style={{ fontSize: '10px', color: '#6B7280', display: 'flex', flexWrap: 'wrap', gap: '10px' }}>
                {match.stats.top_bat && (
                  <span>🏏 <span style={{ color: '#C9A84C' }}>{match.stats.top_bat.name}</span> — {match.stats.top_bat.runs} ({match.stats.top_bat.balls})</span>
                )}
                {match.stats.top_bowl && (
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                    <BallIcon type={ballType} size={12} />
                    <span style={{ color: '#C9A84C' }}>{match.stats.top_bowl.name}</span> — {match.stats.top_bowl.wickets}/{match.stats.top_bowl.runs} ({match.stats.top_bowl.overs} ov)
                  </span>
                )}
              </div>
            )}
          </div>
        )
      })()}

      {match.can_upload && (
        <ScorecardUploadButton
          bookingId={match.booking_id}
          uploadStatus={match.scorecard_status}
          canUpload={match.can_upload}
          onStatusChange={onScorecardStatusChange}
        />
      )}

      {/* Same audience as the upload button — wrangler/admin (any booking)
          or captain/VC for this specific booking (match.can_upload) — not
          gated to admin alone. Server-side re-checks the identical set. */}
      {match.scorecard_status === 'parsed' && match.can_upload && (
        <div>
          <button onClick={handleSyncStats} disabled={syncLoading}
            className="font-rajdhani text-xs font-bold tracking-wide bg-gold/10 border border-gold-dim text-gold hover:bg-gold/20 disabled:opacity-40 px-3 py-1.5 rounded transition-colors">
            {syncLoading ? 'Syncing…' : 'Sync Stats from Analytics DB'}
          </button>
          {syncError && <p className="font-rajdhani text-xs text-red-400 mt-1">{syncError}</p>}
        </div>
      )}

      <div style={{ height: '1px', background: '#2D3748' }} />

      {/* Icons row — ball, jersey, CricHeroes only (no ground/hospital) */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '3px' }}>
          <BallIcon type={ballType} size={22} />
          <span style={{ fontSize: '9px', color: '#6B7280', textTransform: 'capitalize' }}>{ballType} ball</span>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '3px' }}>
          <JerseyIcon colour={jerseyColour(ballType)} size={22} />
          <span style={{ fontSize: '9px', color: '#6B7280' }}>{ballType === 'white' ? 'Colour jersey' : 'White jersey'}</span>
        </div>
        <div style={{ flex: 1 }} />
        {match.cricheroes_url && (
          <a href={match.cricheroes_url} target="_blank" rel="noopener noreferrer" title="Open in CricHeroes"
            style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '3px', textDecoration: 'none' }}>
            <CricHeroesIcon size={22} />
            <span style={{ fontSize: '9px', color: '#6B7280' }}>CricHeroes</span>
          </a>
        )}
      </div>

      {/* Collapsible squad — once the scorecard is synced AND C/VC/WK are
          all set, this panel is redundant (the scorecard already lists
          who played, and roles never need touching again). Kept visible
          whenever roles are still incomplete so they can be fixed, or the
          scorecard hasn't synced yet so the squad list is the only record
          of selection. Direct Supabase edit remains the escape hatch for
          the rare post-sync correction. */}
      {(!match.stats || !match.roles_complete) && (
        <div>
          <div style={{ height: '1px', background: '#2D3748' }} />
          <button
            onClick={() => setSquadOpen(v => !v)}
            style={{ width: '100%', display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'none', border: 'none', cursor: 'pointer', padding: '6px 0' }}>
            <span style={{ fontSize: '11px', fontWeight: 700, letterSpacing: '0.06em', color: '#C9A84C' }}>
              SQUAD{detail ? ` · ${detail.squad.length} players` : ''}
            </span>
            <span style={{ fontSize: '14px', color: '#6B7280' }}>{squadOpen ? '▲' : '▼'}</span>
          </button>

          {squadOpen && (
            <div style={{ paddingTop: '4px', paddingBottom: '2px' }}>
              {detailLoading && <p className="font-rajdhani text-sm text-zinc-600">Loading squad…</p>}
              {detailError && <p className="font-rajdhani text-sm text-red-400">{detailError}</p>}
              {detail && (
                <SquadPanel
                  detail={detail}
                  onDetailChange={setDetail}
                  canEditRoles={canEditRoles}
                  canEditTournament={canEditTournament}
                />
              )}
            </div>
          )}
        </div>
      )}

      {/* Collapsible full scorecard — only once stats have been synced */}
      {match.stats && (
        <div>
          <div style={{ height: '1px', background: '#2D3748' }} />
          <button
            onClick={() => setScorecardOpen(v => !v)}
            style={{ width: '100%', display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'none', border: 'none', cursor: 'pointer', padding: '6px 0' }}>
            <span style={{ fontSize: '11px', fontWeight: 700, letterSpacing: '0.06em', color: '#C9A84C' }}>
              SCORECARD
            </span>
            <span style={{ fontSize: '14px', color: '#6B7280' }}>{scorecardOpen ? '▲' : '▼'}</span>
          </button>

          {scorecardOpen && (
            <div style={{ paddingTop: '4px', paddingBottom: '2px' }}>
              {scorecardLoading && <p className="font-rajdhani text-sm text-zinc-600">Loading scorecard…</p>}
              {scorecardError && <p className="font-rajdhani text-sm text-red-400">{scorecardError}</p>}
              {scorecard && (
                <ScorecardTables
                  batting={scorecard.batting}
                  bowling={scorecard.bowling}
                  teamList={scorecard.team_list}
                  squad={detail?.squad}
                />
              )}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

function SquadPanel({
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
    <div className="space-y-3">
      <div className="space-y-1">
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
