'use client'
// Full player stats page — career + filtered (year/ground/format/pitch)
// summary, plus a match-by-match batting/bowling/fielding breakdown.
// Reachable via PlayerNameLink (see src/lib/playerLink.tsx) wherever a Hub
// player's name appears, and via avatar on /profile (own) and the GC
// Players grid. Not linked from Captains' Corner by design, and squad
// panels only ever get a small avatar icon into this page — never the
// name-link swap that would lengthen those cards.
//
// Ground (not Tournament) is the filter here, and Format is a pair of
// T20/T30 checkboxes — same convention as /leaderboard's filter bar
// (src/components/leaderboard/LeaderboardFilters.tsx): both checked means
// no restriction, unchecking one scopes to the other, and unchecking both
// snaps back to both checked rather than showing zero results.
//
// "As Captain" sits next to the T20/T30 checkboxes, same styling, and
// restricts both the summary and match list to matches where this player
// was the match-specific captain (squad.is_captain — not players.is_captain,
// the permanent club-captain flag; see features/squad-selection.md).
//
// Batting/Bowling/Fielding are three always-visible, self-contained
// sections (not a tab switcher over one shared table, added September
// 2026 — see features/player-stats-batting-position.md §12): each carries
// its own chart (Runs by Batting Position under Batting, a dismissal-type
// donut under Bowling — Fielding has neither) and its own Innings History
// table. Pitch Type is the top-most filter and narrows everything on the
// page — the Summary card, both charts, and all three tables — via
// aggregateMatchHistoryRows() (src/lib/playerMatchAggregate.ts), a pure
// client-side re-implementation of the server's aggregate() math, since
// Pitch (and the two charts' click-to-filter) only ever apply client-side
// on top of the already-fetched, server-filtered `matches` array.

import { useState, useEffect, useCallback, useMemo, type ReactNode } from 'react'
import { useRouter } from 'next/navigation'
import { useTheme } from '@/components/ui/ThemeProvider'
import type { PlayerStatsTotals, PlayerMatchHistoryRow, PitchType } from '@/types'
import { aggregateMatchHistoryRows, DISMISSAL_TYPE_META, type DismissalKey } from '@/lib/playerMatchAggregate'

interface PlayerInfo {
  id: string
  name: string
  photo_url: string | null
  jersey_name: string | null
  jersey_number: string | number | null
  primary_skill: string | null
  secondary_skill: string | null
  cricheroes_url: string | null
}

const CURRENT_YEAR = new Date().getFullYear()
const YEARS = [CURRENT_YEAR, CURRENT_YEAR - 1, CURRENT_YEAR - 2]

type Format = 'T20' | 'T30'
type Innings = 'defending' | 'chasing'
type StatTab = 'batting' | 'bowling' | 'fielding'

// Pitch Type tabs above Innings History — same All/Matted/Astro/Turf set,
// same "no 'Not set' option" convention, as /leaderboard's Detailed →
// Bat/Bowl tabs (features/leaderboard.md §6.2) and Team Record's own Pitch
// Type filter (features/team-stats.md §6).
const PITCH_TABS: { key: PitchType | 'all'; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'Matted', label: 'Matted' },
  { key: 'Astro', label: 'Astro' },
  { key: 'Turf', label: 'Turf' },
]

