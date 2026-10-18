'use client'
// /leaderboard → Detailed → Breakthroughs. Opponent batting stands ended by
// Spartans bowlers, same scope/filters as every other Detailed tab
// (getBreakthroughLeaders() in src/lib/playerStats.ts). Two bar charts:
//   1. Most stands broken (with big breaks — 30+ run stands — and avg stand)
//   2. Biggest stands ended
// Same bar treatment as PartnershipLeaders.tsx. See features/partnerships.md §13.

import Link from 'next/link'
import { PlayerNameLink } from '@/lib/playerLink'
import type { BreakthroughLeaders, BreakthroughRecord, PartnershipLeaderPlayer } from '@/types'

function ordinal(n: number): string {
  const s = ['th', 'st', 'nd', 'rd']
  const v = n % 100
  return `${n}${s[(v - 20) % 10] || s[v] || s[0]}`
}

function shortDate(iso: string | null): string | null {
  if (!iso) return null
  return new Date(`${iso}T00:00:00`).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })
}

function pctOf(value: number, max: number): number {
  return max > 0 ? Math.max((value / max) * 100, 6) : 6
}

function Bar({ label, player, pct, value, sub, caption }: {
  label: string
  player: PartnershipLeaderPlayer
  pct: number
  value: string
  sub?: string | null
  caption?: React.ReactNode
}) {
  return (
    <div>
      <div className="flex items-center gap-2">
        <span className="font-cinzel text-xs text-[var(--stats-text-muted)] dark:text-zinc-500 w-6 flex-shrink-0 text-right">{label}</span>
        <div className="flex-1 min-w-0 relative h-7 bg-[var(--stats-row-bg)] dark:bg-ink-4 rounded overflow-hidden">
          <div className="absolute inset-y-0 left-0 bg-gold/40 rounded" style={{ width: `${pct}%` }} />
          <div className="absolute inset-0 flex items-center px-2.5 min-w-0">
            <span className="font-rajdhani text-xs font-semibold text-[var(--stats-text)] dark:text-parchment truncate">
              <PlayerNameLink name={player.playerName} playerId={player.playerId} cricHeroesUrl={player.cricheroesUrl} />
            </span>
          </div>
        </div>
        <span className="w-16 flex-shrink-0 text-right leading-tight">
          <span className="font-rajdhani text-sm font-bold text-[var(--stats-accent)] dark:text-gold">{value}</span>
          {sub && <span className="block font-rajdhani text-[11px] text-[var(--stats-text-muted)] dark:text-zinc-500">{sub}</span>}
        </span>
      </div>
      {caption && (
        <div className="pl-8 pr-[4.5rem] mt-0.5 font-rajdhani text-[11px] text-[var(--stats-text-muted)] dark:text-zinc-500 truncate">{caption}</div>
      )}
    </div>
  )
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

function RecordCaption({ r }: { r: BreakthroughRecord }) {
  const parts = [
    `${ordinal(r.wicketNumber)} wkt`,
    r.outBatter ? `got ${r.outBatter}${r.dismissalType ? ` (${r.dismissalType.replace(/_/g, ' ')})` : ''}` : null,
    r.opponentName ? `vs ${r.opponentName}` : null,
    shortDate(r.gameDate),
  ].filter(Boolean).join(' · ')
  return r.bookingId
    ? <Link href={`/matches/history/${r.bookingId}`} className="hover:text-[var(--stats-accent)] dark:hover:text-gold underline decoration-dotted underline-offset-2">{parts}</Link>
    : <>{parts}</>
}

function CoverageNote({ matches, withData }: { matches: number; withData: number }) {
  if (matches <= withData) return null
  return (
    <p className="font-rajdhani text-xs text-[var(--stats-text-muted)] dark:text-zinc-500 mb-3">
      Based on {withData} of {matches} matches in this filter. Older matches don&apos;t have the opponent&apos;s fall of wickets yet, so totals here can be lower than a bowler&apos;s full wicket count.
    </p>
  )
}

export function BreakthroughLeadersView({ leaders }: { leaders: BreakthroughLeaders }) {
  if (leaders.breakers.length === 0) {
    return (
      <div className="bg-[var(--stats-card-bg)] dark:bg-ink-3 border border-[var(--stats-card-border)] dark:border-ink-5 rounded p-6 text-center font-rajdhani text-sm text-[var(--stats-text-muted)] dark:text-zinc-500">
        No breakthrough data for this filter yet — it appears once a match&apos;s opponent Fall of Wickets has been synced
        {leaders.coverage.matches > 0 && ` (0 of ${leaders.coverage.matches} matches have it).`}
      </div>
    )
  }
  const brokenMax = leaders.breakers.reduce((m, b) => Math.max(m, b.bigBreaks), 0)
  const biggestMax = leaders.biggest[0]?.runs ?? 0

  return (
    <div>
      <CoverageNote {...leaders.coverage} />
      <Card title={`Top ${leaders.breakers.length} Partnership Breakers`} subtitle="Ranked by big stands ended — a stand in the top quarter for its batting position and format. Run-outs aren't credited to a bowler.">
        {leaders.breakers.map((b, i) => (
          <Bar
            key={b.bowler.playerId ?? b.bowler.playerName}
            label={`${i + 1}`}
            player={b.bowler}
            pct={pctOf(b.bigBreaks, brokenMax)}
            value={`${b.bigBreaks}`}
            sub={`of ${b.broken}`}
            caption={[
              `${b.matches} match${b.matches === 1 ? '' : 'es'}`,
              `${b.abovePar >= 0 ? '+' : ''}${b.abovePar.toFixed(0)} runs vs par`,
              b.ballsBowled > 0 ? `${(b.bigBreaks / (b.ballsBowled / 60)).toFixed(1)} big / 10 ov` : null,
            ].filter(Boolean).join(' · ')}
          />
        ))}
      </Card>

      {leaders.biggest.length > 0 && (
        <Card title={`Biggest ${leaders.biggest.length} Stands Broken`} subtitle="Largest opponent partnerships ended by a Spartans bowler.">
          {leaders.biggest.map((r, i) => (
            <Bar
              key={`${r.matchId}-${r.wicketNumber}`}
              label={`${i + 1}`}
              player={r.bowler}
              pct={pctOf(r.runs, biggestMax)}
              value={`${r.runs}`}
              sub={r.balls != null ? `(${r.balls})` : null}
              caption={<RecordCaption r={r} />}
            />
          ))}
        </Card>
      )}
    </div>
  )
}
