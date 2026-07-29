'use client'
// Sortable performance table for /leaderboard. Rows arrive already filtered
// by year/tournament (server-side, see src/app/leaderboard/page.tsx) — this
// component only re-sorts and re-renders per-category columns. Tap a column
// header to sort by it; tap again to flip direction.

import { useMemo, useState } from 'react'
import { PlayerNameLink } from '@/lib/playerLink'
import type { LeaderboardRow, PlayerStatsTotals } from '@/types'
import type { TableCategory } from './LeaderboardFilters'

type SortKey =
  | 'matches' | 'battingInnings' | 'bowlingInnings' | 'runs' | 'battingAverage' | 'strikeRate'
  | 'wickets' | 'economy' | 'bowlingAverage' | 'bowlingStrikeRate'
  | 'catches' | 'runOuts' | 'stumpings' | 'dismissals' | 'mvpPoints'

// Bowling average isn't precomputed on PlayerStatsTotals (bowling strike
// rate is — see src/lib/playerStats.ts) — derived here from the fields
// that are.
function bowlingAverage(s: PlayerStatsTotals): number | null {
  return s.wickets > 0 ? Math.round((s.runsConceded / s.wickets) * 100) / 100 : null
}
// Combined fielding dismissals — catches, run outs, and stumpings all count
// toward MVP, so the MVP tab shows one rolled-up figure rather than catches
// alone (the Fielding tab still breaks the three out individually).
function dismissals(s: PlayerStatsTotals): number {
  return s.catches + s.runOuts + s.stumpings
}

function statValue(row: LeaderboardRow, key: SortKey): number | null {
  if (key === 'bowlingAverage') return bowlingAverage(row.stats)
  if (key === 'dismissals')     return dismissals(row.stats)
  return (row.stats as any)[key] as number | null
}

// Rate/points columns always render to two decimal places, even a whole
// number like 6 — integer counts (matches, innings, wickets, catches, etc.)
// stay bare rather than becoming "6.00".
const DECIMAL_KEYS = new Set<SortKey>([
  'battingAverage', 'strikeRate', 'economy', 'bowlingAverage', 'bowlingStrikeRate', 'mvpPoints',
])
function formatStatValue(v: number | null, key: SortKey): string {
  if (v == null) return '—'
  return DECIMAL_KEYS.has(key) ? v.toFixed(2) : String(v)
}

const COLUMNS: Record<TableCategory, { key: SortKey; label: string }[]> = {
  batting: [
    { key: 'matches', label: 'M' },
    { key: 'battingInnings', label: 'Inn' },
    { key: 'runs', label: 'Runs' },
    { key: 'battingAverage', label: 'Avg' },
    { key: 'strikeRate', label: 'S/R' },
  ],
  bowling: [
    { key: 'matches', label: 'M' },
    { key: 'bowlingInnings', label: 'Inn' },
    { key: 'wickets', label: 'Wkts' },
    { key: 'economy', label: 'Econ' },
    { key: 'bowlingAverage', label: 'Avg' },
    { key: 'bowlingStrikeRate', label: 'S/R' },
  ],
  fielding: [
    { key: 'matches', label: 'M' },
    { key: 'catches', label: 'Ct' },
    { key: 'runOuts', label: 'RO' },
    { key: 'stumpings', label: 'St' },
    { key: 'dismissals', label: 'Total' },
  ],
  mvp: [
    { key: 'matches', label: 'M' },
    { key: 'runs', label: 'Runs' },
    { key: 'wickets', label: 'Wkts' },
    { key: 'dismissals', label: 'Dismissals' },
    { key: 'mvpPoints', label: 'MVP' },
  ],
}

const DEFAULT_SORT: Record<TableCategory, SortKey> = {
  batting: 'runs', bowling: 'wickets', fielding: 'dismissals', mvp: 'mvpPoints',
}

