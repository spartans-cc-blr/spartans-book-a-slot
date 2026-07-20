'use client'
// Full player stats page — career + filtered (year/tournament) summary,
// plus a match-by-match batting/bowling/fielding breakdown. Reachable via
// PlayerNameLink (see src/lib/playerLink.tsx) wherever a Hub player's name
// appears, and via avatar on /profile (own) and the GC Players grid.
// Not linked from Captains' Corner by design, and squad panels only ever
// get a small avatar icon into this page — never the name-link swap that
// would lengthen those cards.

import { useState, useEffect, useCallback } from 'react'
import Link from 'next/link'
import { CricketBallIcon } from '@/components/ui/CricketBallIcon'
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

export function PlayerStatsClient({
  player, tournaments, initialCareer, initialMatches,
}: {
  player: PlayerInfo
  tournaments: { id: string; name: string }[]
  initialCareer: PlayerStatsTotals
  initialMatches: PlayerMatchHistoryRow[]
}) {
  const [year, setYear] = useState<number | 'all'>('all')
  const [tournamentId, setTournamentId] = useState<string>('all')
  const [scoped, setScoped] = useState<PlayerStatsTotals>(initialCareer)
  const [matches, setMatches] = useState<PlayerMatchHistoryRow[]>(initialMatches)
  const [loading, setLoading] = useState(false)

  const fetchScoped = useCallback(async () => {
    if (year === 'all' && tournamentId === 'all') {
      setScoped(initialCareer)
      setMatches(initialMatches)
      return
    }
    setLoading(true)
    const params = new URLSearchParams()
    if (year !== 'all') params.set('year', String(year))
    if (tournamentId !== 'all') params.set('tournament', tournamentId)
    const res = await fetch(`/api/players/${player.id}/match-history?${params.toString()}`)
    if (res.ok) {
      const d = await res.json()
      setScoped(d.scoped)
      setMatches(d.matches)
    }
    setLoading(false)
  }, [year, tournamentId, player.id, initialCareer, initialMatches])

  useEffect(() => { fetchScoped() }, [fetchScoped])

  return (
    <>
      <div className="bg-ink-2 border-b border-ink-4 px-5 md:px-8 lg:px-10 py-7 relative overflow-hidden">
        <div className="absolute -top-8 -right-8 w-48 h-48 rounded-full pointer-events-none"
          style={{ background: 'radial-gradient(circle, rgba(201,168,76,0.08) 0%, transparent 70%)' }} />
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
            <h1 className="font-cinzel text-xl md:text-2xl font-bold text-parchment tracking-wide">{player.name}</h1>
            <div className="flex items-center gap-2 mt-1 flex-wrap">
              {(player.jersey_name || player.jersey_number != null) && (
                <span className="font-rajdhani text-xs text-zinc-500">
                  {player.jersey_number != null && `#${player.jersey_number}`}
                  {player.jersey_number != null && player.jersey_name && ' · '}
                  {player.jersey_name}
                </span>
              )}
              {player.cricheroes_url && (
                <a href={player.cricheroes_url} target="_blank" rel="noopener noreferrer"
                  className="font-rajdhani text-xs text-zinc-500 hover:text-gold underline decoration-dotted underline-offset-2 transition-colors">
                  View on CricHeroes ↗
                </a>
              )}
            </div>
          </div>
        </div>
      </div>

      <div className="px-5 md:px-8 lg:px-10 py-6 max-w-3xl mx-auto">
        {/* Filters */}
        <div className="flex gap-2 flex-wrap mb-5">
          <select value={year} onChange={e => setYear(e.target.value === 'all' ? 'all' : Number(e.target.value))}
            className="font-rajdhani text-sm bg-ink-3 border border-ink-5 text-parchment rounded px-3 py-1.5">
            <option value="all">All Years</option>
            {YEARS.map(y => <option key={y} value={y}>{y}</option>)}
          </select>
          <select value={tournamentId} onChange={e => setTournamentId(e.target.value)}
            className="font-rajdhani text-sm bg-ink-3 border border-ink-5 text-parchment rounded px-3 py-1.5">
            <option value="all">All Tournaments</option>
            {tournaments.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
          </select>
        </div>

        {/* Summary */}
        <div className="bg-ink-3 border border-ink-5 rounded p-5 mb-5">
          <h2 className="font-cinzel text-sm text-gold font-semibold mb-4">
            {year === 'all' && tournamentId === 'all' ? 'Career' : 'Filtered'} Summary
          </h2>
          {scoped.matches === 0 ? (
            <p className="font-rajdhani text-sm text-zinc-500">No matches for this filter.</p>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
              <Stat label="Matches" value={String(scoped.matches)} />
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
            <div className="grid grid-cols-3 gap-3 mt-5 pt-4 border-t border-ink-5">
              <MvpStat label="Batting MVP" value={scoped.battingMvp} color="text-emerald-400" />
              <MvpStat label="Bowling MVP" value={scoped.bowlingMvp} color="text-blue-400" />
              <MvpStat label="Fielding MVP" value={scoped.fieldingMvp} color="text-purple-400" />
            </div>
          )}
        </div>

        {/* Match by match */}
        <div className="bg-ink-3 border border-ink-5 rounded p-5">
          <h2 className="font-cinzel text-sm text-gold font-semibold mb-4">Match History</h2>
          {loading ? (
            <p className="font-rajdhani text-sm text-zinc-500">Loading…</p>
          ) : matches.length === 0 ? (
            <p className="font-rajdhani text-sm text-zinc-500">No matches for this filter.</p>
          ) : (
            <div className="divide-y divide-ink-5">
              {matches.map(m => <MatchRow key={m.matchId} match={m} />)}
            </div>
          )}
        </div>
      </div>
    </>
  )
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="font-rajdhani text-[10px] font-bold tracking-widest uppercase text-zinc-600 mb-0.5">{label}</p>
      <p className="font-cinzel text-lg font-bold text-parchment">{value}</p>
    </div>
  )
}

