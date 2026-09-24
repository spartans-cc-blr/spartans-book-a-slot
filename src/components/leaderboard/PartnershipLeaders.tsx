'use client'
// /leaderboard → Detailed → Partnerships. Three horizontal bar charts, all
// scoped by the same Year/Tournament/Ground/Format filters as every other
// Detailed tab (getPartnershipLeaders() in src/lib/playerStats.ts):
//
//   1. Top 10 partnerships for any wicket
//   2. Highest partnership for each wicket (1st–10th)
//   3. Top 5 pairs by aggregate runs across every innings
//
// Same bar treatment as the per-match Partnerships chart in
// ScorecardTables.tsx and BattingPositionLeaders.tsx: the two batters'
// names sit inside the bar, the run value sits at the end of the bar in a
// fixed-width column (a short bar would otherwise squeeze it out). Full
// names rather than ScorecardTables' first-name-only labels — club-wide,
// two "Siva"s are ambiguous in a way they never are within one scorecard.
// See features/partnerships.md §10.

import Link from 'next/link'
import { PlayerNameLink } from '@/lib/playerLink'
import type { PartnershipLeaderPlayer, PartnershipLeaders, PartnershipRecord } from '@/types'

function ordinal(n: number): string {
  const s = ['th', 'st', 'nd', 'rd']
  const v = n % 100
  return `${n}${s[(v - 20) % 10] || s[v] || s[0]}`
}

function shortDate(iso: string | null): string | null {
  if (!iso) return null
  const d = new Date(`${iso}T00:00:00`)
  return d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })
}

function Names({ players }: { players: [PartnershipLeaderPlayer, PartnershipLeaderPlayer] }) {
  return (
    <span className="font-rajdhani text-xs font-semibold text-[var(--stats-text)] dark:text-parchment truncate">
      {players.map((p, i) => (
        <span key={i}>
          {i > 0 && ' & '}
          <PlayerNameLink name={p.playerName} playerId={p.playerId} cricHeroesUrl={p.cricheroesUrl} />
        </span>
      ))}
    </span>
  )
}

function Bar({ label, players, pct, value, sub, caption }: {
  label: string
  players: [PartnershipLeaderPlayer, PartnershipLeaderPlayer]
  pct: number
  value: string
  sub?: string | null
  caption?: React.ReactNode
}) {
  return (
    <div>
      <div className="flex items-center gap-2">
        <span className="font-cinzel text-xs text-[var(--stats-text-muted)] dark:text-zinc-500 w-9 flex-shrink-0 text-right">{label}</span>
        <div className="flex-1 min-w-0 relative h-7 bg-[var(--stats-row-bg)] dark:bg-ink-4 rounded overflow-hidden">
          <div className="absolute inset-y-0 left-0 bg-gold/40 rounded" style={{ width: `${pct}%` }} />
          <div className="absolute inset-0 flex items-center px-2.5 min-w-0">
            <Names players={players} />
          </div>
        </div>
        <span className="w-16 flex-shrink-0 text-right leading-tight">
          <span className="font-rajdhani text-sm font-bold text-[var(--stats-accent)] dark:text-gold">{value}</span>
          {sub && <span className="block font-rajdhani text-[11px] text-[var(--stats-text-muted)] dark:text-zinc-500">{sub}</span>}
        </span>
      </div>
      {caption && (
        <div className="pl-11 pr-[4.5rem] mt-0.5 font-rajdhani text-[11px] text-[var(--stats-text-muted)] dark:text-zinc-500 truncate">{caption}</div>
      )}
    </div>
  )
}

function pctOf(value: number, max: number): number {
  return max > 0 ? Math.max((value / max) * 100, 6) : 6
}

function MatchCaption({ r, showWicket }: { r: PartnershipRecord; showWicket: boolean }) {
  const parts = [
    showWicket ? `${ordinal(r.wicketNumber)} wkt` : null,
    r.opponentName ? `vs ${r.opponentName}` : null,
    shortDate(r.gameDate),
  ].filter(Boolean).join(' · ')
  return r.bookingId
    ? <Link href={`/matches/history/${r.bookingId}`} className="hover:text-[var(--stats-accent)] dark:hover:text-gold underline decoration-dotted underline-offset-2">{parts}</Link>
    : <>{parts}</>
}

function runsLabel(runs: number, unbroken: boolean): string {
  return `${runs}${unbroken ? '*' : ''}`
}

function Card({ title, subtitle, children }: { title: string; subtitle: string; children: React.ReactNode }) {
  return (
    <div className="bg-[var(--stats-card-bg)] dark:bg-ink-3 border border-[var(--stats-card-border)] dark:border-ink-5 rounded p-4 mb-4">
      <h3 className="font-cinzel text-sm text-[var(--stats-accent)] dark:text-gold font-semibold mb-1">{title}</h3>
      <p className="font-rajdhani text-xs text-[var(--stats-text-muted)] dark:text-zinc-500 mb-4">{subtitle}</p>
      <div className="space-y-2.5">{children}</div>
    </div>
  )
}

export function PartnershipLeadersView({ leaders }: { leaders: PartnershipLeaders }) {
  if (leaders.top.length === 0) {
    return (
      <div className="bg-[var(--stats-card-bg)] dark:bg-ink-3 border border-[var(--stats-card-border)] dark:border-ink-5 rounded p-6 text-center font-rajdhani text-sm text-[var(--stats-text-muted)] dark:text-zinc-500">
        No partnership data for this filter yet — partnerships appear once a match&apos;s Fall of Wickets has been synced.
      </div>
    )
  }

  const topMax = leaders.top[0]?.runs ?? 0
  const wicketMax = Math.max(0, ...leaders.byWicket.map(r => r.runs))
  const pairMax = leaders.pairs[0]?.runs ?? 0

  return (
    <div>
      <Card title={`Top ${leaders.top.length} Partnerships`} subtitle="Highest stands for any wicket, for the current filter. * = unbroken.">
        {leaders.top.map((r, i) => (
          <Bar
            key={`${r.matchId}-${r.wicketNumber}`}
            label={`${i + 1}`}
            players={r.players}
            pct={pctOf(r.runs, topMax)}
            value={runsLabel(r.runs, r.unbroken)}
            sub={r.balls != null ? `(${r.balls})` : null}
            caption={<MatchCaption r={r} showWicket />}
          />
        ))}
      </Card>

      <Card title="Highest Partnership by Wicket" subtitle="Best stand for each wicket, 1st to 10th.">
        {leaders.byWicket.map(r => (
          <Bar
            key={r.wicketNumber}
            label={ordinal(r.wicketNumber)}
            players={r.players}
            pct={pctOf(r.runs, wicketMax)}
            value={runsLabel(r.runs, r.unbroken)}
            sub={r.balls != null ? `(${r.balls})` : null}
            caption={<MatchCaption r={r} showWicket={false} />}
          />
        ))}
      </Card>

      {leaders.pairs.length > 0 && (
        <Card title={`Top ${leaders.pairs.length} Batting Pairs`} subtitle="Most runs added together by the same two batters, across every innings.">
          {leaders.pairs.map((p, i) => (
            <Bar
              key={i}
              label={`${i + 1}`}
              players={p.players}
              pct={pctOf(p.runs, pairMax)}
              value={`${p.runs}`}
              caption={`${p.innings} inn · best ${runsLabel(p.best, p.bestUnbroken)}`}
            />
          ))}
        </Card>
      )}
    </div>
  )
}