export function PlayerStatsClient({
  player, grounds, initialCareer, initialMatches,
}: {
  player: PlayerInfo
  grounds: { id: string; name: string }[]
  initialCareer: PlayerStatsTotals
  initialMatches: PlayerMatchHistoryRow[]
}) {
  const [year, setYear] = useState<number | 'all'>('all')
  const [groundId, setGroundId] = useState<string>('all')
  const [formats, setFormats] = useState<Set<Format>>(new Set<Format>(['T20', 'T30']))
  const [asCaptain, setAsCaptain] = useState(false)
  // Practice games (the "Practice games" umbrella tournament) are excluded
  // from stats by default — only real tournament fixtures count. This is
  // the opt-in to see through that exclusion; off by default.
  const [includePractice, setIncludePractice] = useState(false)
  // Defending = batted first, set a target. Chasing = batted second, chasing
  // the opponent's target. Derived from the analytics DB's toss_won/
  // toss_decision (see getInningsMatchIds() in src/lib/playerStats.ts).
  // Same convention as `formats`: both checked means no restriction,
  // unchecking one scopes to the other, unchecking both snaps back to both.
  const [innings, setInnings] = useState<Set<Innings>>(new Set<Innings>(['defending', 'chasing']))
  const [matches, setMatches] = useState<PlayerMatchHistoryRow[]>(initialMatches)
  const [loading, setLoading] = useState(false)
  // Batting-position bar chart selection — narrows the Batting section's
  // own Summary column and its own Innings History table only (not
  // Bowling/Fielding — each discipline is its own self-contained panel as
  // of September 2026, see the file-level comment above). Reset whenever
  // the top-of-page filters change and pull in a new match set, since a
  // position that had matches under the old filter may not exist at all
  // under the new one.
  const [selectedPosition, setSelectedPosition] = useState<number | null>(null)
  // Dismissal-type donut selection — same rationale, scoped to the Bowling
  // section only.
  const [selectedDismissal, setSelectedDismissal] = useState<DismissalKey | null>(null)
  // Pitch Type — the top-most filter on the page (moved there September
  // 2026; was previously the last filter, applied only to Innings History).
  // Client-side only, same reset-on-refetch rationale as selectedPosition,
  // and only ever shown/applied while no Ground is selected (a specific
  // ground/tournament combination isn't modelled here the way
  // /leaderboard's is, but Ground alone already pins matches to one
  // physical venue, so a second, independent pitch filter on top would be
  // redundant the same way it would be there — see
  // features/player-stats-batting-position.md). Unlike before, Pitch now
  // narrows *everything* on the page — the Summary card and both charts,
  // not just the tables — see aggregateMatchHistoryRows() below.
  const [selectedPitch, setSelectedPitch] = useState<PitchType | 'all'>('all')
  const showPitchTabs = groundId === 'all'

  const fetchScoped = useCallback(async () => {
    setSelectedPosition(null)
    setSelectedDismissal(null)
    setSelectedPitch('all')
    if (year === 'all' && groundId === 'all' && formats.size === 2 && !asCaptain && innings.size === 2 && !includePractice) {
      setMatches(initialMatches)
      return
    }
    setLoading(true)
    const params = new URLSearchParams()
    if (year !== 'all') params.set('year', String(year))
    if (groundId !== 'all') params.set('ground', groundId)
    if (formats.size === 1) params.set('format', Array.from(formats)[0])
    if (asCaptain) params.set('captain', '1')
    if (innings.size === 1) params.set('innings', Array.from(innings)[0])
    if (includePractice) params.set('practice', '1')
    const res = await fetch(`/api/players/${player.id}/match-history?${params.toString()}`)
    if (res.ok) {
      const d = await res.json()
      setMatches(d.matches)
    }
    setLoading(false)
  }, [year, groundId, formats, asCaptain, innings, includePractice, player.id, initialMatches])

  useEffect(() => { fetchScoped() }, [fetchScoped])

  function toggleFormat(fmt: Format) {
    setFormats(prev => {
      const next = new Set(prev)
      if (next.has(fmt)) {
        next.delete(fmt)
        // Never persist an all-unchecked state — snap back to both rather
        // than showing zero results.
        if (next.size === 0) { next.add('T20'); next.add('T30') }
      } else {
        next.add(fmt)
      }
      return next
    })
  }

  function toggleInnings(v: Innings) {
    setInnings(prev => {
      const next = new Set(prev)
      if (next.has(v)) {
        next.delete(v)
        if (next.size === 0) { next.add('defending'); next.add('chasing') }
      } else {
        next.add(v)
      }
      return next
    })
  }

  const isFiltered = year !== 'all' || groundId !== 'all' || formats.size === 1 || asCaptain || innings.size === 1
    || includePractice || selectedPitch !== 'all' || selectedPosition != null || selectedDismissal != null

  // Pitch is the top-most filter and narrows everything below it — the
  // Summary card, both charts, and all three Innings History tables — so
  // every other derivation in this component reads from matchesForPitch,
  // never from `matches` directly.
  const matchesForPitch = useMemo(
    () => (!showPitchTabs || selectedPitch === 'all') ? matches : matches.filter(m => m.pitchType === selectedPitch),
    [matches, selectedPitch, showPitchTabs],
  )

  // Total runs scored at each batting position, across the current
  // pitch-filtered match set — stays scoped to matchesForPitch directly,
  // never further narrowed by its own selection, so tapping a bar doesn't
  // change the shape of the bars underneath it. `innings` (added alongside
  // /leaderboard's own "N Inn" bar label, see BattingPositionLeaders.tsx)
  // is just a count of matches at that position — this chart is already
  // scoped to one player, so it's this player's own innings count at the
  // position, not a club-wide total the way the leaderboard's version is.
  const positionData = useMemo(() => {
    const totals = new Map<number, { runs: number; innings: number }>()
    for (const m of matchesForPitch) {
      if (!m.batting || m.batting.battingOrder == null) continue
      const prev = totals.get(m.batting.battingOrder) ?? { runs: 0, innings: 0 }
      totals.set(m.batting.battingOrder, { runs: prev.runs + m.batting.runs, innings: prev.innings + 1 })
    }
    return Array.from(totals.entries())
      .map(([position, v]) => ({ position, runs: v.runs, innings: v.innings }))
      .sort((a, b) => a.position - b.position)
  }, [matchesForPitch])
  const totalBattingInnings = useMemo(() => positionData.reduce((sum, d) => sum + d.innings, 0), [positionData])

  // Total wickets taken by each dismissal type, across the current
  // pitch-filtered match set — same "chart stays whole, only the summary/
  // table below it narrows" rule as positionData above. Zero-count types
  // are dropped rather than shown as an empty slice.
  const dismissalData = useMemo(() => {
    const totals: Record<DismissalKey, number> = { bowled: 0, caught: 0, caughtBehind: 0, lbw: 0, stumping: 0, other: 0 }
    for (const m of matchesForPitch) {
      if (!m.bowling) continue
      totals.bowled += m.bowling.bowled
      totals.caught += m.bowling.caught
      totals.caughtBehind += m.bowling.caughtBehind
      totals.lbw += m.bowling.lbw
      totals.stumping += m.bowling.stumping
      totals.other += m.bowling.other
    }
    return DISMISSAL_TYPE_META
      .map(meta => ({ ...meta, value: totals[meta.key] }))
      .filter(d => d.value > 0)
  }, [matchesForPitch])

  // Client-computed Summary numbers — replaces reading the server's
  // `scoped` aggregate directly, since Pitch/Position/Dismissal-type only
  // ever apply client-side. Overview reflects Pitch only (never a chart
  // click — clicking Position 4 shouldn't change the Matches/MVP/Dismissals
  // tiles, which aren't batting- or bowling-specific); Batting reflects
  // Pitch + the selected position; Bowling reflects Pitch + the selected
  // dismissal type.
  const overviewTotals = useMemo(() => aggregateMatchHistoryRows(matchesForPitch), [matchesForPitch])
  const battingTotals = useMemo(
    () => aggregateMatchHistoryRows(selectedPosition == null
      ? matchesForPitch
      : matchesForPitch.filter(m => m.batting?.battingOrder === selectedPosition)),
    [matchesForPitch, selectedPosition],
  )
  const bowlingTotals = useMemo(
    () => aggregateMatchHistoryRows(selectedDismissal == null
      ? matchesForPitch
      : matchesForPitch.filter(m => (m.bowling?.[selectedDismissal] ?? 0) > 0)),
    [matchesForPitch, selectedDismissal],
  )

  const battingTabMatches = useMemo(
    () => matchesForPitch.filter(m => !!m.batting && (selectedPosition == null || m.batting!.battingOrder === selectedPosition)),
    [matchesForPitch, selectedPosition],
  )
  const bowlingTabMatches = useMemo(
    () => matchesForPitch.filter(m => !!m.bowling && (selectedDismissal == null || (m.bowling![selectedDismissal] ?? 0) > 0)),
    [matchesForPitch, selectedDismissal],
  )
  const fieldingTabMatches = useMemo(
    () => matchesForPitch.filter(m => !!m.fielding && (m.fielding.catches > 0 || m.fielding.stumpings > 0 || m.fielding.runOuts > 0)),
    [matchesForPitch],
  )
  // Denominator for the Batting section's "X of Y" caption — every batting
  // innings in the current pitch scope, before the position filter narrows
  // it further.
  const battingInningsInPitchScope = useMemo(() => matchesForPitch.filter(m => !!m.batting).length, [matchesForPitch])
  const bowlingInningsInPitchScope = useMemo(() => matchesForPitch.filter(m => !!m.bowling).length, [matchesForPitch])

  function togglePosition(position: number) {
    setSelectedPosition(prev => prev === position ? null : position)
  }
  function toggleDismissal(key: DismissalKey) {
    setSelectedDismissal(prev => prev === key ? null : key)
  }

  return (
    <>
      <div className="bg-[var(--stats-card-bg)] border-b border-[var(--stats-card-border)] px-5 md:px-8 lg:px-10 py-7 relative overflow-hidden">
        <div className="absolute -top-8 -right-8 w-48 h-48 rounded-full pointer-events-none"
          style={{ background: 'radial-gradient(circle, rgba(217,119,6,0.08) 0%, transparent 70%)' }} />
        <div className="flex items-center gap-4">
          <img
            src={player.photo_url ?? '/default-avatar.png'}
            alt={player.name}
            className="w-16 h-16 rounded-full object-cover border-2 border-[var(--stats-accent-dim)] flex-shrink-0"
          />
          <div>
            <p className="text-[var(--stats-accent)] text-xs font-rajdhani font-semibold tracking-[3px] uppercase mb-1 flex items-center gap-2">
              <span className="w-4 h-px bg-[var(--stats-accent)] inline-block" />
              Player Stats
            </p>
            <h1 className="font-cinzel text-xl md:text-2xl font-bold text-[var(--stats-text)] tracking-wide">{player.name}</h1>
            <div className="flex items-center gap-2 mt-1 flex-wrap">
              {(player.jersey_name || player.jersey_number != null) && (
                <span className="font-rajdhani text-xs text-[var(--stats-text-muted)]">
                  {player.jersey_number != null && `#${player.jersey_number}`}
                  {player.jersey_number != null && player.jersey_name && ' · '}
                  {player.jersey_name}
                </span>
              )}
              {player.cricheroes_url && (
                <a href={player.cricheroes_url} target="_blank" rel="noopener noreferrer"
                  className="font-rajdhani text-xs text-[var(--stats-text-muted)] hover:text-[var(--stats-badge-text)] underline decoration-dotted underline-offset-2 transition-colors">
                  View on CricHeroes ↗
                </a>
              )}
            </div>
          </div>
        </div>
      </div>

      <div className="px-5 md:px-8 lg:px-10 py-6 max-w-3xl mx-auto">
        {/* Filters */}
        <div className="flex flex-col gap-2 mb-5">
          {/* Pitch Type — the top-most filter (moved here September 2026;
              was previously shown just above Innings History and only ever
              narrowed that one table). Hidden once a Ground is already
              selected — a specific ground already pins the surface, same
              reasoning /leaderboard's own tabs use for Tournament/Ground
              (features/leaderboard.md §6.2). Now narrows the Summary card
              and both charts too, not just the tables — see
              matchesForPitch above. */}
          {showPitchTabs && (
            <div className="flex items-center gap-2 flex-wrap flex-shrink-0">
              <span className="font-rajdhani text-xs font-bold tracking-widest uppercase text-[var(--stats-text-muted)] mr-1">Pitch</span>
              {PITCH_TABS.map(t => (
                <button key={t.key} onClick={() => setSelectedPitch(t.key)}
                  className={`font-rajdhani text-xs font-bold tracking-widest uppercase px-3 py-1.5 rounded border transition-colors
                    ${selectedPitch === t.key
                      ? 'bg-[var(--stats-badge-bg)] border-[var(--stats-badge-border)] text-[var(--stats-badge-text)]'
                      : 'border-[var(--stats-card-border)] text-[var(--stats-text-muted)] hover:text-[var(--stats-text-2)]'}`}>
                  {t.label}
                </button>
              ))}
            </div>
          )}
          <div className="flex gap-2 items-center flex-shrink-0">
            <select value={year} onChange={e => setYear(e.target.value === 'all' ? 'all' : Number(e.target.value))}
              className="font-rajdhani text-sm bg-[var(--stats-card-bg)] border border-[var(--stats-card-border)] text-[var(--stats-text)] rounded px-3 py-1.5 flex-shrink-0">
              <option value="all">All Years</option>
              {YEARS.map(y => <option key={y} value={y}>{y}</option>)}
            </select>
            <label className={`flex items-center gap-1.5 font-rajdhani text-sm font-bold cursor-pointer select-none flex-shrink-0
              ${formats.has('T20') ? 'text-[var(--stats-badge-text)]' : 'text-[var(--stats-text-muted)]'}`}>
              <input type="checkbox" checked={formats.has('T20')} onChange={() => toggleFormat('T20')} className="accent-gold" />
              T20
            </label>
            <label className={`flex items-center gap-1.5 font-rajdhani text-sm font-bold cursor-pointer select-none flex-shrink-0
              ${formats.has('T30') ? 'text-[var(--stats-badge-text)]' : 'text-[var(--stats-text-muted)]'}`}>
              <input type="checkbox" checked={formats.has('T30')} onChange={() => toggleFormat('T30')} className="accent-gold" />
              T30
            </label>
            <label className={`flex items-center gap-1.5 font-rajdhani text-sm font-bold cursor-pointer select-none flex-shrink-0
              ${asCaptain ? 'text-[var(--stats-badge-text)]' : 'text-[var(--stats-text-muted)]'}`}>
              <input type="checkbox" checked={asCaptain} onChange={() => setAsCaptain(v => !v)} className="accent-gold" />
              As Captain
            </label>
          </div>
          <div className="flex gap-2 items-center flex-shrink-0">
            <label className={`flex items-center gap-1.5 font-rajdhani text-sm font-bold cursor-pointer select-none flex-shrink-0
              ${innings.has('defending') ? 'text-[var(--stats-badge-text)]' : 'text-[var(--stats-text-muted)]'}`}>
              <input type="checkbox" checked={innings.has('defending')} onChange={() => toggleInnings('defending')} className="accent-gold" />
              Defending
            </label>
            <label className={`flex items-center gap-1.5 font-rajdhani text-sm font-bold cursor-pointer select-none flex-shrink-0
              ${innings.has('chasing') ? 'text-[var(--stats-badge-text)]' : 'text-[var(--stats-text-muted)]'}`}>
              <input type="checkbox" checked={innings.has('chasing')} onChange={() => toggleInnings('chasing')} className="accent-gold" />
              Chasing
            </label>
            <label className={`flex items-center gap-1.5 font-rajdhani text-sm font-bold cursor-pointer select-none flex-shrink-0
              ${includePractice ? 'text-[var(--stats-badge-text)]' : 'text-[var(--stats-text-muted)]'}`}>
              <input type="checkbox" checked={includePractice} onChange={() => setIncludePractice(v => !v)} className="accent-gold" />
              Include Practice Games
            </label>
          </div>
          <select value={groundId} onChange={e => setGroundId(e.target.value)}
            className="font-rajdhani text-sm bg-[var(--stats-card-bg)] border border-[var(--stats-card-border)] text-[var(--stats-text)] rounded px-3 py-1.5 w-full">
            <option value="all">All Grounds</option>
            {grounds.map(g => <option key={g.id} value={g.id}>{g.name}</option>)}
          </select>
        </div>

        {/* Summary — every number here is computed client-side from
            matchesForPitch via aggregateMatchHistoryRows(), not read off the
            server's `scoped` aggregate, so Pitch (and, per-column, the two
            charts' click-to-filter) can narrow it with no round trip. */}
        <div className="bg-[var(--stats-card-bg)] border border-[var(--stats-card-border)] rounded-2xl p-5 mb-5">
          <h2 className="font-cinzel text-sm text-[var(--stats-badge-text)] font-semibold mb-4">
            {isFiltered ? 'Filtered' : 'Career'} Summary
          </h2>
          {overviewTotals.matches === 0 ? (
            <p className="font-rajdhani text-sm text-[var(--stats-text-muted)]">No matches for this filter.</p>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-3 divide-y sm:divide-y-0 sm:divide-x divide-[var(--stats-card-border)]">
              <SummaryColumn title="Overview" mvpLabel="Fielding MVP" mvpValue={overviewTotals.fieldingMvp} mvpColor="text-purple-600 dark:text-purple-400">
                <Stat label="Matches" value={String(overviewTotals.matches)}
                  caption={overviewTotals.battingInnings !== overviewTotals.matches || overviewTotals.bowlingInnings !== overviewTotals.matches
                    ? `Bat ${overviewTotals.battingInnings} · Bowl ${overviewTotals.bowlingInnings}` : undefined} />
                <Stat label="MVP Pts" value={overviewTotals.mvpPoints.toFixed(2)} />
                <Stat label="Dismissals" value={String(overviewTotals.catches + overviewTotals.runOuts + overviewTotals.stumpings)} />
              </SummaryColumn>
              <SummaryColumn title="Batting" mvpLabel="Batting MVP" mvpValue={battingTotals.battingMvp} mvpColor="text-emerald-600 dark:text-emerald-400">
                <Stat label="Runs" value={String(battingTotals.runs)} />
                <Stat label="Highest" value={formatHighestScore(battingTotals.highestScore)} />
                <Stat label="Avg" value={battingTotals.battingAverage?.toFixed(2) ?? '—'} />
                <Stat label="S/R" value={battingTotals.strikeRate?.toFixed(2) ?? '—'} />
              </SummaryColumn>
              <SummaryColumn title="Bowling" mvpLabel="Bowling MVP" mvpValue={bowlingTotals.bowlingMvp} mvpColor="text-blue-600 dark:text-blue-400">
                <Stat label="Wickets" value={String(bowlingTotals.wickets)} />
                <Stat label="Best Bowling" value={formatBestBowling(bowlingTotals.bestBowling)} />
                <Stat label="Economy" value={bowlingTotals.economy?.toFixed(2) ?? '—'} />
                <Stat label="S/R" value={bowlingTotals.bowlingStrikeRate?.toFixed(2) ?? '—'} />
              </SummaryColumn>
            </div>
          )}
        </div>

        {loading && <p className="font-rajdhani text-sm text-[var(--stats-text-muted)] mb-5">Loading…</p>}

        {/* Batting — its own section (September 2026, replacing the old
            shared Batting/Bowling/Fielding tab switcher): the Runs by
            Batting Position chart, then this discipline's own Innings
            History. */}
        <div className="bg-[var(--stats-card-bg)] border border-[var(--stats-card-border)] rounded-2xl p-5 mb-5">
          <div className="flex items-center justify-between flex-wrap gap-2 mb-1">
            <h2 className="font-cinzel text-sm text-[var(--stats-badge-text)] font-semibold">Batting</h2>
            {selectedPosition != null && (
              <button onClick={() => setSelectedPosition(null)}
                className="font-rajdhani text-xs font-bold px-2.5 py-1 rounded-full bg-[var(--stats-badge-bg)] border border-[var(--stats-badge-border)] text-[var(--stats-badge-text)] hover:bg-gold/20 transition-colors">
                Position {selectedPosition} ✕
              </button>
            )}
          </div>
          {positionData.length > 0 && (
            <>
              <div className="flex items-baseline justify-between gap-2 mb-4">
                <p className="font-rajdhani text-xs text-[var(--stats-text-muted)]">Runs by batting position — tap a bar to filter below.</p>
                <span className="font-rajdhani text-xs font-semibold text-[var(--stats-text-muted)] whitespace-nowrap flex-shrink-0">
                  {totalBattingInnings} total inning{totalBattingInnings === 1 ? '' : 's'}
                </span>
              </div>
              <BattingPositionChart data={positionData} selected={selectedPosition} onSelect={togglePosition} />
              <div className="border-t border-[var(--stats-card-border)] my-4" />
            </>
          )}
          {selectedPosition != null && (
            <p className="font-rajdhani text-xs text-[var(--stats-text-muted)] mb-3">
              {battingTabMatches.length} of {battingInningsInPitchScope} innings batted at Position {selectedPosition}
            </p>
          )}
          {!loading && (battingTabMatches.length === 0 ? (
            <p className="font-rajdhani text-sm text-[var(--stats-text-muted)]">No batting innings for this filter.</p>
          ) : (
            <MatchHistoryTable matches={battingTabMatches} statTab="batting" />
          ))}
        </div>

        {/* Bowling — Dismissal-Type donut, then this discipline's own
            Innings History. */}
        <div className="bg-[var(--stats-card-bg)] border border-[var(--stats-card-border)] rounded-2xl p-5 mb-5">
          <div className="flex items-center justify-between flex-wrap gap-2 mb-1">
            <h2 className="font-cinzel text-sm text-[var(--stats-badge-text)] font-semibold">Bowling</h2>
            {selectedDismissal != null && (
              <button onClick={() => setSelectedDismissal(null)}
                className="font-rajdhani text-xs font-bold px-2.5 py-1 rounded-full bg-[var(--stats-badge-bg)] border border-[var(--stats-badge-border)] text-[var(--stats-badge-text)] hover:bg-gold/20 transition-colors">
                {DISMISSAL_TYPE_META.find(d => d.key === selectedDismissal)?.label} ✕
              </button>
            )}
          </div>
          {dismissalData.length > 0 && (
            <>
              <p className="font-rajdhani text-xs text-[var(--stats-text-muted)] mb-4">How the wickets fell — tap a dismissal type to filter below.</p>
              <DismissalPieChart data={dismissalData} selected={selectedDismissal} onSelect={toggleDismissal} />
              <div className="border-t border-[var(--stats-card-border)] my-4" />
            </>
          )}
          <p className="font-rajdhani text-xs text-[var(--stats-text-muted)] mb-3">
            {selectedDismissal != null
              ? `${bowlingTabMatches.length} of ${bowlingInningsInPitchScope} innings with a ${DISMISSAL_TYPE_META.find(d => d.key === selectedDismissal)?.label} dismissal`
              : `${bowlingTabMatches.length} innings bowled`}
          </p>
          {!loading && (bowlingTabMatches.length === 0 ? (
            <p className="font-rajdhani text-sm text-[var(--stats-text-muted)]">No bowling innings for this filter.</p>
          ) : (
            <MatchHistoryTable matches={bowlingTabMatches} statTab="bowling" />
          ))}
        </div>

        {/* Fielding — table only, no chart. */}
        <div className="bg-[var(--stats-card-bg)] border border-[var(--stats-card-border)] rounded-2xl p-5">
          <h2 className="font-cinzel text-sm text-[var(--stats-badge-text)] font-semibold mb-4">Fielding</h2>
          {!loading && (fieldingTabMatches.length === 0 ? (
            <p className="font-rajdhani text-sm text-[var(--stats-text-muted)]">No fielding innings for this filter.</p>
          ) : (
            <MatchHistoryTable matches={fieldingTabMatches} statTab="fielding" />
          ))}
        </div>
      </div>
    </>
  )
}

