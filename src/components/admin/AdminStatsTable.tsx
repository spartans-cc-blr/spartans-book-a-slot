'use client'
// Sortable performance table + client-side CSV export for /admin/stats.
// Rows arrive already filtered by year/tournament (server-side, see
// src/app/admin/stats/page.tsx) and already authorized — this component
// only re-sorts and re-formats what it was handed. It never fetches
// anything itself, so it cannot become an unauthenticated data-export path.

import { useMemo, useState } from 'react'
import { PlayerNameLink } from '@/lib/playerLink'
import type { LeaderboardRow } from '@/types'
import type { AdminStatsCategory } from './AdminStatsFilters'

type SortKey = 'matches' | 'runs' | 'battingAverage' | 'strikeRate' | 'wickets' | 'economy'
  | 'catches' | 'runOuts' | 'stumpings' | 'fielding' | 'mvpPoints'

function fieldingScore(row: LeaderboardRow): number {
  return row.stats.catches + row.stats.runOuts + row.stats.stumpings
}

function sortValue(row: LeaderboardRow, key: SortKey): number | null {
  if (key === 'fielding') return fieldingScore(row)
  if (key === 'matches')  return row.stats.matches
  return (row.stats as any)[key] as number | null
}

const DEFAULT_SORT: Record<AdminStatsCategory, SortKey> = {
  runs: 'runs', wickets: 'wickets', fielding: 'fielding', mvp: 'mvpPoints',
}

function csvEscape(v: string | number): string {
  const s = String(v)
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}

export function AdminStatsTable({ rows, category }: { rows: LeaderboardRow[]; category: AdminStatsCategory }) {
  const [sortKey, setSortKey] = useState<SortKey>(DEFAULT_SORT[category])
  const [sortDesc, setSortDesc] = useState(true)

  const sorted = useMemo(() => {
    return [...rows].sort((a, b) => {
      const av = sortValue(a, sortKey)
      const bv = sortValue(b, sortKey)
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

  function exportCsv() {
    const header = [
      'Player', 'Matches', 'Runs', 'Average', 'Strike Rate', 'Wickets', 'Economy',
      'Catches', 'Run Outs', 'Stumpings', 'MVP Points',
    ]
    const lines = [header.join(',')]
    for (const row of sorted) {
      lines.push([
        csvEscape(row.playerName),
        row.stats.matches,
        row.stats.runs,
        row.stats.battingAverage ?? '',
        row.stats.strikeRate ?? '',
        row.stats.wickets,
        row.stats.economy ?? '',
        row.stats.catches,
        row.stats.runOuts,
        row.stats.stumpings,
        row.stats.mvpPoints,
      ].map(csvEscape).join(','))
    }
    const blob = new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `spartans-performance-${category}-${new Date().toISOString().split('T')[0]}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  const columns: { key: SortKey; label: string }[] = [
    { key: 'matches', label: 'M' },
    { key: 'runs', label: 'Runs' },
    { key: 'battingAverage', label: 'Avg' },
    { key: 'strikeRate', label: 'S/R' },
    { key: 'wickets', label: 'Wkts' },
    { key: 'economy', label: 'Econ' },
    { key: 'catches', label: 'Ct' },
    { key: 'runOuts', label: 'RO' },
    { key: 'stumpings', label: 'St' },
    { key: 'mvpPoints', label: 'MVP' },
  ]

  return (
    <div>
      <div className="flex justify-end mb-3">
        <button onClick={exportCsv}
          className="font-rajdhani text-xs font-bold tracking-wide border border-gold-dim text-gold px-3 py-1.5 rounded hover:bg-gold/10 transition-colors">
          ⬇ Export CSV
        </button>
      </div>

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
                  <td className="px-4 py-3 font-rajdhani text-sm text-zinc-400">{row.stats.matches}</td>
                  <td className="px-4 py-3 font-rajdhani text-sm text-zinc-400">{row.stats.runs}</td>
                  <td className="px-4 py-3 font-rajdhani text-sm text-zinc-400">{row.stats.battingAverage ?? '—'}</td>
                  <td className="px-4 py-3 font-rajdhani text-sm text-zinc-400">{row.stats.strikeRate ?? '—'}</td>
                  <td className="px-4 py-3 font-rajdhani text-sm text-zinc-400">{row.stats.wickets}</td>
                  <td className="px-4 py-3 font-rajdhani text-sm text-zinc-400">{row.stats.economy ?? '—'}</td>
                  <td className="px-4 py-3 font-rajdhani text-sm text-zinc-400">{row.stats.catches}</td>
                  <td className="px-4 py-3 font-rajdhani text-sm text-zinc-400">{row.stats.runOuts}</td>
                  <td className="px-4 py-3 font-rajdhani text-sm text-zinc-400">{row.stats.stumpings}</td>
                  <td className="px-4 py-3 font-rajdhani text-sm text-zinc-400">{row.stats.mvpPoints}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
