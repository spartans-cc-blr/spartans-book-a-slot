// Horizontal bar chart above LeaderboardTable's Detailed → Bat tab —
// whoever leads runs at each batting position (1-12), for the currently
// applied Year/Tournament/Ground/Format filters (same scope as the table
// below it and every other Detailed card on this page). Pure display, no
// click-to-filter — unlike the per-player chart on /players/[id]/stats,
// this table already aggregates a player's whole season rather than
// per-innings rows, so there's no natural "filter the table to this
// position" action to wire up. See features/leaderboard.md.
//
// No 'use client' needed — nothing here is interactive.

import { PlayerNameLink } from '@/lib/playerLink'
import type { BattingPositionLeader } from '@/types'

export function BattingPositionLeaders({ leaders }: { leaders: BattingPositionLeader[] }) {
  const maxRuns = Math.max(...leaders.map(l => l.runs), 1)

  return (
    <div className="bg-ink-3 border border-ink-5 rounded p-4 mb-4">
      <h3 className="font-cinzel text-sm text-gold font-semibold mb-1">Runs by Batting Position</h3>
      <p className="font-rajdhani text-xs text-zinc-500 mb-4">Leading run-scorer at each position, for the current filter.</p>
      <div className="space-y-2">
        {leaders.map(l => {
          const pct = Math.max((l.runs / maxRuns) * 100, 6)
          return (
            <div key={l.position} className="flex items-center gap-2">
              <span className="font-cinzel text-xs text-zinc-500 w-7 flex-shrink-0 text-right">{l.position}</span>
              <div className="flex-1 relative h-7 bg-ink-4 rounded overflow-hidden">
                <div className="absolute inset-y-0 left-0 bg-gold/40 rounded" style={{ width: `${pct}%` }} />
                <div className="absolute inset-0 flex items-center justify-between gap-2 px-2.5">
                  <span className="font-rajdhani text-xs font-semibold text-parchment truncate">
                    {l.players.map((p, i) => (
                      <span key={p.playerId}>
                        {i > 0 && ', '}
                        <PlayerNameLink name={p.playerName} playerId={p.playerId} cricHeroesUrl={p.cricheroesUrl} />
                      </span>
                    ))}
                  </span>
                  <span className="font-rajdhani text-xs font-bold text-gold flex-shrink-0">{l.runs}</span>
                </div>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