// Same display convention as the /players directory's career-highlights
// cards (src/lib/playerHighlights.ts's pickHighlights()) — a not-out
// innings gets a trailing '*', best bowling is "wickets/runs".
function formatHighestScore(h: PlayerStatsTotals['highestScore']): string {
  if (!h) return '—'
  return `${h.runs}${h.notOut ? '*' : ''}${h.balls > 0 ? ` (${h.balls})` : ''}`
}
function formatBestBowling(b: PlayerStatsTotals['bestBowling']): string {
  if (!b) return '—'
  return `${b.wickets}/${b.runs}`
}

// One of the three Career/Filtered Summary sections — Overview, Batting,
// Bowling — inside the single Summary card, so every batting figure reads
// as one group and every bowling figure reads as another, rather than
// interleaved in one flat grid. Unlike the first cut of this grouping,
// this is a *section* of the shared card, not its own bordered/shadowed
// box — the three sit side by side on one row (a thin vertical divider
// between them) on wider screens, and stack into one column with a
// horizontal divider between them on mobile, via the parent grid's
// `divide-x`/`divide-y`. Each section's own category MVP
// (battingMvp/bowlingMvp/fieldingMvp) is pinned below its main stats,
// same MvpStat component and colours (emerald/blue/purple) as before.
function SummaryColumn({
  title, children, mvpLabel, mvpValue, mvpColor,
}: {
  title: string
  children: ReactNode
  mvpLabel: string
  mvpValue: number
  mvpColor: string
}) {
  return (
    <div className="py-4 sm:py-0 sm:px-5 first:pt-0 last:pb-0 sm:first:pl-0 sm:last:pr-0">
      <h3 className="font-rajdhani text-xs font-bold tracking-widest uppercase text-[var(--stats-text-muted)] mb-3">
        {title}
      </h3>
      <div className="grid grid-cols-2 gap-3">{children}</div>
      <div className="mt-4 pt-3 border-t border-[var(--stats-card-border)]">
        <MvpStat label={mvpLabel} value={mvpValue} color={mvpColor} />
      </div>
    </div>
  )
}

