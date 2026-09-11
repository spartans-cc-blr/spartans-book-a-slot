'use client'
// Shared innings-row primitives for the /leaderboard performance lists —
// extracted from LeaderboardMonthly.tsx so LeaderboardMilestones.tsx's
// year-scoped Centuries/5-Wicket Hauls bands can reuse the exact same
// clickable-row-to-match-page behaviour instead of duplicating it.

import { useRouter } from 'next/navigation'
import { PlayerNameLink } from '@/lib/playerLink'
import { PlayerAvatar } from './PlayerAvatar'
import type { MonthlyInnings, MonthlyBowlingInnings } from '@/types'

export function formatShortDate(dateStr: string | null): string {
  if (!dateStr) return ''
  return new Date(dateStr).toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short' })
}

// Whole-row click target for the match page. Not a real <a> — the row
// already contains PlayerNameLink, a genuine nested anchor, and browsers
// don't support <a> inside <a> (the outer tag silently closes early). A
// clickable div with the same stopPropagation convention already used
// elsewhere in this app (CaptainsCornerGrid's SelectablePlayerRow, etc.)
// gets the same same-tab/back-button behaviour without invalid markup.
export function ClickableRow({ bookingId, children }: { bookingId: string | null; children: React.ReactNode }) {
  const router = useRouter()
  const base = 'flex items-center gap-3 px-4 py-2.5 border-b border-[var(--stats-divider)] dark:border-ink-4 last:border-b-0'
  if (!bookingId) return <div className={base}>{children}</div>
  return (
    <div
      role="link"
      tabIndex={0}
      onClick={() => router.push(`/matches/history/${bookingId}`)}
      onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') router.push(`/matches/history/${bookingId}`) }}
      className={`${base} cursor-pointer hover:bg-[var(--stats-row-hover)] dark:hover:bg-ink-4 transition-colors`}>
      {children}
    </div>
  )
}

function RowIdentity({ photoUrl, playerId, playerName, cricheroesUrl, format, tournamentName }: {
  photoUrl: string | null; playerId: string; playerName: string; cricheroesUrl: string | null
  format: string | null; tournamentName: string | null
}) {
  return (
    <>
      <PlayerAvatar photoUrl={photoUrl} name={playerName} />
      <div className="min-w-0 flex-1">
        <p className="font-rajdhani text-sm font-semibold text-[var(--stats-text)] dark:text-parchment truncate">
          <PlayerNameLink name={playerName} playerId={playerId} cricHeroesUrl={cricheroesUrl} />
        </p>
        <p className="font-rajdhani text-xs text-[var(--stats-text-muted)] dark:text-zinc-500 truncate">
          {format && (
            <span className="inline-block text-[9px] font-bold bg-[var(--stats-row-bg)] dark:bg-ink-4 border border-[var(--stats-card-border)] dark:border-ink-5 text-[var(--stats-text-2)] dark:text-zinc-400 rounded px-1 py-0.5 mr-1.5 align-middle">
              {format}
            </span>
          )}
          {tournamentName ?? 'Tournament —'}
        </p>
      </div>
    </>
  )
}

export function BattingInningsRow({ innings }: { innings: MonthlyInnings }) {
  return (
    <ClickableRow bookingId={innings.bookingId}>
      <RowIdentity {...innings} />
      <div className="text-right flex-shrink-0">
        <p className="font-cinzel text-sm text-[var(--stats-accent)] dark:text-gold whitespace-nowrap">
          {innings.runs}{innings.notOut ? '*' : ''} ({innings.balls})
        </p>
        <p className="font-rajdhani text-[10px] text-[var(--stats-text-faint)] dark:text-zinc-600 whitespace-nowrap">{formatShortDate(innings.gameDate)}</p>
      </div>
    </ClickableRow>
  )
}

export function BowlingInningsRow({ innings }: { innings: MonthlyBowlingInnings }) {
  return (
    <ClickableRow bookingId={innings.bookingId}>
      <RowIdentity {...innings} />
      <div className="text-right flex-shrink-0">
        <p className="font-cinzel text-sm text-[var(--stats-accent)] dark:text-gold whitespace-nowrap">
          {innings.wickets}/{innings.runsConceded} ({innings.overs} ov)
        </p>
        <p className="font-rajdhani text-[10px] text-[var(--stats-text-faint)] dark:text-zinc-600 whitespace-nowrap">{formatShortDate(innings.gameDate)}</p>
      </div>
    </ClickableRow>
  )
}
