'use client'

import { PlayerNameLink } from '@/lib/playerLink'

interface SquadRef {
  player_name:    string
  cricheroes_url: string | null
}

// Analytics DB field names aren't part of this repo's schema, so every
// lookup tries a couple of likely keys rather than assuming one exact shape.
function pickField(row: any, keys: string[]): any {
  for (const k of keys) if (row?.[k] != null) return row[k]
  return null
}

function num(row: any, keys: string[]): number {
  const v = pickField(row, keys)
  return v != null ? Number(v) : 0
}

function findCricHeroesUrl(name: string, squad?: SquadRef[]): string | null {
  if (!squad) return null
  const match = squad.find(p => p.player_name?.trim().toLowerCase() === name?.trim().toLowerCase())
  return match?.cricheroes_url ?? null
}

export function ScorecardTables({
  batting, bowling, squad,
}: {
  batting: any[]
  bowling: any[]
  squad?: SquadRef[]
}) {
  const topBatRuns  = batting.reduce((max, r) => Math.max(max, num(r, ['runs', 'total_runs'])), 0)
  const topBowlWkts = bowling.reduce((max, r) => Math.max(max, num(r, ['wickets', 'wickets_taken'])), 0)

  return (
    <div className="space-y-4">
      <div>
        <p className="font-rajdhani text-xs font-bold tracking-widest uppercase text-zinc-500 mb-2">Batting</p>
        <div className="overflow-x-auto">
          <table className="w-full text-xs font-rajdhani">
            <thead>
              <tr className="text-zinc-600 border-b border-ink-5">
                <th className="text-left py-1 pr-2">Player</th>
                <th className="text-right px-1">R</th>
                <th className="text-right px-1">B</th>
                <th className="text-right px-1">4s</th>
                <th className="text-right px-1">6s</th>
                <th className="text-right pl-1">SR</th>
              </tr>
            </thead>
            <tbody>
              {batting.map((row, i) => {
                const name = pickField(row, ['player_name', 'name']) ?? 'Unknown'
                const runs = num(row, ['runs', 'total_runs'])
                const isTop = topBatRuns > 0 && runs === topBatRuns
                return (
                  <tr key={i} className={`border-b border-ink-5/50 ${isTop ? 'text-gold font-semibold' : 'text-zinc-300'}`}>
                    <td className="py-1 pr-2">
                      <PlayerNameLink name={name} cricHeroesUrl={findCricHeroesUrl(name, squad)} />
                    </td>
                    <td className="text-right px-1">{runs}</td>
                    <td className="text-right px-1">{num(row, ['balls', 'balls_faced'])}</td>
                    <td className="text-right px-1">{num(row, ['fours', '4s'])}</td>
                    <td className="text-right px-1">{num(row, ['sixes', '6s'])}</td>
                    <td className="text-right pl-1">{pickField(row, ['strike_rate', 'sr']) ?? '—'}</td>
                  </tr>
                )
              })}
              {batting.length === 0 && (
                <tr><td colSpan={6} className="text-zinc-600 py-2">No batting data.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      <div>
        <p className="font-rajdhani text-xs font-bold tracking-widest uppercase text-zinc-500 mb-2">Bowling</p>
        <div className="overflow-x-auto">
          <table className="w-full text-xs font-rajdhani">
            <thead>
              <tr className="text-zinc-600 border-b border-ink-5">
                <th className="text-left py-1 pr-2">Player</th>
                <th className="text-right px-1">O</th>
                <th className="text-right px-1">W</th>
                <th className="text-right px-1">R</th>
                <th className="text-right pl-1">Eco</th>
              </tr>
            </thead>
            <tbody>
              {bowling.map((row, i) => {
                const name = pickField(row, ['player_name', 'name']) ?? 'Unknown'
                const wkts = num(row, ['wickets', 'wickets_taken'])
                const isTop = topBowlWkts > 0 && wkts === topBowlWkts
                return (
                  <tr key={i} className={`border-b border-ink-5/50 ${isTop ? 'text-gold font-semibold' : 'text-zinc-300'}`}>
                    <td className="py-1 pr-2">
                      <PlayerNameLink name={name} cricHeroesUrl={findCricHeroesUrl(name, squad)} />
                    </td>
                    <td className="text-right px-1">{pickField(row, ['overs', 'overs_bowled']) ?? '—'}</td>
                    <td className="text-right px-1">{wkts}</td>
                    <td className="text-right px-1">{num(row, ['runs', 'runs_conceded'])}</td>
                    <td className="text-right pl-1">{pickField(row, ['economy', 'eco']) ?? '—'}</td>
                  </tr>
                )
              })}
              {bowling.length === 0 && (
                <tr><td colSpan={5} className="text-zinc-600 py-2">No bowling data.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