function Stat({ label, value, caption }: { label: string; value: string; caption?: string }) {
  return (
    <div>
      <p className="font-rajdhani text-[10px] font-bold tracking-widest uppercase text-[var(--stats-text-muted)] mb-0.5">{label}</p>
      <p className="font-cinzel text-lg font-bold text-[var(--stats-text)]">{value}</p>
      {caption && <p className="font-rajdhani text-[10px] text-[var(--stats-text-faint)] mt-0.5">{caption}</p>}
    </div>
  )
}

function MvpStat({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div className="text-center">
      <p className="font-rajdhani text-[9px] font-bold tracking-widest uppercase text-[var(--stats-text-muted)] mb-0.5">{label}</p>
      <p className={`font-cinzel text-base font-bold ${color}`}>{value.toFixed(2)}</p>
    </div>
  )
}

// Vertical column chart — batting position (1, 2, 3...) along the bottom,
// total runs scored from that position rising up the bar. Each bar is a
// real <button> (keyboard-operable, aria-pressed) rather than a div with an
// onClick — tapping it toggles selectedPosition in the parent, which
// filters Innings History below across all three stat tabs, not just
// Batting. Runs values are always printed above the bar rather than shown
// only on hover — this app is used outdoors on mobile (see ui-theme.md's
// "daylight-first" principle), so nothing here depends on a hover state.
function BattingPositionChart({
  data, selected, onSelect,
}: {
  data: { position: number; runs: number; innings: number }[]
  selected: number | null
  onSelect: (position: number) => void
}) {
  const max = Math.max(...data.map(d => d.runs), 1)
  // Every entry has at least 1 innings by construction (positionData only
  // ever creates one when a real match batted at that position) — a flat
  // 26% floor, rather than the old runs-scaled 4%/1.5% one, so the rotated
  // "N Inn" label below always has a tall-enough bar to sit inside without
  // clipping against the column's own overflow.
  const MIN_PCT = 26
  return (
    <div className="flex items-end gap-1.5 sm:gap-2.5 h-36">
      {data.map(({ position, runs, innings }) => {
        const isSelected = selected === position
        const pct = Math.max((runs / max) * 100, MIN_PCT)
        return (
          <button
            key={position}
            type="button"
            aria-pressed={isSelected}
            aria-label={`Batting position ${position} — ${runs} runs across ${innings} inning${innings === 1 ? '' : 's'}. Tap to ${isSelected ? 'clear filter' : 'filter innings history'}.`}
            onClick={() => onSelect(position)}
            className="flex-1 min-w-0 h-full flex flex-col items-center justify-end gap-1 group"
          >
            <span className={`font-rajdhani text-[10px] font-bold whitespace-nowrap ${isSelected ? 'text-blue-700 dark:text-blue-400' : 'text-[var(--stats-text-2)]'}`}>
              {runs}
            </span>
            <div
              style={{ height: `${pct}%` }}
              className={`relative w-full rounded-t transition-colors ${
                isSelected ? 'bg-blue-700 dark:bg-blue-400' : 'bg-gold/50 group-hover:bg-gold/70'
              }`}
              title={`${innings} innings played at position ${position}`}
            >
              <span className="absolute inset-0 flex items-end justify-center overflow-hidden pb-1.5">
                <span className={`-rotate-90 whitespace-nowrap font-rajdhani text-[9px] leading-none font-semibold ${
                  isSelected ? 'text-white/90' : 'text-[var(--stats-text-muted)] dark:text-zinc-500'
                }`}>
                  {innings} Inn
                </span>
              </span>
            </div>
            <span className={`font-rajdhani text-[10px] font-bold uppercase whitespace-nowrap ${isSelected ? 'text-blue-700 dark:text-blue-400' : 'text-[var(--stats-text-muted)]'}`}>
              {position}
            </span>
          </button>
        )
      })}
    </div>
  )
}

