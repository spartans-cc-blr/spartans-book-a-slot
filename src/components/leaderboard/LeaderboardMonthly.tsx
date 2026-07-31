'use client'
// "Monthly" sub-tab under Honor Board on /leaderboard — see
// src/app/leaderboard/page.tsx. Same six-stat card treatment as
// LeaderboardMilestones ("Overall"), but scoped to a single month rather
// than a year, plus four innings lists below, agreed with the club
// coordinator:
//   1. "Leading X" becomes "Top X" — Best Average / Highest S/R / Best
//      Economy already read fine and are left as-is.
//   2. Every qualifying century/half-century/5-for/3-for in the month is
//      listed individually rather than a single "who has the most" card —
//      a month can genuinely have more than one of each.
//   3. Each row shows the tournament, not the opponent — a straight swap.
//   4. Each row is a whole-row link to its match page
//      (/matches/history/[bookingId]), same tab, so the browser back
//      button returns here. The player's own name link is preserved
//      inside via the existing stopPropagation convention (PlayerNameLink)
//      rather than nesting two <a> tags, which isn't valid HTML — click
//      the name to go to the player, click anywhere else in the row to go
//      to the match.
//
// Qualification is deliberately much looser than Milestones' quarterly-
// ratchet minGamesThreshold(): a club month is realistically 1-4 games per
// player, so any player who appeared that month qualifies for the counting
// cards (Top MVP/Runs/Wickets). Best Economy still requires a minimum
// sample (MIN_BALLS_FOR_ECONOMY) for the same reason it does on Milestones
// — a two-ball spell shouldn't win "best economy".

import { useRouter } from 'next/navigation'
import { PlayerNameLink } from '@/lib/playerLink'
import { bestBy, MIN_BALLS_FOR_ECONOMY } from './LeaderboardMilestones'
import type { LeaderboardRow, MonthlyInnings, MonthlyBowlingInnings } from '@/types'

interface Milestone {
  label: string
  icon: string
  row: LeaderboardRow | null
  valueText: string
}

function formatShortDate(dateStr: string | null): string {
  if (!dateStr) return ''
  return new Date(dateStr).toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short' })
}

// Whole-row click target for the match page. Not a real <a> — the row
// already contains PlayerNameLink, a genuine nested anchor, and browsers
// don't support <a> inside <a> (the outer tag silently closes early). A
// clickable div with the same stopPropagation convention already used
// elsewhere in this app (CaptainsCornerGrid's SelectablePlayerRow, etc.)
// gets the same same-tab/back-button behaviour without invalid markup.
function ClickableRow({ bookingId, children }: { bookingId: string | null; children: React.ReactNode }) {
  const router = useRouter()
  const base = 'flex items-center gap-3 px-4 py-2.5 border-b border-ink-4 last:border-b-0'
  if (!bookingId) return <div className={base}>{children}</div>
  return (
    <div
      role="link"
      tabIndex={0}
      onClick={() => router.push(`/matches/history/${bookingId}`)}
      onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') router.push(`/matches/history/${bookingId}`) }}
      className={`${base} cursor-pointer hover:bg-ink-4 transition-colors`}>
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
      <img
        src={photoUrl ?? '/default-avatar.png'}
        alt={playerName}
        className="w-8 h-8 rounded-full object-cover border border-gold-dim flex-shrink-0"
      />
      <div className="min-w-0 flex-1">
        <p className="font-rajdhani text-sm font-semibold text-parchment truncate">
          <PlayerNameLink name={playerName} playerId={playerId} cricHeroesUrl={cricheroesUrl} />
        </p>
        <p className="font-rajdhani text-xs text-zinc-500 truncate">
          {format && (
            <span className="inline-block text-[9px] font-bold bg-ink-4 border border-ink-5 text-zinc-400 rounded px-1 py-0.5 mr-1.5 align-middle">
              {format}
            </span>
          )}
          {tournamentName ?? 'Tournament —'}
        </p>
      </div>
    </>
  )
}

function BattingInningsRow({ innings }: { innings: MonthlyInnings }) {
  return (
    <ClickableRow bookingId={innings.bookingId}>
      <RowIdentity {...innings} />
      <div className="text-right flex-shrink-0">
        <p className="font-cinzel text-sm text-gold whitespace-nowrap">
          {innings.runs}{innings.notOut ? '*' : ''} ({innings.balls})
        </p>
        <p className="font-rajdhani text-[10px] text-zinc-600 whitespace-nowrap">{formatShortDate(innings.gameDate)}</p>
      </div>
    </ClickableRow>
  )
}

function BowlingInningsRow({ innings }: { innings: MonthlyBowlingInnings }) {
  return (
    <ClickableRow bookingId={innings.bookingId}>
      <RowIdentity {...innings} />
      <div className="text-right flex-shrink-0">
        <p className="font-cinzel text-sm text-gold whitespace-nowrap">
          {innings.wickets}/{innings.runsConceded} ({innings.overs} ov)
        </p>
        <p className="font-rajdhani text-[10px] text-zinc-600 whitespace-nowrap">{formatShortDate(innings.gameDate)}</p>
      </div>
    </ClickableRow>
  )
}