function MvpStat({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div className="text-center">
      <p className="font-rajdhani text-[9px] font-bold tracking-widest uppercase text-zinc-600 mb-0.5">{label}</p>
      <p className={`font-cinzel text-base font-bold ${color}`}>{value.toFixed(1)}</p>
    </div>
  )
}

function MatchRow({ match }: { match: PlayerMatchHistoryRow }) {
  const dateLabel = match.gameDate
    ? new Date(match.gameDate).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })
    : '—'

  const body = (
    <>
      <div className="flex items-center justify-between gap-3 mb-1.5">
        <p className="font-rajdhani text-sm font-semibold text-parchment truncate">
          {match.opponentName ? `vs ${match.opponentName}` : match.tournamentName ?? 'Match'}
        </p>
        <span className="font-rajdhani text-xs text-zinc-500 whitespace-nowrap">
          {dateLabel}{match.format ? ` · ${match.format}` : ''}
        </span>
      </div>
      <div className="flex flex-wrap gap-x-4 gap-y-1 font-rajdhani text-xs text-zinc-400">
        {match.batting && (
          <span>
            🏏 {match.batting.runs}{match.batting.notOut ? '*' : ''} ({match.batting.balls}b
            {match.batting.strikeRate != null ? `, SR ${match.batting.strikeRate.toFixed(1)}` : ''})
          </span>
        )}
        {match.bowling && (
          <span className="inline-flex items-center gap-1">
            <CricketBallIcon size={12} /> {match.bowling.wickets}/{match.bowling.runsConceded} ({match.bowling.overs}ov
            {match.bowling.economy != null ? `, Eco ${match.bowling.economy.toFixed(1)}` : ''})
          </span>
        )}
        {match.fielding && (match.fielding.catches + match.fielding.runOuts + match.fielding.stumpings > 0) && (
          <span>
            🧤 {match.fielding.catches}c {match.fielding.runOuts}ro {match.fielding.stumpings}st
          </span>
        )}
        {!match.batting && !match.bowling && !match.fielding && (
          <span className="text-zinc-600">No stat line recorded</span>
        )}
        {match.matchResult && <span className="text-zinc-600">{match.matchResult}</span>}
      </div>
    </>
  )

  if (match.bookingId) {
    return (
      <Link href={`/matches/history/${match.bookingId}`} className="block py-3 -mx-2 px-2 rounded hover:bg-ink-4 transition-colors">
        {body}
      </Link>
    )
  }
  return <div className="py-3">{body}</div>
}