// Dismissal-type donut — added September 2026 alongside the analytics DB's
// per-bowler bowled/caught/caught_behind/lbw/stumping/other columns (see
// features/player-stats-batting-position.md §12). A real donut/pie is a
// deliberate departure from every other chart on this page (single-series
// magnitude bars) — six genuinely distinct categories summing to one whole
// is exactly the "part-to-whole at a glance, ≤6 segments" case the app's
// dataviz guidance calls out as the one legitimate pie/donut use, whereas a
// bar chart would have been the generic default.
//
// Colours are the dataviz skill's validated 8-hue categorical theme, slots
// 1-6 (DISMISSAL_TYPE_META) — chosen and order-locked specifically because
// this ordering passes the adjacent-pair CVD/contrast gates against this
// app's own --stats-card-bg surface in both themes (see that constant's own
// comment for the exact numbers). Never reorder the slices or reassign a
// colour per-render — categorical hues are assigned in fixed order.
//
// The arcs are decorative, not the click target — a thin ring segment for a
// rare dismissal type (one stumping in a season) is too small to reliably
// tap on a phone. Each legend row is the real, full-width <button>, with the
// value always printed inline (never hover-only, matching every other chart
// on this page) — this also satisfies the "relief rule" the palette's own
// contrast WARN calls for (three of the six colours sit under 3:1 on a
// white card, so the reader must never be relying on the colour alone).
function DismissalPieChart({
  data, selected, onSelect,
}: {
  data: { key: DismissalKey; label: string; light: string; dark: string; value: number }[]
  selected: DismissalKey | null
  onSelect: (key: DismissalKey) => void
}) {
  const { resolvedTheme } = useTheme()
  const total = data.reduce((sum, d) => sum + d.value, 0)
  const r = 38
  const circumference = 2 * Math.PI * r
  const gap = total > 0 ? 2 : 0 // small surface-coloured gap between adjacent slices

  let cumulative = 0
  const arcs = data.map(d => {
    const rawLength = (d.value / total) * circumference
    const visibleLength = Math.max(rawLength - gap, 0)
    const arc = {
      key: d.key,
      color: resolvedTheme === 'dark' ? d.dark : d.light,
      dashArray: `${visibleLength} ${circumference - visibleLength}`,
      dashOffset: -cumulative,
    }
    cumulative += rawLength
    return arc
  })

  return (
    <div className="flex flex-col sm:flex-row items-center gap-6">
      <div className="relative w-40 h-40 flex-shrink-0">
        <svg viewBox="0 0 100 100" className="w-full h-full">
          <g transform="rotate(-90 50 50)">
            {arcs.map(a => {
              const isDimmed = selected != null && selected !== a.key
              return (
                <circle
                  key={a.key}
                  cx="50" cy="50" r={r}
                  fill="none"
                  stroke={a.color}
                  strokeWidth={selected === a.key ? 16 : 14}
                  strokeDasharray={a.dashArray}
                  strokeDashoffset={a.dashOffset}
                  opacity={isDimmed ? 0.35 : 1}
                  style={{ transition: 'opacity 150ms, stroke-width 150ms' }}
                />
              )
            })}
          </g>
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
          <span className="font-cinzel text-2xl font-bold text-[var(--stats-text)]">{total}</span>
          <span className="font-rajdhani text-[10px] font-bold tracking-widest uppercase text-[var(--stats-text-muted)]">
            {total === 1 ? 'Wicket' : 'Wickets'}
          </span>
        </div>
      </div>
      <div className="flex-1 w-full min-w-0 flex flex-col gap-1">
        {data.map(d => {
          const isSelected = selected === d.key
          const pct = total > 0 ? Math.round((d.value / total) * 100) : 0
          const color = resolvedTheme === 'dark' ? d.dark : d.light
          return (
            <button
              key={d.key}
              type="button"
              aria-pressed={isSelected}
              onClick={() => onSelect(d.key)}
              className={`flex items-center gap-2 px-2 py-1.5 rounded transition-colors text-left
                ${isSelected ? 'bg-[var(--stats-badge-bg)]' : 'hover:bg-[var(--stats-row-hover)]'}`}
            >
              <span className="w-3 h-3 rounded-full flex-shrink-0" style={{ backgroundColor: color }} />
              <span className={`font-rajdhani text-sm flex-1 min-w-0 truncate ${isSelected ? 'font-bold text-[var(--stats-badge-text)]' : 'text-[var(--stats-text)]'}`}>
                {d.label}
              </span>
              <span className={`font-rajdhani text-sm font-bold whitespace-nowrap ${isSelected ? 'text-[var(--stats-badge-text)]' : 'text-[var(--stats-text-2)]'}`}>
                {d.value} <span className="text-[var(--stats-text-muted)] font-normal">({pct}%)</span>
              </span>
            </button>
          )
        })}
      </div>
    </div>
  )
}

