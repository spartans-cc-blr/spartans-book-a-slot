'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { PlayerNameLink } from '@/lib/playerLink'
import { ScorecardUploadButton, type ScorecardStatus } from '@/components/matches/ScorecardUploadButton'
import { ScorecardTables } from '@/components/matches/ScorecardTables'
import { ResultBadge } from '@/components/shared/ResultBadge'
import {
  CricHeroesIcon, CricHeroesInlineLink, VerifiedStatusLine, ReconciliationControls, NotifyIcon,
} from '@/components/matches/ScorecardVerifyPanel'
import { PerformerShareButton, type TopPerformerInfo } from '@/components/matches/PerformerShareButton'
import { BallIcon, type BallType } from '@/components/matches/BallIcon'

interface Ground {
  name:          string
  maps_url:      string | null
  hospital_url:  string | null
}

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
  ground:          Ground | null
  cricheroes_url:  string | null
  scorecard_status:      ScorecardStatus | null
  scorecard_uploaded_at: string | null
  can_upload:      boolean
  // Same audience as can_upload, plus this match's own resolved top
  // performer (batting or bowling) acting on this one booking — see
  // matchTopPerformers.ts / scorecardAuth.ts. Never widen can_upload
  // itself for this: a top performer gets verify/flag rights only, not
  // scorecard upload/sync rights.
  can_verify:      boolean
  top_performers:  TopPerformerInfo[]
  stats:           StatsSummary | null
  roles_complete:  boolean
  verified:                       boolean
  needs_reconciliation:           boolean
  reconciliation_note:            string | null
  reconciliation_flagged_at:      string | null
  reconciliation_flagged_by_name: string | null
}

type RoleFilter = 'all' | 'played' | 'led'

