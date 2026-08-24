'use client'
// Full player stats page — career + filtered (year/ground/format) summary,
// plus a match-by-match batting/bowling/fielding breakdown. Reachable via
// PlayerNameLink (see src/lib/playerLink.tsx) wherever a Hub player's name
// appears, and via avatar on /profile (own) and the GC Players grid.
// Not linked from Captains' Corner by design, and squad panels only ever
// get a small avatar icon into this page — never the name-link swap that
// would lengthen those cards.
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
// Innings History below the summary is split into Batting/Bowling/Fielding
// tabs (plain text, no icons — the tab itself already says what kind of
// innings this is). Each tab only lists matches carrying that stat line
// (e.g. Batting hides matches this player didn't bat in) and cards are
// sorted most-recent first — `matches` already arrives pre-sorted by
// date+time from getPlayerMatchHistory(), so no client-side sort is
// needed here.

import { useState, useEffect, useCallback, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import type { PlayerStatsTotals, PlayerMatchHistoryRow } from '@/types'

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
const STAT_TABS: StatTab[] = ['batting', 'bowling', 'fielding']

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
  const [scoped, setScoped] = useState<PlayerStatsTotals>(initialCareer)
  const [matches, setMatches] = useState<PlayerMatchHistoryRow[]>(initialMatches)
  const [loading, setLoading] = useState(false)
  const [statTab, setStatTab] = useState<StatTab>('batting')

  const fetchScoped = useCallback(async () => {
    if (year === 'all' && groundId === 'all' && formats.size === 2 && !asCaptain && innings.size === 2 && !includePractice) {
      setScoped(initialCareer)
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
      setScoped(d.scoped)
      setMatches(d.matches)
    }
    setLoading(false)
  }, [year, groundId, formats, asCaptain, innings, includePractice, player.id, initialCareer, initialMatches])

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

  const isFiltered = year !== 'all' || groundId !== 'all' || formats.size === 1 || asCaptain || innings.size === 1 || includePractice

  const tabMatches = useMemo(
    () => matches.filter(m => {
      if (statTab === 'batting') return !!m.batting
      if (statTab === 'bowling') return !!m.bowling
      return !!m.fielding && (m.fielding.catches > 0 || m.fielding.stumpings > 0 || m.fielding.runOuts > 0)
    }),
    [matches, statTab],
  )

  return (
    <>
      <div className="bg-white border-b border-parchment-3 px-5 md:px-8 lg:px-10 py-7 relative overflow-hidden">
        <div className="absolute -top-8 -right-8 w-48 h-48 rounded-full pointer-events-none"
          style={{ background: 'radial-gradient(circle, rgba(217,119,6,0.08) 0%, transparent 70%)' }} />
        <div className="flex items-center gap-4">
          <img
            src={player.photo_url ?? '/default-avatar.png'}
            alt={player.name}
            className="w-16 h-16 rounded-full object-cover border-2 border-gold-dim flex-shrink-0"
          />
          <div>
            <p className="text-gold text-xs font-rajdhani font-semibold tracking-[3px] uppercase mb-1 flex items-center gap-2">
              <span className="w-4 h-px bg-gold inline-block" />
              Player Stats
            </p>
            <h1 className="font-cinzel text-xl md:text-2xl font-bold text-ink tracking-wide">{player.name}</h1>
            <div className="flex items-center gap-2 mt-1 flex-wrap">
              {(player.jersey_name || player.jersey_number != null) && (
                <span className="font-rajdhani text-xs text-stone-500">
                  {player.jersey_number != null && `#${player.jersey_number}`}
                  {player.jersey_number != null && player.jersey_name && ' · '}
                  {player.jersey_name}
                </span>
              )}
              {player.cricheroes_url && (
                <a href={player.cricheroes_url} target="_blank" rel="noopener noreferrer"
                  className="font-rajdhani text-xs text-stone-500 hover:text-gold-dim underline decoration-dotted underline-offset-2 transition-colors">
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
          <div className="flex gap-2 items-center flex-shrink-0">
            <select value={year} onChange={e => setYear(e.target.value === 'all' ? 'all' : Number(e.target.value))}
              className="font-rajdhani text-sm bg-white border border-parchment-3 text-ink rounded px-3 py-1.5 flex-shrink-0">
              <option value="all">All Years</option>
              {YEARS.map(y => <option key={y} value={y}>{y}</option>)}
            </select>
            <label className={`flex items-center gap-1.5 font-rajdhani text-sm font-bold cursor-pointer select-none flex-shrink-0
              ${formats.has('T20') ? 'text-gold-dim' : 'text-stone-500'}`}>
              <input type="checkbox" checked={formats.has('T20')} onChange={() => toggleFormat('T20')} className="accent-gold" />
              T20
            </label>
            <label className={`flex items-center gap-1.5 font-rajdhani text-sm font-bold cursor-pointer select-none flex-shrink-0
              ${formats.has('T30') ? 'text-gold-dim' : 'text-stone-500'}`}>
              <input type="checkbox" checked={formats.has('T30')} onChange={() => toggleFormat('T30')} className="accent-gold" />
              T30
            </label>
            <label className={`flex items-center gap-1.5 font-rajdhani text-sm font-bold cursor-pointer select-none flex-shrink-0
              ${asCaptain ? 'text-gold-dim' : 'text-stone-500'}`}>
              <input type="checkbox" checked={asCaptain} onChange={() => setAsCaptain(v => !v)} className="accent-gold" />
              As Captain
            </label>
          </div>
          <div className="flex gap-2 items-center flex-shrink-0">
            <label className={`flex items-center gap-1.5 font-rajdhani text-sm font-bold cursor-pointer select-none flex-shrink-0
              ${innings.has('defending') ? 'text-gold-dim' : 'text-stone-500'}`}>
              <input type="checkbox" checked={innings.has('defending')} onChange={() => toggleInnings('defending')} className="accent-gold" />
              Defending
            </label>
            <label className={`flex items-center gap-1.5 font-rajdhani text-sm font-bold cursor-pointer select-none flex-shrink-0
              ${innings.has('chasing') ? 'text-gold-dim' : 'text-stone-500'}`}>
              <input type="checkbox" checked={innings.has('chasing')} onChange={() => toggleInnings('chasing')} className="accent-gold" />
              Chasing
            </label>
            <label className={`flex items-center gap-1.5 font-rajdhani text-sm font-bold cursor-pointer select-none flex-shrink-0
              ${includePractice ? 'text-gold-dim' : 'text-stone-500'}`}>
              <input type="checkbox" checked={includePractice} onChange={() => setIncludePractice(v => !v)} className="accent-gold" />
              Include Practice Games
            </label>
          </div>
          <select value={groundId} onChange={e => setGroundId(e.target.value)}
            className="font-rajdhani text-sm bg-white border border-parchment-3 text-ink rounded px-3 py-1.5 w-full">
            <option value="all">All Grounds</option>
            {grounds.map(g => <option key={g.id} value={g.id}>{g.name}</option>)}
          </select>
        </div>

        {/* Summary */}
        <div className="bg-white border border-parchment-3 rounded-2xl p-5 mb-5">
          <h2 className="font-cinzel text-sm text-gold-dim font-semibold mb-4">
            {isFiltered ? 'Filtered' : 'Career'} Summary
          </h2>
          {scoped.matches === 0 ? (
            <p className="font-rajdhani text-sm text-stone-500">No matches for this filter.</p>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
              <Stat label="Matches" value={String(scoped.matches)}
                caption={scoped.battingInnings !== scoped.matches || scoped.bowlingInnings !== scoped.matches
                  ? `Bat ${scoped.battingInnings} · Bowl ${scoped.bowlingInnings}` : undefined} />
              <Stat label="Runs" value={String(scoped.runs)} />
              <Stat label="Avg" value={scoped.battingAverage?.toFixed(2) ?? '—'} />
              <Stat label="S/R" value={scoped.strikeRate?.toFixed(2) ?? '—'} />
              <Stat label="Wickets" value={String(scoped.wickets)} />
              <Stat label="Economy" value={scoped.economy?.toFixed(2) ?? '—'} />
              <Stat label="Dismissals" value={String(scoped.catches + scoped.runOuts + scoped.stumpings)} />
              <Stat label="MVP Pts" value={scoped.mvpPoints.toFixed(2)} />
            </div>
          )}
          {scoped.matches > 0 && (
            <div className="grid grid-cols-3 gap-3 mt-5 pt-4 border-t border-parchment-3">
              <MvpStat label="Batting MVP" value={scoped.battingMvp} color="text-emerald-600" />
              <MvpStat label="Bowling MVP" value={scoped.bowlingMvp} color="text-blue-600" />
              <MvpStat label="Fielding MVP" value={scoped.fieldingMvp} color="text-purple-600" />
            </div>
          )}
        </div>

        {/* Match by match */}
        <div className="bg-white border border-parchment-3 rounded-2xl p-5">
          <h2 className="font-cinzel text-sm text-gold-dim font-semibold mb-4">Innings History</h2>
          <div className="flex gap-2 mb-4">
            {STAT_TABS.map(t => (
              <button key={t} onClick={() => setStatTab(t)}
                className={`font-rajdhani text-xs font-bold tracking-widest uppercase px-3 py-1.5 rounded border transition-colors capitalize
                  ${statTab === t ? 'bg-gold/10 border-gold-dim text-gold-dim' : 'border-parchment-3 text-stone-500 hover:text-stone-700'}`}>
                {t}
              </button>
            ))}
          </div>
          {loading ? (
            <p className="font-rajdhani text-sm text-stone-500">Loading…</p>
          ) : tabMatches.length === 0 ? (
            <p className="font-rajdhani text-sm text-stone-500">No {statTab} innings for this filter.</p>
          ) : (
            <MatchHistoryTable matches={tabMatches} statTab={statTab} />
          )}
        </div>
      </div>
    </>
  )
}

function Stat({ label, value, caption }: { label: string; value: string; caption?: string }) {
  return (
    <div>
      <p className="font-rajdhani text-[10px] font-bold tracking-widest uppercase text-stone-500 mb-0.5">{label}</p>
      <p className="font-cinzel text-lg font-bold text-ink">{value}</p>
      {caption && <p className="font-rajdhani text-[10px] text-stone-400 mt-0.5">{caption}</p>}
    </div>
  )
}

function MvpStat({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div className="text-center">
      <p className="font-rajdhani text-[9px] font-bold tracking-widest uppercase text-stone-500 mb-0.5">{label}</p>
      <p className={`font-cinzel text-base font-bold ${color}`}>{value.toFixed(2)}</p>
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
    <div className="bg-white border border-parchment-3 rounded-2xl overflow-hidden overflow-x-auto">
      <table className="w-full border-collapse">
        <thead>
          <tr className="bg-parchment-2 border-b border-parchment-3">
            <th scope="col" className="text-left font-rajdhani text-[10px] font-bold tracking-widest uppercase text-stone-500 px-1.5 py-2 whitespace-nowrap">Date</th>
            <th scope="col" className="text-left font-rajdhani text-[10px] font-bold tracking-widest uppercase text-stone-500 px-2 py-2">Match</th>
            <th scope="col" className="text-center font-rajdhani text-[10px] font-bold tracking-widest uppercase text-stone-500 px-2 py-2">{columnLabel}</th>
            <th scope="col" className="text-center font-rajdhani text-[10px] font-bold tracking-widest uppercase text-stone-500 px-1.5 py-2 whitespace-nowrap">R</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-parchment-3">
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
      className={clickable ? 'cursor-pointer hover:bg-parchment-2 transition-colors' : ''}>
      <th scope="row" className="text-center font-normal align-middle px-1.5 py-2.5 whitespace-nowrap">
        {d ? (
          <div className="flex flex-col items-center gap-0.5">
            <div className="flex items-center gap-1">
              <span
                className="font-rajdhani text-[10px] font-bold tracking-wide text-stone-400 uppercase whitespace-nowrap"
                style={{ writingMode: 'vertical-rl', transform: 'rotate(180deg)' }}
              >
                {d.toLocaleDateString('en-IN', { month: 'short' })}-{String(d.getFullYear()).slice(-2)}
              </span>
              <span className="font-cinzel text-sm font-bold text-ink">{String(d.getDate()).padStart(2, '0')}</span>
            </div>
          </div>
        ) : (
          <span className="font-rajdhani text-xs text-stone-400">—</span>
        )}
      </th>
      <td className="align-middle px-2 py-2.5">
        <span className="block font-rajdhani text-sm text-ink">
          {match.tournamentName ?? '—'}
        </span>
        <span className="block font-rajdhani text-xs text-stone-500 mt-0.5">{match.opponentName ? `vs ${match.opponentName}` : '—'}</span>
      </td>
      <td className="text-center align-middle px-2 py-2.5">
        {statTab === 'batting' && match.batting && <BattingCell batting={match.batting} />}
        {statTab === 'bowling' && match.bowling && <BowlingCell bowling={match.bowling} />}
        {statTab === 'fielding' && match.fielding && <FieldingCell fielding={match.fielding} />}
      </td>
      <td className="text-center align-middle px-1.5 py-2.5">
        {match.matchResult ? <ResultCell result={match.matchResult} /> : <span className="font-rajdhani text-xs text-stone-400">—</span>}
      </td>
    </tr>
  )
}

function ResultCell({ result }: { result: string }) {
  const r = result.toLowerCase()
  if (r.includes('won'))
    return <span className="inline-block bg-emerald-600 text-white text-[10px] font-bold px-2 py-0.5 rounded-full">W</span>
  if (r.includes('lost'))
    return <span className="text-red-700 text-[10px] font-bold">L</span>
  if (r.includes('tie'))
    return <span className="text-amber-700 text-[10px] font-bold">T</span>
  return <span className="text-stone-400 text-[10px] font-bold">{result.charAt(0).toUpperCase()}</span>
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
      <span className={`block font-rajdhani text-sm font-semibold ${highlight ? 'text-blue-700' : 'text-gold-dim'}`}>
        {batting.runs}{batting.notOut ? '*' : ''} ({batting.balls})
      </span>
      {!batting.notOut && (
        <span className="block font-rajdhani text-xs text-stone-500 mt-0.5">{batting.howOut ? formatDismissal(batting.howOut) : '—'}</span>
      )}
    </>
  )
}

function BowlingCell({ bowling }: { bowling: NonNullable<PlayerMatchHistoryRow['bowling']> }) {
  const highlight = bowling.wickets >= 3
  return (
    <>
      <span className="block font-rajdhani text-[10px] font-bold tracking-wide uppercase text-stone-400">O-D-R-W</span>
      <span className={`block font-rajdhani text-sm font-semibold mt-0.5 ${highlight ? 'text-blue-700' : 'text-gold-dim'}`}>
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
    <span className={`font-rajdhani text-sm font-semibold ${highlight ? 'text-blue-700' : 'text-gold-dim'}`}>
      {parts.map(p => <span key={p} className="block">{p}</span>)}
    </span>
  ) : (
    <span className="font-rajdhani text-xs text-stone-400">—</span>
  )
}
