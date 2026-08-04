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
// Match History below the summary is split into Batting/Bowling/Fielding
// tabs (plain text, no icons — the tab itself already says what kind of
// innings this is). Each tab only lists matches carrying that stat line
// (e.g. Batting hides matches this player didn't bat in) and cards are
// sorted most-recent first — `matches` already arrives pre-sorted by
// date+time from getPlayerMatchHistory(), so no client-side sort is
// needed here.

import { useState, useEffect, useCallback, useMemo } from 'react'
import Link from 'next/link'
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
  const [scoped, setScoped] = useState<PlayerStatsTotals>(initialCareer)
  const [matches, setMatches] = useState<PlayerMatchHistoryRow[]>(initialMatches)
  const [loading, setLoading] = useState(false)
  const [statTab, setStatTab] = useState<StatTab>('batting')

  const fetchScoped = useCallback(async () => {
    if (year === 'all' && groundId === 'all' && formats.size === 2 && !asCaptain) {
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
    const res = await fetch(`/api/players/${player.id}/match-history?${params.toString()}`)
    if (res.ok) {
      const d = await res.json()
      setScoped(d.scoped)
      setMatches(d.matches)
    }
    setLoading(false)
  }, [year, groundId, formats, asCaptain, player.id, initialCareer, initialMatches])

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

  const isFiltered = year !== 'all' || groundId !== 'all' || formats.size === 1 || asCaptain

  const tabMatches = useMemo(
    () => matches.filter(m => statTab === 'batting' ? m.batting : statTab === 'bowling' ? m.bowling : m.fielding),
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
          <h2 className="font-cinzel text-sm text-gold-dim font-semibold mb-4">Match History</h2>
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
            <div className="space-y-3">
              {tabMatches.map(m => <InningsCard key={m.matchId} match={m} statTab={statTab} />)}
            </div>
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

function InningsCard({ match, statTab }: { match: PlayerMatchHistoryRow; statTab: StatTab }) {
  const dateLabel = match.gameDate
    ? new Date(match.gameDate).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })
    : '—'

  // Opponent and tournament together underneath the date — unlike the old
  // combined view, each tab is already scoped to one stat type, so there's
  // room to show both rather than picking one.
  const subLabel = [
    match.opponentName ? `vs ${match.opponentName}` : null,
    match.tournamentName,
  ].filter(Boolean).join(' · ')

  const body = (
    <div style={{
      background: 'linear-gradient(135deg, #1C2333 0%, #111827 100%)',
      border: '1px solid #2D3748',
      borderRadius: '12px',
      padding: '14px',
      boxShadow: '0 4px 20px rgba(0,0,0,0.4)',
      position: 'relative',
      overflow: 'hidden',
    }}>
      {/* Gold top accent bar — matches FixturesCard.tsx */}
      <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: '3px', background: 'linear-gradient(90deg, #C9A84C, #F5D78E, #C9A84C)' }} />

      <p className="font-rajdhani text-sm font-semibold text-parchment">
        {dateLabel}{match.format ? ` · ${match.format}` : ''}
      </p>
      {subLabel && <p className="font-rajdhani text-xs text-zinc-500 mt-0.5">{subLabel}</p>}

      <div className="flex flex-wrap gap-x-4 gap-y-1 font-rajdhani text-xs text-zinc-400 mt-2">
        {statTab === 'batting' && match.batting && <BattingFields batting={match.batting} />}
        {statTab === 'bowling' && match.bowling && <BowlingFields bowling={match.bowling} />}
        {statTab === 'fielding' && match.fielding && <FieldingFields fielding={match.fielding} />}
      </div>
    </div>
  )

  if (match.bookingId) {
    return (
      <Link href={`/matches/history/${match.bookingId}`} className="block transition-transform hover:-translate-y-0.5">
        {body}
      </Link>
    )
  }
  return body
}

function BattingFields({ batting }: { batting: NonNullable<PlayerMatchHistoryRow['batting']> }) {
  return (
    <>
      <span>Runs: <span className="text-gold font-semibold">{batting.runs}{batting.notOut ? '*' : ''}</span> ({batting.balls})</span>
      <span>How out: <span className="text-zinc-300">{batting.notOut ? 'Not out' : (batting.howOut ?? '—')}</span></span>
    </>
  )
}

function BowlingFields({ bowling }: { bowling: NonNullable<PlayerMatchHistoryRow['bowling']> }) {
  return (
    <span>O-D-R-W: <span className="text-gold font-semibold">{bowling.overs}-{bowling.dots}-{bowling.runsConceded}-{bowling.wickets}</span></span>
  )
}

function FieldingFields({ fielding }: { fielding: NonNullable<PlayerMatchHistoryRow['fielding']> }) {
  const total = fielding.catches + fielding.runOuts + fielding.stumpings
  return (
    <>
      <span>Catches: <span className="text-zinc-300">{fielding.catches}</span></span>
      <span>Stumpings: <span className="text-zinc-300">{fielding.stumpings}</span></span>
      <span>Run Outs: <span className="text-zinc-300">{fielding.runOuts}</span></span>
      <span>Total: <span className="text-gold font-semibold">{total}</span></span>
    </>
  )
}