interface FilterOptions {
  tournaments: { id: string; name: string }[]
  grounds:     { id: string; name: string }[]
  venues:      string[]
  formats:     string[]
  months:      string[]
  results:     string[]
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
  batting:         any[]
  bowling:         any[]
  fielding:        any[]
  team_list:       any[]
  fall_of_wickets: any[]
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

// Month-only label for pills inside the year-grouped picker, where the year
// is already shown once as the group heading.
function monthOnlyLabel(month: string): string {
  const [y, m] = month.split('-').map(Number)
  return new Date(Date.UTC(y, m - 1, 1)).toLocaleDateString('en-IN', { month: 'short', timeZone: 'UTC' })
}

// filterOptions.months arrives sorted most-recent-first with each year's
// months contiguous, so a simple running-group walk (no Map needed) keeps
// that order intact.
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

// Matches the server's own month bucketing (plain UTC date-string slicing,
// no local-timezone conversion) so the default view lines up with the
// month chip the server would actually return matches for.
function currentMonthStr(): string {
  const d = new Date()
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`
}

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short' })
}

function slotLabel(slot: string): string {
  const map: Record<string, string> = { '07:30': '7:15 AM', '10:30': '10:15 AM', '12:30': '12:15 PM', '14:30': '2:15 PM' }
  return map[slot] || slot
}

// BallIcon (red/white/pink) now lives in BallIcon.tsx — shared with
// PerformerShareButton.tsx so the wicket-taker row uses the same cricket
// ball icon as this card's top-bowler line, not a generic emoji.

// CricHeroesIcon, CricHeroesInlineLink, VerifiedBadge, VerifiedStatusLine,
// NotifyIcon, and ReconciliationControls all now live in
// ScorecardVerifyPanel.tsx — shared with the standalone
// /matches/history/[bookingId] page so the two surfaces can't drift on what
// a "verify this scorecard" action looks like. See that file for the
// original doc comments on each.

// Result rendering itself now comes from the shared <ResultBadge> (same
// component TournamentPlannerClient and TournamentShareCard use) instead of
// a local duplicate — that duplicate is exactly the kind of drift
// ResultBadge's own doc comment was written to prevent: this card's pill
// used a bigger, squared-off shape (padding 4px 12px, borderRadius 6px) with
// no border, while the shared one is a proper small rounded-full pill
// (text-[10px], px-2 py-0.5) — same colours, different shape, so the two
// surfaces didn't actually match.

// Passive, read-only checkpoint for the one scorecard_uploads state that
// isn't already covered by the verification row below (ReconciliationControls
// only renders once status reaches synced/fees_applied). 'synced' and
// 'fees_applied' used to duplicate that same information here as a plain
// "Stats synced"/"Fees applied" caption — redundant once the verification
// row exists, so only the pre-verification-eligible 'parsed' state remains.
const SYNC_INDICATOR: Partial<Record<ScorecardStatus, { icon: string; label: string; color: string }>> = {
  parsed: { icon: '⏳', label: 'Awaiting sync', color: '#9CA3AF' },
}

function ScorecardSyncIndicator({ status }: { status: ScorecardStatus }) {
  const cfg = SYNC_INDICATOR[status]
  if (!cfg) return null
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '3px' }} title={cfg.label}>
      <span style={{ fontSize: '15px', lineHeight: 1, color: cfg.color }}>{cfg.icon}</span>
      <span style={{ fontSize: '9px', color: '#6B7280', whiteSpace: 'nowrap' }}>{cfg.label}</span>
    </div>
  )
}

function scoreLine(stats: StatsSummary): string {
  const own = `${stats.team_total ?? '—'}/${stats.team_wickets ?? '—'} (${stats.team_overs ?? '—'} ov)`
  const opp = `${stats.opponent_total ?? '—'}/${stats.opponent_wickets ?? '—'} (${stats.opponent_overs ?? '—'} ov)`
  return `${own} vs ${opp}`
}

export function MatchHistoryClient({
  canEditRoles, canEditTournament, viewerPlayerId, isWrangler,
}: {
  canEditRoles: boolean
  canEditTournament: boolean
  viewerPlayerId: string | null
  // Gates the "Share for verification" button only — deliberately narrower
  // than canEditRoles (which also includes GC). Admin sees it too, same
  // house convention as every other wrangler-gated affordance in this app.
  isWrangler: boolean
}) {
  // Defaults to "I Played" for registered players — a much smaller result
  // set than the full club history, so the page's first paint is faster.
  // Falls back to 'all' for a viewer with no playerId (organiser/unmatched
  // Gmail) since the API returns an empty list for 'played'/'led' without
  // one, and the role-filter chips themselves aren't even rendered for
  // that viewer (see the viewerPlayerId-gated block below) — 'all' is the
  // only filter such a viewer can actually reach anyway.
  const [roleFilter, setRoleFilter]     = useState<RoleFilter>(viewerPlayerId ? 'played' : 'all')
  const [resultFilter, setResultFilter] = useState('')
  // Defaults to the current month rather than all-time — the unfiltered
  // view was slow to load, and most visits are for "what happened
  // recently" anyway. Explicitly deselecting the month chip still shows
  // everything.
  const [monthFilter, setMonthFilter]   = useState(currentMonthStr())
  const [monthPickerOpen, setMonthPickerOpen] = useState(false)
  const [tournamentId, setTournamentId] = useState('')
  // Encodes the selected ground option: 'g:<ground_id>' for a resolved
  // grounds-table entry, 'v:<venue text>' for a raw fallback venue with no
  // grounds row (a genuine one-off away venue) — see buildParams().
  const [groundSelection, setGroundSelection] = useState('')
  const [format, setFormat]             = useState('')

  const [filterOptions, setFilterOptions] = useState<FilterOptions>({ tournaments: [], grounds: [], venues: [], months: [], results: [], formats: ['T20', 'T30'] })

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
    if (resultFilter) p.set('result', resultFilter)
    if (monthFilter)  p.set('month', monthFilter)
    if (tournamentId) p.set('tournament_id', tournamentId)
    if (groundSelection.startsWith('g:')) p.set('ground_id', groundSelection.slice(2))
    else if (groundSelection.startsWith('v:')) p.set('venue', groundSelection.slice(2))
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
  }, [roleFilter, resultFilter, monthFilter, tournamentId, groundSelection, format])

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

  // The current month is the default landing view, not a user-applied
  // filter — only flag it as "active" (and offer "Clear filters") once it
  // differs from that default.
  const hasActiveFilters = roleFilter !== 'all' || !!resultFilter
    || (!!monthFilter && monthFilter !== currentMonthStr())
    || !!tournamentId || !!groundSelection || !!format

  function clearFilters() {
    setRoleFilter('all'); setResultFilter(''); setMonthFilter(currentMonthStr()); setTournamentId(''); setGroundSelection(''); setFormat('')
  }

  // Month stepper — filterOptions.months is sorted most-recent-first, so
  // index 0 is newest. "Older" moves toward the end of the array, "newer"
  // moves toward index 0. Both arrows are disabled once monthFilter is ''
  // (All time) — stepping only makes sense from a specific month.
  const monthIndex  = filterOptions.months.indexOf(monthFilter)
  const hasMonth    = monthIndex !== -1
  const canGoNewer  = hasMonth && monthIndex > 0
  const canGoOlder  = hasMonth && monthIndex < filterOptions.months.length - 1
  function goNewerMonth() { if (canGoNewer) setMonthFilter(filterOptions.months[monthIndex - 1]) }
  function goOlderMonth() { if (canGoOlder) setMonthFilter(filterOptions.months[monthIndex + 1]) }
  function selectMonth(month: string) {
    setMonthFilter(prev => prev === month ? '' : month)
    setMonthPickerOpen(false)
  }
  const monthGroups = groupMonthsByYear(filterOptions.months)

  return (
    <div className="space-y-4">
      {/* Filter bar — stacks on mobile, single row from sm up */}
      <div className="bg-ink-3 border border-ink-5 rounded px-4 py-3 space-y-3">
        {/* Won/Lost — top of the filter bar, per request */}
        {filterOptions.results.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {filterOptions.results.map(r => (
              <button
                key={r}
                onClick={() => setResultFilter(prev => prev === r ? '' : r)}
                className={`font-rajdhani text-xs font-bold tracking-wide uppercase px-3 py-1.5 rounded-full border transition-colors ${
                  resultFilter === r
                    ? r === 'WON'
                      ? 'bg-emerald-900/40 border-emerald-700 text-emerald-400'
                      : r === 'LOST'
                        ? 'bg-crimson/20 border-red-800 text-red-400'
                        : 'bg-gold/20 border-gold-dim text-gold'
                    : 'bg-ink-4 border-ink-5 text-zinc-500 hover:text-zinc-300'
                }`}>
                {r === 'WON' ? 'Won' : r === 'LOST' ? 'Lost' : r}
              </button>
            ))}
          </div>
        )}

        {/* Month navigator — a stepper for adjacent months plus a
            tap-to-expand picker grouped by year, independent of every other
            filter below (an AND'd param, not a replacement for them).
            Replaces a horizontally-scrolling pill row that only ever grew
            longer as match history accumulated. */}
        {filterOptions.months.length > 0 && (
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
          <select value={groundSelection} onChange={e => setGroundSelection(e.target.value)} className="form-input text-xs">
            <option value="">All grounds</option>
            {filterOptions.grounds.map(g => (
              <option key={g.id} value={`g:${g.id}`}>{g.name}</option>
            ))}
            {filterOptions.venues.map(v => (
              <option key={v} value={`v:${v}`}>{v}</option>
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
          {hasActiveFilters ? (
            'No matches found for these filters.'
          ) : (
            <>
              No completed matches yet this month.{' '}
              <button onClick={() => setMonthFilter('')} className="text-gold underline">
                Show all matches
              </button>
            </>
          )}
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

      {/* Flagged matches pinned above the rest — scoped to whatever page is
          currently loaded (this list is cursor-paginated, so a flag on a
          match many pages back won't jump here until that page is loaded;
          the admin backfill page at /admin/scorecard-backfill has the full,
          unpaginated view across every flagged match). */}
      {(() => {
        const flagged = matches.filter(m => m.needs_reconciliation)
        const rest    = matches.filter(m => !m.needs_reconciliation)
        function patchMatch(bookingId: string, patch: Partial<MatchSummary>) {
          setMatches(prev => prev.map(x => x.booking_id === bookingId ? { ...x, ...patch } : x))
        }
        return (
          <>
            {flagged.length > 0 && (
              <div className="space-y-3">
                <h2 className="font-rajdhani text-xs font-bold tracking-widest uppercase text-amber-400">
                  ⚠ Needs Reconciliation
                </h2>
                {flagged.map(m => (
                  <MatchHistoryCard
                    key={m.booking_id}
                    match={m}
                    canEditRoles={canEditRoles}
                    canEditTournament={canEditTournament}
                    isWrangler={isWrangler}
                    onScorecardStatusChange={(bookingId, status) => patchMatch(bookingId, { scorecard_status: status })}
                    onMatchPatch={patchMatch}
                  />
                ))}
              </div>
            )}
            <div className="space-y-3">
              {flagged.length > 0 && rest.length > 0 && (
                <h2 className="font-rajdhani text-xs font-bold tracking-widest uppercase text-zinc-500">
                  All Matches
                </h2>
              )}
              {rest.map(m => (
                <MatchHistoryCard
                  key={m.booking_id}
                  match={m}
                  canEditRoles={canEditRoles}
                  canEditTournament={canEditTournament}
                  isWrangler={isWrangler}
                  onScorecardStatusChange={(bookingId, status) => patchMatch(bookingId, { scorecard_status: status })}
                  onMatchPatch={patchMatch}
                />
              ))}
            </div>
          </>
        )
      })()}

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
  match, canEditRoles, canEditTournament, isWrangler, onScorecardStatusChange, onMatchPatch,
}: {
  match: MatchSummary
  canEditRoles: boolean
  canEditTournament: boolean
  isWrangler: boolean
  onScorecardStatusChange: (bookingId: string, status: ScorecardStatus) => void
  onMatchPatch: (bookingId: string, patch: Partial<MatchSummary>) => void
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
  const showSyncIndicator = match.can_upload && !!match.scorecard_status && match.scorecard_status !== 'pending_parse'
  // Whether the verify area below will render its own CricHeroes icon —
  // either the universal "Stats verified with" line (any viewer, once
  // verified) or, for captain/VC/wrangler/admin/top-performer only, the
  // "Mark Scorecard as Verified" action line (not yet verified, not
  // flagged — the flagged branch has no icon). When true, the icon row's
  // separate CricHeroes link is hidden — that same icon is repurposed
  // below instead of rendering a second, non-interactive decorative copy.
  const showsVerifyAction = match.can_verify
    && ['synced', 'fees_applied'].includes(match.scorecard_status ?? '')
    && !match.needs_reconciliation
    && !match.verified
  const verifyRowHasCricHeroesLink = match.verified || showsVerifyAction
  // Wrangler-only share affordance — never shown once already verified
  // (nothing left to ask the performer to do) or flagged (no actionable
  // control on the receiving end either, see ReconciliationControls).
  const showsPerformerShare = isWrangler && showsVerifyAction && match.top_performers.some(p => p.player_id)

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
          {/* Links into "Yours Statistically" (/leaderboard) pre-filtered to
              this tournament — category defaults to mvp (Honor Board's
              Overall/Monthly sub-tabs ignore/reset tournament scoping, see
              LeaderboardFilters.tsx) and year
              is forced to 'all' so a tournament spanning outside the current
              calendar year isn't silently hidden by the page's own
              current-year default. Underlined in gold — same hyperlink
              convention as the tournament name → CricHeroes points table
              link on FixturesCard.tsx — so it reads as clickable at a glance
              rather than blending into the plain white heading text. */}
          {match.tournament_id ? (
            <Link href={`/leaderboard?tournament=${match.tournament_id}&category=mvp&year=all`}
              style={{ color: '#F5F5F5', textDecoration: 'underline', textDecorationColor: '#C9A84C', textUnderlineOffset: '3px' }}
              title="View stats for this tournament">
              {match.tournament_name ?? 'Unassigned'}
            </Link>
          ) : (
            match.tournament_name ?? 'Unassigned'
          )}
        </div>
        <div style={{ fontSize: '12px', color: '#9CA3AF' }}>
          vs <span style={{ color: '#D1D5DB', fontWeight: 500 }}>{match.opponent_name || 'TBD'}</span>
        </div>
        {/* Ground link mirrors FixturesCard: hyperlinked when the tournament
            has a maps_url, falling back to the booking's free-text venue
            when no ground record is attached. */}
        {match.ground?.name ? (
          <div style={{ fontSize: '11px', color: '#6B7280', marginTop: '4px' }}>
            {'@ '}
            {match.ground.maps_url ? (
              <a href={match.ground.maps_url} target="_blank" rel="noopener noreferrer"
                style={{ color: '#34A853', textDecoration: 'none' }}>
                {match.ground.name}
              </a>
            ) : (
              <span>{match.ground.name}</span>
            )}
          </div>
        ) : match.venue ? (
          <div style={{ fontSize: '11px', color: '#6B7280', marginTop: '4px' }}>📍 {match.venue}</div>
        ) : null}
      </div>

      {/* Reconciliation banner — deliberately placed above the result strip
          so it's the first thing anyone sees on a flagged match, not a
          detail buried after the score. */}
      {match.needs_reconciliation && (
        <div style={{ background: 'rgba(245, 158, 11, 0.1)', border: '1px solid rgba(180, 83, 9, 0.5)', borderRadius: '8px', padding: '8px 10px' }}>
          <p style={{ fontSize: '11px', fontWeight: 700, color: '#FBBF24', display: 'flex', alignItems: 'center', gap: '5px' }}>
            <NotifyIcon size={12} /> Stats Discrepancy Reported
          </p>
          <p style={{ fontSize: '11px', color: '#FCD34D', marginTop: '2px' }}>{match.reconciliation_note}</p>
          <p style={{ fontSize: '10px', color: '#9CA3AF', marginTop: '2px' }}>
            Reported by {match.reconciliation_flagged_by_name ?? 'someone'}
            {match.reconciliation_flagged_at ? ` on ${new Date(match.reconciliation_flagged_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}` : ''}
            {' '}· queued for re-fetch
          </p>
        </div>
      )}

      {/* Result strip — only once stats have been synced. This is the
          headline of a completed match, so it gets the bordered/prominent
          treatment — a passive "stats synced" note should never outshine it. */}
      {match.stats && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              {match.stats.match_result && <ResultBadge result={match.stats.match_result} />}
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
      )}

      {/* Only the actionable states render here — no upload yet, or a stuck
          pending_parse needing retry. Once a status is confirmed (parsed,
          synced, fees_applied) it's a passive checkpoint, not something to
          act on, so it moves into the subtle icon-row indicator below. */}
      {match.can_upload && (!match.scorecard_status || match.scorecard_status === 'pending_parse') && (
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

      {/* A match can be re-synced after it's already 'synced' — e.g. a
          player_name gets reconciled (see player-identity-resolution.md)
          after the first sync, so the cached batting/bowling rows here are
          still missing player_id and can't resolve a top performer. Never
          offered once fees are applied — matchStatsSync.ts refuses to
          regress that status anyway, so there's nothing for a re-sync to
          fix there beyond what's already cached. */}
      {match.scorecard_status === 'synced' && match.can_upload && (
        <div>
          <button onClick={handleSyncStats} disabled={syncLoading}
            className="font-rajdhani text-[10px] font-semibold text-zinc-500 hover:text-gold disabled:opacity-40 underline underline-offset-2 transition-colors">
            {syncLoading ? 'Re-syncing…' : 'Re-sync stats from Analytics DB'}
          </button>
          {syncError && <p className="font-rajdhani text-[10px] text-red-400 mt-1">{syncError}</p>}
        </div>
      )}

      {/* Icons row — sync status (subtle) and CricHeroes. The Ground icon
          was removed here — the ground name under the opponent above is
          already the clickable affordance for opening the map, so a second
          identical link further down the card was pure redundancy. The
          CricHeroes icon is hidden here whenever the verification row below
          is about to show it instead (verifyRowHasCricHeroesLink) — same
          reasoning as Ground: one real, clickable icon, reused, not two. */}
      {(showSyncIndicator || (match.cricheroes_url && !verifyRowHasCricHeroesLink)) && (
        <>
          <div style={{ height: '1px', background: '#2D3748' }} />
          <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
            {showSyncIndicator && match.scorecard_status && (
              <ScorecardSyncIndicator status={match.scorecard_status} />
            )}
            <div style={{ flex: 1 }} />
            {match.cricheroes_url && !verifyRowHasCricHeroesLink && (
              <a href={match.cricheroes_url} target="_blank" rel="noopener noreferrer" title="Open in CricHeroes"
                style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '3px', textDecoration: 'none' }}>
                <CricHeroesIcon size={22} />
                <span style={{ fontSize: '9px', color: '#6B7280' }}>CricHeroes</span>
              </a>
            )}
          </div>
        </>
      )}

      {/* Verified status — visible to every viewer, not just the
          captain/VC/wrangler/admin audience that can act on it. Once a
          scorecard is verified there's nothing left to do with it, so this
          is the same read-only line for everyone. */}
      {match.verified && <VerifiedStatusLine cricheroesUrl={match.cricheroes_url} />}

      {/* Mark-verified / notify-discrepancy controls — captain/VC for this
          booking, wrangler/admin for any booking, or this match's own
          resolved top performer for this booking alone (match.can_verify —
          see matchTopPerformers.ts). Renders either the flagged info line
          or the action line; never both, and never once verified (covered
          above instead). */}
      {match.can_verify && (match.needs_reconciliation || showsVerifyAction) && (
        <ReconciliationControls
          match={match}
          onPatch={patch => onMatchPatch(match.booking_id, patch)}
        />
      )}

      {/* Wrangler-only convenience — a direct link to the standalone match
          page for whoever topped batting/bowling, pre-filled with a
          congratulatory WhatsApp message asking them to verify. Does not
          grant anything itself — canActOnScorecard() already grants the
          performer verify/flag rights independently of whether anyone
          ever taps this button. */}
      {showsPerformerShare && (
        <PerformerShareButton
          bookingId={match.booking_id}
          performers={match.top_performers}
          gameDate={match.game_date}
          tournamentName={match.tournament_name}
          ballType={ballType}
        />
      )}

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
                  fielding={scorecard.fielding}
                  teamList={scorecard.team_list}
                  fallOfWickets={scorecard.fall_of_wickets}
                  teamTotal={match.stats?.team_total}
                  teamOvers={match.stats?.team_overs}
                  teamWickets={match.stats?.team_wickets}
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
                  playerId={p.player_id}
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
