'use client'

import { PlayerNameLink } from '@/lib/playerLink'

interface SquadRef {
  player_id:      string
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

// Prefers player_id (set once a scorecard name has been reconciled — see
// src/lib/playerIdentityResolution.ts) over the fragile case-insensitive
// name string match, which stays as a fallback for rows synced before
// reconciliation and degrades gracefully rather than showing no link at all.
function findCricHeroesUrl(row: any, name: string, squad?: SquadRef[]): string | null {
  if (!squad) return null
  const playerId = pickField(row, ['player_id'])
  if (playerId) {
    const byId = squad.find(p => p.player_id === playerId)
    if (byId) return byId.cricheroes_url ?? null
  }
  const byName = squad.find(p => p.player_name?.trim().toLowerCase() === name?.trim().toLowerCase())
  return byName?.cricheroes_url ?? null
}

// Same resolution order as findCricHeroesUrl — only ever resolves to a Hub
// player_id for someone in this booking's own squad. Opponent players and
// unreconciled scorecard rows return null and PlayerNameLink falls back to
// the CricHeroes link above instead.
function findPlayerId(row: any, name: string, squad?: SquadRef[]): string | null {
  if (!squad) return null
  const playerId = pickField(row, ['player_id'])
  if (playerId) {
    const byId = squad.find(p => p.player_id === playerId)
    if (byId) return byId.player_id
  }
  const byName = squad.find(p => p.player_name?.trim().toLowerCase() === name?.trim().toLowerCase())
  return byName?.player_id ?? null
}

// catches + caught_behind (keeper catches are stored separately from
// fielder catches in the analytics DB, but both display as a plain "catch"
// on a scorecard) + stumpings + run_outs (already the total run-outs
// credited to this player, regardless of thrower/collector role).
function fieldingTotal(row: any): number {
  return num(row, ['catches']) + num(row, ['caught_behind']) + num(row, ['stumpings']) + num(row, ['run_outs'])
}

export function ScorecardTables({
  batting, bowling, fielding, teamList, squad,
}: {
  batting: any[]
  bowling: any[]
  fielding?: any[]
  teamList?: any[]
  squad?: SquadRef[]
}) {
  // Players who didn't bat/bowl get a zero-filled row (dismissal_method:
  // 'did_not_bat' for batting; every bowling field 0 for a player who never
  // bowled) so every squad member has a row in each table server-side —
  // filtered out here since they're just clutter in the readout. Balls
  // faced (not runs) is the right batting signal: a player can legitimately
  // score 0 off a ball they actually faced.
  const battingRows = batting.filter(row =>
    pickField(row, ['dismissal_method']) !== 'did_not_bat' && num(row, ['balls', 'balls_faced']) > 0
  )
  const bowlingRows = bowling.filter(row => num(row, ['overs', 'overs_bowled']) > 0)

  // Most players in a squad had zero fielding involvement in a given match —
  // only show rows with at least one dismissal, same spirit as filtering
  // out did-not-bat / did-not-bowl rows above.
  const fieldingRows = (fielding ?? []).filter(row => fieldingTotal(row) > 0)

  const topBatRuns  = battingRows.reduce((max, r) => Math.max(max, num(r, ['runs', 'total_runs'])), 0)
  const topBowlWkts = bowlingRows.reduce((max, r) => Math.max(max, num(r, ['wickets', 'wickets_taken'])), 0)
  const topFieldingTotal = fieldingRows.reduce((max, r) => Math.max(max, fieldingTotal(r)), 0)

  // The batting table filters out players who didn't bat, so on its own it
  // can't answer "who else was in the squad that day" — team_list (the full
  // playing XI from CricHeroes) fills that gap, mirroring the "Did not bat"
  // line CricHeroes itself shows below the scorecard.
  const battedNames = new Set(
    battingRows.map(row => (pickField(row, ['player_name', 'name']) ?? '').trim().toLowerCase())
  )
  const seenDidNotBat = new Set<string>()
  const didNotBatRows = (teamList ?? [])
    .filter(row => {
      const name = pickField(row, ['player_name', 'name'])
      if (!name) return false
      const key = name.trim().toLowerCase()
      if (battedNames.has(key) || seenDidNotBat.has(key)) return false
      seenDidNotBat.add(key)
      return true
    })

  return (
    <div className="space-y-4">
      <div>
        <p className="font-rajdhani text-xs font-bold tracking-widest uppercase text-zinc-500 mb-2">Batting</p>
        <div className="overflow-x-auto">
          <table className="w-full table-fixed text-xs font-rajdhani">
            <colgroup>
              <col className="w-[50.4%]" />
              <col className="w-[9%]" />
              <col className="w-[9%]" />
              <col className="w-[9%]" />
              <col className="w-[9%]" />
              <col className="w-[13.6%]" />
            </colgroup>
            <thead>
              <tr className="text-zinc-600 border-b border-ink-5">
                <th className="text-center py-1 pr-2">Player</th>
                <th className="text-center px-1">R</th>
                <th className="text-center px-1">B</th>
                <th className="text-center px-1">4s</th>
                <th className="text-center px-1">6s</th>
                <th className="text-right pl-1">SR</th>
              </tr>
            </thead>
            <tbody>
              {battingRows.map((row, i) => {
                const name = pickField(row, ['player_name', 'name']) ?? 'Unknown'
                const runs = num(row, ['runs', 'total_runs'])
                const isTop = topBatRuns > 0 && runs === topBatRuns
                return (
                  <tr key={i} className={`border-b border-ink-5/50 ${isTop ? 'text-gold font-semibold' : 'text-zinc-300'}`}>
                    <td className="text-right py-1 pr-2">
                      <PlayerNameLink name={name} playerId={findPlayerId(row, name, squad)} cricHeroesUrl={findCricHeroesUrl(row, name, squad)} />
                    </td>
                    <td className="text-center px-1">{runs}</td>
                    <td className="text-center px-1">{num(row, ['balls', 'balls_faced'])}</td>
                    <td className="text-center px-1">{num(row, ['fours', '4s'])}</td>
                    <td className="text-center px-1">{num(row, ['sixes', '6s'])}</td>
                    <td className="text-right pl-1">{pickField(row, ['strike_rate', 'sr']) ?? '—'}</td>
                  </tr>
                )
              })}
              {battingRows.length === 0 && (
                <tr><td colSpan={6} className="text-zinc-600 py-2">No batting data.</td></tr>
              )}
            </tbody>
          </table>
        </div>
        {didNotBatRows.length > 0 && (
          <p className="font-rajdhani text-xs text-zinc-500 mt-2 flex flex-wrap items-baseline gap-x-1">
            <span className="text-zinc-600">Did not bat:</span>
            {didNotBatRows.map((row, i) => {
              const name = pickField(row, ['player_name', 'name'])
              return (
                <span key={name}>
                  <PlayerNameLink name={name} playerId={findPlayerId(row, name, squad)} cricHeroesUrl={findCricHeroesUrl(row, name, squad)} />
                  {i < didNotBatRows.length - 1 ? ',' : ''}
                </span>
              )
            })}
          </p>
        )}
      </div>

      <div>
        <p className="font-rajdhani text-xs font-bold tracking-widest uppercase text-zinc-500 mb-2">Bowling</p>
        <div className="overflow-x-auto">
          <table className="w-full table-fixed text-xs font-rajdhani">
            <colgroup>
              <col className="w-[50.4%]" />
              <col className="w-[9%]" />
              <col className="w-[9%]" />
              <col className="w-[9%]" />
              <col className="w-[9%]" />
              <col className="w-[13.6%]" />
            </colgroup>
            <thead>
              <tr className="text-zinc-600 border-b border-ink-5">
                <th className="text-center py-1 pr-2">Player</th>
                <th className="text-center px-1">O</th>
                <th className="text-center px-1">Dots</th>
                <th className="text-center px-1">R</th>
                <th className="text-center px-1">W</th>
                <th className="text-right pl-1">Eco</th>
              </tr>
            </thead>
            <tbody>
              {bowlingRows.map((row, i) => {
                const name = pickField(row, ['player_name', 'name']) ?? 'Unknown'
                const wkts = num(row, ['wickets', 'wickets_taken'])
                const isTop = topBowlWkts > 0 && wkts === topBowlWkts
                return (
                  <tr key={i} className={`border-b border-ink-5/50 ${isTop ? 'text-gold font-semibold' : 'text-zinc-300'}`}>
                    <td className="text-right py-1 pr-2">
                      <PlayerNameLink name={name} playerId={findPlayerId(row, name, squad)} cricHeroesUrl={findCricHeroesUrl(row, name, squad)} />
                    </td>
                    <td className="text-center px-1">{pickField(row, ['overs', 'overs_bowled']) ?? '—'}</td>
                    <td className="text-center px-1">{num(row, ['dots'])}</td>
                    <td className="text-center px-1">{num(row, ['runs', 'runs_conceded'])}</td>
                    <td className="text-center px-1">{wkts}</td>
                    <td className="text-right pl-1">{pickField(row, ['economy', 'eco']) ?? '—'}</td>
                  </tr>
                )
              })}
              {bowlingRows.length === 0 && (
                <tr><td colSpan={6} className="text-zinc-600 py-2">No bowling data.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {fieldingRows.length > 0 && (
        <div>
          <p className="font-rajdhani text-xs font-bold tracking-widest uppercase text-zinc-500 mb-2">Fielding</p>
          <div className="overflow-x-auto">
            <table className="w-full table-fixed text-xs font-rajdhani">
              <colgroup>
                <col className="w-[50.4%]" />
                <col className="w-[12%]" />
                <col className="w-[12%]" />
                <col className="w-[12%]" />
                <col className="w-[13.6%]" />
              </colgroup>
              <thead>
                <tr className="text-zinc-600 border-b border-ink-5">
                  <th className="text-center py-1 pr-2">Player</th>
                  <th className="text-center px-1">Ct</th>
                  <th className="text-center px-1">St</th>
                  <th className="text-center px-1">RO</th>
                  <th className="text-right pl-1">Total</th>
                </tr>
              </thead>
              <tbody>
                {fieldingRows.map((row, i) => {
                  const name = pickField(row, ['player_name', 'name']) ?? 'Unknown'
                  const catches = num(row, ['catches']) + num(row, ['caught_behind'])
                  const stumpings = num(row, ['stumpings'])
                  const runOuts = num(row, ['run_outs'])
                  const total = fieldingTotal(row)
                  const isTop = topFieldingTotal > 0 && total === topFieldingTotal
                  return (
                    <tr key={i} className={`border-b border-ink-5/50 ${isTop ? 'text-gold font-semibold' : 'text-zinc-300'}`}>
                      <td className="text-right py-1 pr-2">
                        <PlayerNameLink name={name} playerId={findPlayerId(row, name, squad)} cricHeroesUrl={findCricHeroesUrl(row, name, squad)} />
                      </td>
                      <td className="text-center px-1">{catches}</td>
                      <td className="text-center px-1">{stumpings}</td>
                      <td className="text-center px-1">{runOuts}</td>
                      <td className="text-right pl-1">{total}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}