function InningsPanel({ icon, label, count, children }: { icon: string; label: string; count: number; children: React.ReactNode }) {
  return (
    <div className="bg-ink-3 border border-ink-5 rounded-lg overflow-hidden">
      <div className="flex items-center gap-2 px-4 py-2.5 border-b border-ink-5">
        <span className="text-sm leading-none">{icon}</span>
        <span className="font-rajdhani text-xs font-bold tracking-wide text-parchment flex-1">{label}</span>
        <span className="font-cinzel text-[10px] text-gold bg-gold/10 border border-gold-dim rounded-full px-2 py-0.5">{count}</span>
      </div>
      {count === 0
        ? <p className="font-rajdhani text-sm text-zinc-600 text-center py-6">No {label.toLowerCase()} this month yet.</p>
        : children}
    </div>
  )
}

export function LeaderboardMonthly({ rows, centuries, halfCenturies, fiveWicketHauls, threeWicketHauls, monthLabel }: {
  rows: LeaderboardRow[]
  centuries: MonthlyInnings[]
  halfCenturies: MonthlyInnings[]
  fiveWicketHauls: MonthlyBowlingInnings[]
  threeWicketHauls: MonthlyBowlingInnings[]
  monthLabel: string
}) {
  const qualifies = (r: LeaderboardRow) => r.stats.matches >= 1

  const topMVP     = bestBy(rows, r => r.stats.mvpPoints, qualifies)
  const topRuns     = bestBy(rows, r => r.stats.runs, qualifies)
  const topWickets  = bestBy(rows, r => r.stats.wickets, qualifies)
  const bestAverage = bestBy(rows, r => r.stats.battingAverage, qualifies)
  const bestSR       = bestBy(rows, r => r.stats.strikeRate, qualifies)
  const bestEconomy = bestBy(rows, r => r.stats.economy, r => r.stats.ballsBowled >= MIN_BALLS_FOR_ECONOMY && qualifies(r), true)

  const milestones: Milestone[] = [
    { label: 'Top MVP',         icon: '🏆', row: topMVP,     valueText: topMVP ? `${topMVP.stats.mvpPoints.toFixed(2)} pts` : '' },
    { label: 'Top Run Scorer',  icon: '🏏', row: topRuns,     valueText: topRuns ? `${topRuns.stats.runs} runs` : '' },
    { label: 'Top Wicket Taker', icon: '🎯', row: topWickets,  valueText: topWickets ? `${topWickets.stats.wickets} wkts` : '' },
    { label: 'Best Average',   icon: '📊', row: bestAverage, valueText: bestAverage ? `Avg ${bestAverage.stats.battingAverage!.toFixed(2)}` : '' },
    { label: 'Highest S/R',    icon: '⚡', row: bestSR,       valueText: bestSR ? `SR ${bestSR.stats.strikeRate!.toFixed(2)}` : '' },
    { label: 'Best Economy',   icon: '🔒', row: bestEconomy, valueText: bestEconomy ? `Econ ${bestEconomy.stats.economy!.toFixed(2)}` : '' },
  ].filter(m => m.row)

  const noInnings = centuries.length === 0 && halfCenturies.length === 0 && fiveWicketHauls.length === 0 && threeWicketHauls.length === 0
  if (rows.length === 0 && noInnings) {
    return (
      <p className="font-rajdhani text-sm text-zinc-500 py-8 text-center">No stats for {monthLabel} yet.</p>
    )
  }

  return (
    <div className="space-y-4">
      {milestones.length > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {milestones.map(m => (
            <div key={m.label} style={{
              background: 'linear-gradient(135deg, #1C2333 0%, #111827 100%)',
              border: '1px solid #2D3748',
              borderRadius: '12px',
              padding: '12px',
              boxShadow: '0 4px 20px rgba(0,0,0,.4)',
              position: 'relative',
              overflow: 'hidden',
            }}>
              <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: '3px', background: 'linear-gradient(90deg, #C9A84C, #F5D78E, #C9A84C)' }} />

              <div className="flex items-center justify-between mb-2">
                <p className="font-rajdhani text-[10px] font-bold tracking-widest uppercase text-zinc-500">{m.label}</p>
                <span className="text-sm leading-none">{m.icon}</span>
              </div>

              <div className="flex items-center gap-2">
                <img
                  src={m.row!.photoUrl ?? '/default-avatar.png'}
                  alt={m.row!.playerName}
                  className="w-8 h-8 rounded-full object-cover border border-gold-dim flex-shrink-0"
                />
                <div className="min-w-0">
                  <p className="font-rajdhani text-sm font-semibold text-parchment truncate">
                    <PlayerNameLink name={m.row!.playerName} playerId={m.row!.playerId} cricHeroesUrl={m.row!.cricheroesUrl} />
                  </p>
                  <p className="font-cinzel text-xs text-gold mt-0.5">{m.valueText}</p>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      <InningsPanel icon="💯" label="Centuries" count={centuries.length}>
        {centuries.map(i => <BattingInningsRow key={i.playerId + i.gameDate} innings={i} />)}
      </InningsPanel>

      <InningsPanel icon="5️⃣0️⃣" label="Half-Centuries" count={halfCenturies.length}>
        {halfCenturies.map(i => <BattingInningsRow key={i.playerId + i.gameDate} innings={i} />)}
      </InningsPanel>

      <InningsPanel icon="🎳" label="5-Wicket Hauls" count={fiveWicketHauls.length}>
        {fiveWicketHauls.map(i => <BowlingInningsRow key={i.playerId + i.gameDate} innings={i} />)}
      </InningsPanel>

      <InningsPanel icon="🎯" label="3-Wicket Hauls" count={threeWicketHauls.length}>
        {threeWicketHauls.map(i => <BowlingInningsRow key={i.playerId + i.gameDate} innings={i} />)}
      </InningsPanel>
    </div>
  )
}