// Innings History table — each row is a full <tr>, whole-row clickable to
// /matches/history/[bookingId] (rows with no bookingId render inert, same
// as the earlier card view's fallback). Column 3's content flips per tab.
// Row identity (format + date) uses <th scope="row"> — an accessible table,
// not a list of cards dressed up as rows.
function MatchHistoryTable({ matches, statTab }: { matches: PlayerMatchHistoryRow[]; statTab: StatTab }) {
  const columnLabel = statTab === 'batting' ? 'Runs' : statTab === 'bowling' ? 'Bowling' : 'Fielding'
  return (
    <div className="bg-[var(--stats-card-bg)] border border-[var(--stats-card-border)] rounded-2xl overflow-hidden overflow-x-auto">
      <table className="w-full border-collapse">
        <thead>
          <tr className="bg-[var(--stats-row-bg)] border-b border-[var(--stats-card-border)]">
            <th scope="col" className="text-left font-rajdhani text-[10px] font-bold tracking-widest uppercase text-[var(--stats-text-muted)] px-1.5 py-2 whitespace-nowrap">Date</th>
            <th scope="col" className="text-left font-rajdhani text-[10px] font-bold tracking-widest uppercase text-[var(--stats-text-muted)] px-2 py-2">Match</th>
            <th scope="col" className="text-center font-rajdhani text-[10px] font-bold tracking-widest uppercase text-[var(--stats-text-muted)] px-2 py-2">{columnLabel}</th>
            <th scope="col" className="text-center font-rajdhani text-[10px] font-bold tracking-widest uppercase text-[var(--stats-text-muted)] px-1.5 py-2 whitespace-nowrap">R</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-[var(--stats-card-border)]">
          {matches.map(m => <MatchHistoryRow key={m.matchId} match={m} statTab={statTab} />)}
        </tbody>
      </table>
    </div>
  )
}

