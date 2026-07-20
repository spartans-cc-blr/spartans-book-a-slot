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
  | 'matches' | 'runs' | 'battingAverage' | 'strikeRate'
  | 'wickets' | 'economy' | 'bowlingAverage' | 'bowlingStrikeRate'
  | 'catches' | 'runOuts' | 'stumpings' | 'dismissals' | 'mvpPoints'

// Bowling average/strike rate aren't precomputed on PlayerStatsTotals (only
// the batting versions are) — derived here from the fields that are.
function bowlingAverage(s: PlayerStatsTotals): number | null {
  return s.wickets > 0 ? Math.round((s.runsConceded / s.wickets) * 100) / 100 : null
}
function bowlingStrikeRate(s: PlayerStatsTotals): number | null {
  return s.wickets > 0 ? Math.round((s.ballsBowled / s.wickets) * 100) / 100 : null
}
// Combined fielding dismissals — catches, run outs, and stumpings all count
// toward MVP, so the MVP tab shows one rolled-up figure rather than catches
// alone (the Fielding tab still breaks the three out individually).
function dismissals(s: PlayerStatsTotals): number {
  return s.catches + s.runOuts + s.stumpings
}

function statValue(row: LeaderboardRow, key: SortKey): number | null {
  if (key === 'bowlingAverage')    return bowlingAverage(row.stats)
  if (key === 'bowlingStrikeRate') return bowlingStrikeRate(row.stats)
  if (key === 'dismissals')        return dismissals(row.stats)
  return (row.stats as any)[key] as number | null
}

const COLUMNS: Record<TableCategory, { key: SortKey; label: string }[]> = {
  batting: [
    { key: 'matches', label: 'M' },
    { key: 'runs', label: 'Runs' },
    { key: 'battingAverage', label: 'Avg' },
    { key: 'strikeRate', label: 'S/R' },
  ],
  bowling: [
    { key: 'matches', label: 'M' },
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

export function LeaderboardTable({ rows, category }: { rows: LeaderboardRow[]; category: TableCategory }) {
  const [sortKey, setSortKey]   = useState<SortKey>(DEFAULT_SORT[category])
  const [sortDesc, setSortDesc] = useState(true)

  const columns = COLUMNS[category]

  const sorted = useMemo(() => {
    return [...rows].sort((a, b) => {
      const av = statValue(a, sortKey)
      const bv = statValue(b, sortKey)
      if (av == null && bv == null) return 0
      if (av == null) return 1  // nulls always sink to the bottom regardless of direction
      if (bv == null) return -1
      return sortDesc ? bv - av : av - bv
    })
  }, [rows, sortKey, sortDesc])

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
                    {statValue(row, col.key) ?? '—'}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
