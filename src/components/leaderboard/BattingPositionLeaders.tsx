'use client'
// Horizontal bar chart above LeaderboardTable's Detailed → Bat tab —
// whoever leads runs at each batting position (1-12), for the currently
// applied Year/Tournament/Ground/Format filters (same scope as the table
// below it and every other Detailed card on this page). Tapping a bar
// opens a "Top 3 at Position N" modal (BattingPositionLeader.topThree) —
// no click-to-filter of the table below, unlike the per-player chart on
// /players/[id]/stats: this table already aggregates a player's whole
// season rather than per-innings rows, so there's no natural "filter the
// table to this position" action to wire up. See features/leaderboard.md.
//
// Row is a clickable <div role="button">, not a real <button> — it wraps
// PlayerNameLink, a genuine nested <a>, and interactive elements can't
// nest validly in HTML. Same stopPropagation convention used everywhere
// else in this app (ClickableRow in InningsRow.tsx, CaptainsCornerGrid's
// SelectablePlayerRow, etc.) — PlayerNameLink's own onClick stops
// propagation, so tapping a name still navigates instead of opening the
// modal.

import { useState } from 'react'
import { Dialog } from '@/components/ui/Dialog'
import { PlayerNameLink } from '@/lib/playerLink'
import type { BattingPositionLeader } from '@/types'

export function BattingPositionLeaders({ leaders }: { leaders: BattingPositionLeader[] }) {
  const maxRuns = Math.max(...leaders.map(l => l.runs), 1)
  const [openPosition, setOpenPosition] = useState<number | null>(null)
  const active = leaders.find(l => l.position === openPosition) ?? null

  return (
    <div className="bg-ink-3 border border-ink-5 rounded p-4 mb-4">
      <h3 className="font-cinzel text-sm text-gold font-semibold mb-1">Runs by Batting Position</h3>
      <p className="font-rajdhani text-xs text-zinc-500 mb-4">
        Leading run-scorer at each position, for the current filter. Tap a bar for the top 3.
      </p>
      <div className="space-y-2">
        {leaders.map(l => {
          const pct = Math.max((l.runs / maxRuns) * 100, 6)
          return (
            <div
              key={l.position}
              role="button"
              tabIndex={0}
              aria-label={`Show top 3 run-scorers at batting position ${l.position}`}
              onClick={() => setOpenPosition(l.position)}
              onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') setOpenPosition(l.position) }}
              className="flex items-center gap-2 cursor-pointer group"
            >
              <span className="font-cinzel text-xs text-zinc-500 w-7 flex-shrink-0 text-right">{l.position}</span>
              <div className="flex-1 relative h-7 bg-ink-4 group-hover:bg-ink-5 rounded overflow-hidden transition-colors">
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

      <Dialog
        open={active != null}
        onClose={() => setOpenPosition(null)}
        title={active ? `Top 3 — Position ${active.position}` : undefined}
      >
        {active && (
          <div className="space-y-4">
            {active.topThree.map(entry => (
              <div key={entry.rank} className="flex items-start justify-between gap-3">
                <div className="flex items-start gap-2.5">
                  <span className="font-cinzel text-sm font-bold text-gold w-5 flex-shrink-0">{entry.rank}</span>
                  <div className="font-rajdhani text-sm text-parchment leading-relaxed">
                    {entry.players.map(p => (
                      <div key={p.playerId}>
                        <PlayerNameLink name={p.playerName} playerId={p.playerId} cricHeroesUrl={p.cricheroesUrl} />
                      </div>
                    ))}
                  </div>
                </div>
                <span className="font-rajdhani text-sm text-zinc-400 flex-shrink-0 text-right whitespace-nowrap">
                  {entry.runs} runs · {entry.innings} inn
                </span>
              </div>
            ))}
          </div>
        )}
      </Dialog>
    </div>
  )
}