function MatchHistoryRow({ match, statTab }: { match: PlayerMatchHistoryRow; statTab: StatTab }) {
  const router = useRouter()
  const d = match.gameDate ? new Date(match.gameDate) : null
  const clickable = !!match.bookingId
  const goToMatch = () => { if (match.bookingId) router.push(`/matches/history/${match.bookingId}`) }

  return (
    <tr
      {...(clickable ? {
        role: 'link',
        tabIndex: 0,
        onClick: goToMatch,
        onKeyDown: (e: React.KeyboardEvent<HTMLTableRowElement>) => { if (e.key === 'Enter' || e.key === ' ') goToMatch() },
      } : {})}
      className={clickable ? 'cursor-pointer hover:bg-[var(--stats-row-hover)] transition-colors' : ''}>
      <th scope="row" className="text-center font-normal align-middle px-1.5 py-2.5 whitespace-nowrap">
        {d ? (
          <div className="flex flex-col items-center gap-0.5">
            <div className="flex items-center gap-1">
              <span
                className="font-rajdhani text-[10px] font-bold tracking-wide text-[var(--stats-text-faint)] uppercase whitespace-nowrap"
                style={{ writingMode: 'vertical-rl', transform: 'rotate(180deg)' }}
              >
                {d.toLocaleDateString('en-IN', { month: 'short' })}-{String(d.getFullYear()).slice(-2)}
              </span>
              <span className="font-cinzel text-sm font-bold text-[var(--stats-text)]">{String(d.getDate()).padStart(2, '0')}</span>
            </div>
          </div>
        ) : (
          <span className="font-rajdhani text-xs text-[var(--stats-text-faint)]">—</span>
        )}
      </th>
      <td className="align-middle px-2 py-2.5">
        <span className="block font-rajdhani text-sm text-[var(--stats-text)]">
          {match.tournamentName ?? '—'}
        </span>
        <span className="block font-rajdhani text-xs text-[var(--stats-text-muted)] mt-0.5">{match.opponentName ? `vs ${match.opponentName}` : '—'}</span>
      </td>
      <td className="text-center align-middle px-2 py-2.5">
        {statTab === 'batting' && match.batting && <BattingCell batting={match.batting} />}
        {statTab === 'bowling' && match.bowling && <BowlingCell bowling={match.bowling} />}
        {statTab === 'fielding' && match.fielding && <FieldingCell fielding={match.fielding} />}
      </td>
      <td className="text-center align-middle px-1.5 py-2.5">
        {match.matchResult ? <ResultCell result={match.matchResult} /> : <span className="font-rajdhani text-xs text-[var(--stats-text-faint)]">—</span>}
      </td>
    </tr>
  )
}