export function LeaderboardTable({ rows, category, tournamentFiltered }: {
  rows: LeaderboardRow[]
  category: TableCategory
  tournamentFiltered: boolean
}) {
  const [sortKey, setSortKey]   = useState<SortKey>(DEFAULT_SORT[category])
  const [sortDesc, setSortDesc] = useState(true)

  const columns = COLUMNS[category]

  // Within a specific tournament, "matches" (squad appearances) can include
  // players who never actually got an innings in that department — a
  // batting-only player is still "in" every match for the bowling table's
  // matches count, for instance. Scoped to a single tournament this reads as
  // noise (Avg/S-R/Econ all blank for them), so they're pulled out of the
  // sortable table and named below it instead, mirroring the "Did not bat"
  // pattern used on individual match scorecards (see ScorecardTables.tsx).
  // Left alone for the all-tournaments career view — there, showing every
  // rostered player regardless of innings count is the expected behaviour.
  const zeroInningsFilter: ((r: LeaderboardRow) => boolean) | null =
    tournamentFiltered && category === 'batting' ? r => r.stats.battingInnings === 0
    : tournamentFiltered && category === 'bowling' ? r => r.stats.bowlingInnings === 0
    : null

  const excludedRows = zeroInningsFilter ? rows.filter(zeroInningsFilter) : []
  const preFilterRows = zeroInningsFilter ? rows.filter(r => !zeroInningsFilter(r)) : rows

  // Fielding is opportunistic, not an innings you either get or don't — no
  // "did not field" callout to match, just a plain filter, always applied
  // (not just when tournament-scoped): a player with zero catches/run
  // outs/stumpings for the current filter adds nothing to this table.
  const visibleRows = category === 'fielding' ? preFilterRows.filter(r => dismissals(r.stats) >= 1) : preFilterRows

  const sorted = useMemo(() => {
    return [...visibleRows].sort((a, b) => {
      const av = statValue(a, sortKey)
      const bv = statValue(b, sortKey)
      if (av == null && bv == null) return 0
      if (av == null) return 1  // nulls always sink to the bottom regardless of direction
      if (bv == null) return -1
      return sortDesc ? bv - av : av - bv
    })
  }, [visibleRows, sortKey, sortDesc])

  function handleSort(key: SortKey) {
    if (key === sortKey) { setSortDesc(d => !d); return }
    setSortKey(key)
    setSortDesc(true)
  }

  return (
    <div className="bg-ink-3 border border-ink-5 rounded overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr className="border-b border-ink-5 bg-ink-4">
              <th className="font-rajdhani text-[10px] font-bold tracking-[2px] uppercase text-zinc-600 px-4 py-2.5 text-left whitespace-nowrap">#</th>
              <th className="font-rajdhani text-[10px] font-bold tracking-[2px] uppercase text-zinc-600 px-4 py-2.5 text-left whitespace-nowrap">Player</th>
              {columns.map(col => (
                <th key={col.key}
                  onClick={() => handleSort(col.key)}
                  className={`font-rajdhani text-[10px] font-bold tracking-[2px] uppercase px-4 py-2.5 text-left whitespace-nowrap cursor-pointer select-none transition-colors
                    ${sortKey === col.key ? 'text-gold' : 'text-zinc-600 hover:text-zinc-400'}`}>
                  {col.label}{sortKey === col.key ? (sortDesc ? ' ↓' : ' ↑') : ''}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {sorted.length === 0 && (
              <tr><td colSpan={2 + columns.length} className="px-4 py-8 text-center font-rajdhani text-zinc-600 text-sm">No stats for this filter yet.</td></tr>
            )}
            {sorted.map((row, i) => (
              <tr key={row.playerId} className="border-b border-ink-4 hover:bg-ink-4 transition-colors">
                <td className="px-4 py-3 font-cinzel text-sm text-zinc-500">{i + 1}</td>
                <td className="px-4 py-3 font-rajdhani text-sm text-parchment">
                  <PlayerNameLink name={row.playerName} playerId={row.playerId} cricHeroesUrl={row.cricheroesUrl} />
                </td>
                {columns.map(col => (
                  <td key={col.key}
                    className={`px-4 py-3 font-rajdhani text-sm ${sortKey === col.key ? 'text-gold font-bold' : 'text-zinc-400'}`}>
                    {formatStatValue(statValue(row, col.key), col.key)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {excludedRows.length > 0 && (
        <p className="px-4 py-2.5 border-t border-ink-5 font-rajdhani text-xs text-zinc-500 flex flex-wrap items-baseline gap-x-1">
          <span className="text-zinc-600">{category === 'batting' ? 'Did not bat:' : 'Did not bowl:'}</span>
          {excludedRows.map((row, i) => (
            <span key={row.playerId}>
              <PlayerNameLink name={row.playerName} playerId={row.playerId} cricHeroesUrl={row.cricheroesUrl} />
              {i < excludedRows.length - 1 ? ',' : ''}
            </span>
          ))}
        </p>
      )}
    </div>
  )
}