function ResultCell({ result }: { result: string }) {
  const r = result.toLowerCase()
  if (r.includes('won'))
    return <span className="inline-block bg-emerald-600 text-white text-[10px] font-bold px-2 py-0.5 rounded-full">W</span>
  if (r.includes('lost'))
    return <span className="text-red-700 dark:text-red-400 text-[10px] font-bold">L</span>
  if (r.includes('tie'))
    return <span className="text-amber-700 dark:text-amber-400 text-[10px] font-bold">T</span>
  return <span className="text-[var(--stats-text-faint)] text-[10px] font-bold">{result.charAt(0).toUpperCase()}</span>
}

// Raw dismissal_method values from the analytics DB use snake_case
// (e.g. "caught_behind", "run_out") — humanize known ones explicitly,
// fall back to a generic underscore-to-space + title-case for anything else.
const DISMISSAL_LABELS: Record<string, string> = {
  caught_behind: 'C&B',
  run_out: 'Run Out',
}
function formatDismissal(howOut: string): string {
  return DISMISSAL_LABELS[howOut] ?? howOut.split('_').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ')
}

function BattingCell({ batting }: { batting: NonNullable<PlayerMatchHistoryRow['batting']> }) {
  const highlight = batting.runs >= 30
  return (
    <>
      <span className={`block font-rajdhani text-sm font-semibold ${highlight ? 'text-blue-700 dark:text-blue-400' : 'text-[var(--stats-badge-text)]'}`}>
        {batting.runs}{batting.notOut ? '*' : ''} ({batting.balls})
      </span>
      {!batting.notOut && (
        <span className="block font-rajdhani text-xs text-[var(--stats-text-muted)] mt-0.5">{batting.howOut ? formatDismissal(batting.howOut) : '—'}</span>
      )}
    </>
  )
}

function BowlingCell({ bowling }: { bowling: NonNullable<PlayerMatchHistoryRow['bowling']> }) {
  const highlight = bowling.wickets >= 3
  return (
    <>
      <span className="block font-rajdhani text-[10px] font-bold tracking-wide uppercase text-[var(--stats-text-faint)]">O-D-R-W</span>
      <span className={`block font-rajdhani text-sm font-semibold mt-0.5 ${highlight ? 'text-blue-700 dark:text-blue-400' : 'text-[var(--stats-badge-text)]'}`}>
        {bowling.overs}-{bowling.dots}-{bowling.runsConceded}-{bowling.wickets}
      </span>
    </>
  )
}

function FieldingCell({ fielding }: { fielding: NonNullable<PlayerMatchHistoryRow['fielding']> }) {
  const parts = [
    fielding.catches > 0 ? `${fielding.catches} ct` : null,
    fielding.stumpings > 0 ? `${fielding.stumpings} st` : null,
    fielding.runOuts > 0 ? `${fielding.runOuts} ro` : null,
  ].filter((p): p is string => p !== null)
  const total = fielding.catches + fielding.stumpings + fielding.runOuts
  const highlight = total >= 3
  return parts.length > 0 ? (
    <span className={`font-rajdhani text-sm font-semibold ${highlight ? 'text-blue-700 dark:text-blue-400' : 'text-[var(--stats-badge-text)]'}`}>
      {parts.map(p => <span key={p} className="block">{p}</span>)}
    </span>
  ) : (
    <span className="font-rajdhani text-xs text-[var(--stats-text-faint)]">—</span>
  )
}
