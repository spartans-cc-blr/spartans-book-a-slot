'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { parseISO, differenceInDays, format } from 'date-fns'
import Link from 'next/link'
import { PlayerNameLink } from '@/lib/playerLink'
import { TournamentShareButton, WA_ICON } from './TournamentShareButton'
import { ResultBadge } from '@/components/shared/ResultBadge'
import type { PlayerStatsTotals } from '@/types'

// ── Types ──────────────────────────────────────────────────────────
interface Booking {
  id: string
  game_date: string
  slot_time: string
  format: string | null
  cricheroes_url: string | null
  // Resolved server-side from match_stats_cache — null until a scorecard is
  // synced for this match, even for a game that's already been played.
  match_result: string | null
  tournament: {
    id: string
    name: string
    organiser_name: string | null
    organiser_contact: string | null
    total_league_games: number | null
    cricheroes_points_table_url: string | null
    captain_id: string | null
    captains: { id: string; name: string; player_id: string | null } | null
  } | null
}

interface Captain { id: string; name: string }

interface TournamentPlayer { id: string; name: string; cricheroes_url: string | null }

interface SquadCaptain { id: string; name: string; cricheroes_url: string | null }

interface ViewerRole {
  isCaptain: boolean
  isGC: boolean
  isAdmin: boolean
  captainId: string | null
}

interface Props {
  bookings: Booking[]
  announcedBookingIds: string[]
  captains: Captain[]
  today: string
  viewerRole: ViewerRole
  tournamentPlayersMap: Record<string, TournamentPlayer[]>
  // Keyed by real Hub player_id (reconciled — see src/lib/playerIdentityResolution.ts),
  // scoped purely to this tournament's own matches via getLeaderboard({ tournamentId }).
  // Never career-wide stats.
  tournamentStatsMap: Record<string, Record<string, PlayerStatsTotals>>
  bookingCaptainMap: Record<string, SquadCaptain>
}

// ── Slot definitions ───────────────────────────────────────────────
const ALL_SLOTS = [
   { day: 'Sat', time: '07:30', formats: 'T20 / T30', validFor: ['T20', 'T30'] },
   { day: 'Sat', time: '10:30', formats: 'T20 only',  validFor: ['T20']        },
   { day: 'Sat', time: '12:30', formats: 'T30 only',  validFor: ['T30']        },
   { day: 'Sat', time: '14:30', formats: 'T20 only',  validFor: ['T20']        },
   { day: 'Sun', time: '07:30', formats: 'T20 / T30', validFor: ['T20', 'T30'] },
   { day: 'Sun', time: '10:30', formats: 'T20 only',  validFor: ['T20']        },
   { day: 'Sun', time: '12:30', formats: 'T30 only',  validFor: ['T30']        },
   { day: 'Sun', time: '14:30', formats: 'T20 only',  validFor: ['T20']        },
 ] as const

type SlotKey = `${'Sat' | 'Sun'}-${'07:30' | '10:30' | '12:30' | '14:30'}`

function slotKey(game_date: string, slot_time: string): SlotKey {
  const d = parseISO(game_date)
  const day = d.getDay() === 6 ? 'Sat' : 'Sun'
  return `${day}-${slot_time}` as SlotKey
}

// Alternates a 0/1 row for consecutive positions closer together than
// thresholdPct — used to keep rotated labels from overlapping when their
// anchor points are nearly on top of each other. Rotation alone only
// narrows a label's own footprint; it doesn't stop two labels centred on
// nearly the same point from landing on top of each other.
function staggerRows(pcts: number[], thresholdPct: number): number[] {
  let lastPct = -100, row = 0
  return pcts.map(pct => {
    row = (pct - lastPct < thresholdPct) ? (row === 0 ? 1 : 0) : 0
    lastPct = pct
    return row
  })
}

// Same helper as CaptainsCornerGrid.tsx's ContextStatsTable — null stats render
// as a dash rather than a misleading zero.
function statCell(v: number | null | undefined): { text: string; dash: boolean } {
  return v == null ? { text: '—', dash: true } : { text: String(v), dash: false }
}

// Same rolled-up figure as LeaderboardTable.tsx's fielding/MVP "Dismissals"
// column — catches, run outs, and stumpings are all fielding dismissals.
function dismissals(s: PlayerStatsTotals): number {
  return s.catches + s.runOuts + s.stumpings
}

// Player Stats board column config — single source of truth for both the
// sortable header row and each player row's cell order. Kept to the five
// headline numbers (no Avg/SR/Econ) so the table stays scannable at a
// glance — MVP is the default sort since it's the one figure meant to rank
// players against each other, the rest are supporting detail.
type StatsSortKey = 'name' | 'matches' | 'runs' | 'wickets' | 'dismissals' | 'mvpPoints'
const STAT_COLUMNS: { key: Exclude<StatsSortKey, 'name'>; label: string; value: (s: PlayerStatsTotals) => number | null }[] = [
  { key: 'matches',    label: 'M',   value: s => s.matches },
  { key: 'runs',       label: 'R',   value: s => s.runs },
  { key: 'wickets',    label: 'Wk',  value: s => s.wickets },
  { key: 'dismissals', label: 'Dis', value: dismissals },
  { key: 'mvpPoints',  label: 'MVP', value: s => s.mvpPoints },
]

// Same abbreviation CaptainsCornerGrid.tsx's MatrixView uses for its mobile
// column headers ("First L.") — keeps the name column narrow enough that a
// right-aligned M/R/Wk/Dis/MVP row fits a portrait phone width without
// horizontal scroll.
function mobileMatrixName(name: string): string {
  const parts = name.trim().split(' ').filter(Boolean)
  if (parts.length === 1) return parts[0]
  return parts[0] + ' ' + parts[parts.length - 1][0] + '.'
}

function scrollToTournament(tournamentId: string) {
  document.getElementById(`tournament-block-${tournamentId}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' })
}

// ── Pace helpers ───────────────────────────────────────────────────
function avgGapWeeks(dates: string[]): number | null {
  if (dates.length < 2) return null
  const sorted = [...dates].sort()
  let totalDays = 0
  for (let i = 1; i < sorted.length; i++) {
    totalDays += differenceInDays(parseISO(sorted[i]), parseISO(sorted[i - 1]))
  }
  return Math.round(totalDays / 7 / (sorted.length - 1))
}

function paceSignal(
  weeks: number | null,
  unbooked: number,
  lastGameDate: string,
  today: string
): { label: string; bg: string; txt: string; waLabel: string } {
  if (weeks === null) return {
    label: 'Not enough data', bg: 'bg-stone-100', txt: 'text-stone-600', waLabel: '',
  }
  // Nearly done — no action needed regardless of gap
  if (unbooked <= 1) return {
    label: 'Good pace', bg: 'bg-emerald-50', txt: 'text-emerald-700', waLabel: '',
  }
  // Too fast
  if (weeks <= 1) return {
    label: 'Ask to slow down',
    bg: 'bg-red-50', txt: 'text-red-700',
    waLabel: `Hi! We've been playing every week for this tournament — could we space the remaining games out a bit more? Ideally 2 games a month works well for us.`,
  }
  // Nudge only if organiser has gone quiet (last game is past and >21 days ago, 2+ unbooked)
  const daysSinceLastGame = Math.round(
    differenceInDays(parseISO(today), parseISO(lastGameDate))
  )
  const hasGoneQuiet = lastGameDate < today && daysSinceLastGame > 21
  if (hasGoneQuiet && unbooked >= 2) return {
    label: 'Nudge to schedule',
    bg: 'bg-amber-50', txt: 'text-amber-700',
    waLabel: `Hi! It's been a few weeks since our last game in this tournament. Could we get the next couple of fixtures on the calendar? We're targeting 2 games a month.`,
  }
  return {
    label: 'Good pace', bg: 'bg-emerald-50', txt: 'text-emerald-700', waLabel: '',
  }
}

// ── Captain bandwidth section ──────────────────────────────────────
function BandwidthSection({
  captains, bookings, today, viewerCaptainId, onViewTournament,
}: {
  captains: Captain[]
  bookings: Booking[]
  announcedSet: Set<string>
  today: string
  viewerCaptainId: string | null
  onViewTournament: (tournamentId: string) => void
}) {
  const tourneyBookings = bookings.filter(b => b.tournament)
  const isCaptainView   = !!viewerCaptainId
  const myCaptain       = isCaptainView ? captains.find(c => c.id === viewerCaptainId) : null
  const otherCaptains   = isCaptainView ? captains.filter(c => c.id !== viewerCaptainId) : captains

  function renderCaptainCard(captain: Captain, isOwn: boolean) {
    const allMine = tourneyBookings.filter(b => b.tournament?.captain_id === captain.id)

    // Group by tournament first, to work out which tournaments are still
    // "ongoing" (something outstanding or unbooked) vs fully wrapped up.
    const byTournament = new Map<string, { tournament: NonNullable<Booking['tournament']>; games: Booking[] }>()
    allMine.forEach(b => {
      if (!b.tournament) return
      const tid = b.tournament.id
      if (!byTournament.has(tid)) byTournament.set(tid, { tournament: b.tournament, games: [] })
      byTournament.get(tid)!.games.push(b)
    })
    const tournamentBreakdown = Array.from(byTournament.values())
      .map(({ tournament: t, games }) => {
        const played      = games.filter(g => g.game_date < today).length
        const outstanding = games.filter(g => g.game_date >= today).length
        const totalLeague = t.total_league_games ?? games.length
        const tUnbooked   = Math.max(0, totalLeague - games.length)
        return { tournament: t, played, outstanding, unbooked: tUnbooked }
      })
      // Hide tournaments with nothing left to play — total games === played means
      // no scheduled or unbooked games remain. Whether that counts as "completed"
      // is a separate decision for later; for now just keep these out of view.
      .filter(({ outstanding, unbooked }) => outstanding > 0 || unbooked > 0)
      .sort((a, b) => a.tournament.name.localeCompare(b.tournament.name))

    // Headline stats (count line, bar, timeline) are scoped to ongoing
    // tournaments only, matching the breakdown list above — a tournament
    // that wrapped up months ago shouldn't inflate today's workload picture.
    // Made explicit in the UI caption below so this isn't a silent filter.
    const ongoingTournamentIds = new Set(tournamentBreakdown.map(({ tournament }) => tournament.id))
    const mine      = allMine.filter(b => ongoingTournamentIds.has(b.tournament!.id))
    const completed = mine.filter(b => b.game_date < today)
    const scheduled = mine.filter(b => b.game_date >= today)

    // Summed per-tournament (each clamped at 0 individually) rather than a
    // single aggregate subtraction — an aggregate sum lets one over-booked
    // tournament's negative delta silently cancel out another tournament's
    // genuine unbooked count. This must match tournamentBreakdown's own
    // per-tournament unbooked values above.
    const unbooked = Array.from(ongoingTournamentIds)
      .reduce((sum, tid) => {
        const entry = byTournament.get(tid)!
        const tLeague = entry.tournament.total_league_games ?? entry.games.length
        return sum + Math.max(0, tLeague - entry.games.length)
      }, 0)
    const total = mine.length + unbooked

    const slotCounts = Object.fromEntries(
      ALL_SLOTS.map(s => [`${s.day}-${s.time}`, 0])
    ) as Record<SlotKey, number>
    mine.forEach(b => {
      const k = slotKey(b.game_date, b.slot_time)
      if (slotCounts[k] !== undefined) slotCounts[k]++
    })

    const maxSlot      = Math.max(...Object.values(slotCounts), 1)
    const dominantSlot = Object.entries(slotCounts).find(([, v]) => v === maxSlot)?.[0]
    const isImbalanced = maxSlot > Math.ceil(mine.length / 2) && mine.length >= 3

    const isLowLoad = total <= 4 && unbooked <= 1

    // Format mix for this captain's bookings
    const captainFormats = Array.from(new Set(mine.map(b => b.format).filter((f): f is string => !!f)))
    const captainActiveFormats = captainFormats.length === 0 ? ['T20', 'T30'] : captainFormats

    return (
      <div
        key={captain.id}
        className={`bg-white rounded-2xl border p-4 transition-opacity ${
          isOwn
            ? 'border-gold-dim ring-1 ring-gold/20'
            : isCaptainView
            ? `${isLowLoad ? 'border-emerald-300' : 'border-parchment-3'} opacity-60`
            : isLowLoad ? 'border-emerald-300' : 'border-parchment-3'
        }`}
      >
        <div className="flex items-center gap-3 mb-3">
          <div className="w-9 h-9 rounded-full bg-gold/20 flex items-center justify-center font-cinzel text-gold-dim text-sm font-bold flex-shrink-0">
            {captain.name.slice(0, 2).toUpperCase()}
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="font-cinzel text-sm font-bold text-ink">{captain.name}</span>
              {isLowLoad && (
                <span className="font-rajdhani text-[10px] px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200">
                  Bandwidth available — can take new tournament
                </span>
              )}
            </div>
            <p className="font-rajdhani text-xs text-stone-500 mt-0.5">
              <span className="text-ink font-semibold">{total}</span> total &nbsp;·&nbsp;
              <span className="text-amber-700 font-semibold">{scheduled.length}</span> upcoming &nbsp;·&nbsp;
              <span className="text-emerald-700 font-semibold">{completed.length}</span> past matches &nbsp;·&nbsp;
              <span className="text-stone-600 font-semibold">{unbooked}</span> unbooked
            </p>
            {/* Counts are colour-coded to match the bar below (see the page-level
                legend above), repeated per-card since that legend is easy to lose
                track of a few cards down. Explicitly scoped to ongoing tournaments
                only — a captain's finished tournaments don't count toward this. */}
            <p className="font-rajdhani text-[10px] text-stone-400 mt-0.5">Ongoing tournaments only</p>
          </div>
        </div>

        {/* Upcoming / Unbooked cards — replaced the old 3-segment stacked bar.
            Past matches already shows in the count line above and doesn't
            need a second, more prominent home here; upcoming vs. unbooked is
            the pair that actually matters for bandwidth planning. A "Matches"
            eyebrow precedes them since the page also has tournament-count
            cards (the Show filter below) using the same visual language —
            without it, these two numbers could be misread as tournament
            counts rather than match counts. */}
        <p className="font-rajdhani text-[10px] font-bold tracking-[2px] uppercase text-stone-400 mb-1.5">Matches</p>
        <div className="grid grid-cols-2 gap-2 mb-2">
          <div className="rounded-lg bg-amber-50 border border-amber-200 px-3 py-2">
            <p className="font-cinzel text-lg font-bold text-amber-700 leading-tight">{scheduled.length}</p>
            <p className="font-rajdhani text-[10px] font-bold tracking-widest uppercase text-amber-700/80">Upcoming</p>
          </div>
          <div className="rounded-lg bg-parchment-2 border border-parchment-3 px-3 py-2">
            <p className="font-cinzel text-lg font-bold text-stone-600 leading-tight">{unbooked}</p>
            <p className="font-rajdhani text-[10px] font-bold tracking-widest uppercase text-stone-500">Unbooked</p>
          </div>
        </div>

        {/* Availability timeline — today through the latest already-booked game
            across all this captain's ongoing tournaments, so gaps between games
            read as "free" at a glance. Additive to the bar above (which shows
            proportional load), not a replacement — the bar answers "how much is
            left," the timeline answers "when are they actually free." */}
        {tournamentBreakdown.length > 0 && (() => {
          const upcoming = [...scheduled].sort((a, b) => a.game_date.localeCompare(b.game_date))
          if (upcoming.length === 0) {
            return (
              <p className="font-rajdhani text-[11px] text-emerald-700 mt-1 mb-2">
                ✓ Free from today — no games booked yet.
              </p>
            )
          }
          const todayMs = parseISO(today).getTime()
          const lastGame = upcoming[upcoming.length - 1]
          const lastMs   = parseISO(lastGame.game_date).getTime()
          const totalMs  = lastMs - todayMs || 1

          // "Today" is folded into the same points/stagger array as the games
          // themselves (not handled as a one-off at a fixed row), so it
          // collides and staggers with a same-week first game exactly like
          // 5 Sep/6 Sep already do with each other.
          type Point = { key: string; label: string; ms: number; isToday: boolean }
          const points: Point[] = [
            { key: 'today', label: 'Today', ms: todayMs, isToday: true },
            ...upcoming.map(g => ({ key: g.id, label: format(parseISO(g.game_date), 'd MMM'), ms: parseISO(g.game_date).getTime(), isToday: false })),
          ]
          const pcts = points.map(p => Math.max(0, ((p.ms - todayMs) / totalMs) * 100))
          const dateRows = staggerRows(pcts, 10)
          // Week gap between each consecutive pair, including Today → first
          // game, labelled at the midpoint between their two dots.
          const gaps = points.slice(1).map((p, i) => ({
            pct: (pcts[i] + pcts[i + 1]) / 2,
            weeks: Math.round((p.ms - points[i].ms) / (1000 * 60 * 60 * 24 * 7)),
          }))

          return (
            <div className="mt-2 mb-1">
              <p className="font-rajdhani text-[10px] font-bold tracking-[2px] uppercase text-stone-500 mb-2">
                Schedule — today onward
              </p>
              <div className="relative" style={{ height: 16 }}>
                <div className="absolute top-[5px] left-0 right-0 h-[2px] bg-parchment-3" />
                {points.map((p, i) => (
                  <div key={p.key} className="absolute top-0" style={{ left: `${pcts[i]}%`, transform: 'translateX(-50%)' }}>
                    <div className={`rounded-full border-2 border-white ${p.isToday ? 'w-2.5 h-2.5 bg-stone-400' : 'w-3 h-3 bg-amber-600'}`}
                      style={{ boxShadow: '0 0 0 1px #E2DACE' }} />
                  </div>
                ))}
              </div>
              <div className="relative" style={{ height: 12 }}>
                {gaps.map((g, i) => g.weeks > 2 && (
                  <div key={i} className="absolute whitespace-nowrap text-[8px] font-semibold text-stone-400"
                    style={{ left: `${g.pct}%`, transform: 'translateX(-50%)' }}>
                    {g.weeks}w
                  </div>
                ))}
              </div>
              {/* Date labels angled at -45° — a compromise between fully
                  horizontal (collides easily) and fully vertical (needs the
                  entire label length as height). At 45° the footprint splits
                  roughly evenly between both axes, so it needs about half
                  the vertical room 270° did while still resisting collision
                  almost as well. Rotation alone still doesn't stop two
                  labels centred on nearly the same point from landing on
                  top of each other (e.g. Today coinciding with an imminent
                  first game, or 5 Sep/6 Sep on consecutive days) — still
                  staggered onto a second row whenever two points land
                  closer than the threshold. */}
              <div className="relative mt-1" style={{ height: 54 }}>
                {points.map((p, i) => (
                  <div key={p.key} className="absolute" style={{ left: `${pcts[i]}%`, top: dateRows[i] === 0 ? '30%' : '80%', transform: 'translate(-50%, -50%)' }}>
                    <span className={`inline-block whitespace-nowrap text-[9px] font-semibold ${p.isToday ? 'text-stone-500' : 'text-amber-700'}`}
                      style={{ transform: 'rotate(-45deg)' }}>
                      {p.label}
                    </span>
                  </div>
                ))}
              </div>
              <p className="text-[10px] text-stone-400 mt-1">
                Free beyond {format(parseISO(lastGame.game_date), 'd MMM')} unless more games get booked.
              </p>
            </div>
          )
        })()}

        {/* Per-tournament breakdown — played / outstanding / unbooked, click through to the tournament below */}
        {tournamentBreakdown.length > 0 && (
          <div className="mt-4 pt-4 border-t border-parchment-3">
            <p className="font-rajdhani text-[10px] font-bold tracking-[2px] uppercase text-stone-500 mb-3">
              By tournament
            </p>
            <div className="flex flex-col gap-2">
              {tournamentBreakdown.map(({ tournament: t, played, outstanding, unbooked: tUnbooked }) => (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => onViewTournament(t.id)}
                  className="w-full text-left bg-parchment-2 border border-parchment-3 hover:border-gold-dim rounded-lg px-3 py-2.5 transition-colors"
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-cinzel text-xs font-bold text-ink truncate">{t.name}</span>
                    <span className="font-rajdhani text-[10px] text-stone-500 flex-shrink-0">↓ view</span>
                  </div>
                  <p className="font-rajdhani text-[11px] text-stone-500 mt-1">
                    <span className="text-amber-700 font-semibold">{outstanding}</span> upcoming &nbsp;·&nbsp;
                    <span className="text-emerald-700 font-semibold">{played}</span> past matches &nbsp;·&nbsp;
                    <span className="text-stone-600 font-semibold">{tUnbooked}</span> unbooked
                  </p>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Overall slot balance — secondary to the per-tournament breakdown above */}
        {mine.length > 0 && (
          <div className="mt-4 pt-4 border-t border-parchment-3">
            <p className="font-rajdhani text-[10px] font-bold tracking-[2px] uppercase text-stone-500 mb-3">
              Overall slot balance
            </p>
            <div className="grid grid-cols-8 gap-1.5">
              {ALL_SLOTS.map(s => {
                const k: SlotKey = `${s.day}-${s.time}`
                const count = slotCounts[k]
                const barH  = count > 0 ? Math.round((count / maxSlot) * 100) : 0
                const isSat = s.day === 'Sat'
                const isApplicable = s.validFor.some(f => captainActiveFormats.includes(f))
                return (
                  <div key={k} className="bg-parchment-2 border border-parchment-3 rounded p-1.5 flex flex-col items-center">
                    <span className={`font-rajdhani text-[9px] font-bold px-1.5 py-0.5 rounded-full mb-1 ${
                      isSat ? 'bg-blue-100 text-blue-700' : 'bg-pink-100 text-pink-700'
                    }`}>{s.day}</span>
                    <span className="font-rajdhani text-[10px] text-stone-500 mb-1.5">{s.time}</span>
                    <div className="w-full h-8 bg-parchment-3 rounded overflow-hidden flex flex-col-reverse mb-1">
                      {count > 0 && isApplicable && (
                        <div
                          className="w-full rounded bg-amber-600 transition-all"
                          style={{ height: `${barH}%` }}
                        />
                      )}
                    </div>
                    <span className={`font-cinzel text-xs font-bold ${
                      !isApplicable ? 'text-stone-300' :
                      count > 0 ? 'text-amber-700' : 'text-stone-500'
                    }`}>
                      {!isApplicable ? 'N/A' : count > 0 ? count : '0'}
                    </span>
                    <span className="font-rajdhani text-[8px] text-stone-400 mt-0.5">{s.formats}</span>
                  </div>
                )
              })}
            </div>
            {isImbalanced && (
              <p className="font-rajdhani text-xs text-blue-700 mt-2">
                ↗ Heavy on {dominantSlot} — route unbooked games to other slots for balance
              </p>
            )}
          </div>
        )}
      </div>
    )
  }

  return (
    <section className="mb-10">
      <p className="font-rajdhani text-[10px] font-bold tracking-[3px] uppercase text-stone-500 mb-1">
        Tournament Planner
      </p>
      <h1 className="font-cinzel text-xl font-bold text-gold-dim mb-1">Captain Bandwidth</h1>
      <p className="font-rajdhani text-sm text-stone-500 mb-5">
        {isCaptainView
          ? 'Your tournament load — followed by other captains.'
          : 'Total tournament game load per captain — upcoming, past matches, and unbooked.'}
      </p>

      {/* Legend */}
      <div className="flex gap-5 mb-4 flex-wrap">
        {[
          { color: 'bg-amber-600',   label: 'Upcoming (booked)' },
          { color: 'bg-emerald-600', label: 'Past matches (past date)' },
          { color: 'bg-stone-400',   label: 'Unbooked (remaining league games)' },
        ].map(({ color, label }) => (
          <div key={label} className="flex items-center gap-2">
            <div className={`w-3 h-3 rounded-sm ${color}`} />
            <span className="font-rajdhani text-xs text-stone-600">{label}</span>
          </div>
        ))}
      </div>

      <div className="flex flex-col gap-4">
        {isCaptainView && myCaptain && (
          <>
            <p className="font-rajdhani text-[10px] uppercase tracking-widest text-stone-500">Your bandwidth</p>
            {renderCaptainCard(myCaptain, true)}
            {otherCaptains.length > 0 && (
              <p className="font-rajdhani text-[10px] uppercase tracking-widest text-stone-500 mt-2">Other captains</p>
            )}
          </>
        )}
        {(isCaptainView ? otherCaptains : captains).map(captain => renderCaptainCard(captain, false))}
      </div>
    </section>
  )
}

// ── Inline game count editor — admin only ─────────────────────────
function InlineGameCountEditor({
  tournamentId, currentValue, onSaved,
}: {
  tournamentId: string
  currentValue: number | null
  onSaved: (newVal: number) => void
}) {
  const [editing, setEditing] = useState(false)
  const [val, setVal]         = useState(String(currentValue ?? ''))
  const [saving, setSaving]   = useState(false)
  const [error, setError]     = useState('')

  async function handleSave() {
    const parsed = parseInt(val, 10)
    if (isNaN(parsed) || parsed < 1 || parsed > 99) {
      setError('Enter a number between 1–99'); return
    }
    setSaving(true); setError('')
    const res = await fetch('/api/tournaments', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: tournamentId, total_league_games: parsed }),
    })
    if (res.ok) { onSaved(parsed); setEditing(false) }
    else setError('Save failed — try again')
    setSaving(false)
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Enter')  handleSave()
    if (e.key === 'Escape') { setEditing(false); setError('') }
  }

  if (!editing) {
    return (
      <button
        onClick={() => { setVal(String(currentValue ?? '')); setEditing(true) }}
        className="group flex items-center gap-1 font-bold text-ink hover:text-gold-dim transition-colors"
        title="Edit total league games"
      >
        {currentValue ?? '?'}
        <span className="text-stone-400 group-hover:text-gold-dim text-[10px] opacity-0 group-hover:opacity-100 transition-opacity">✎</span>
      </button>
    )
  }

  return (
    <div className="flex items-center gap-1">
      <input
        type="number" min={1} max={99} value={val} autoFocus
        onChange={e => setVal(e.target.value)}
        onKeyDown={handleKeyDown}
        className="w-12 bg-white border border-gold text-ink text-xs font-bold text-center rounded px-1 py-0.5 focus:outline-none"
      />
      <button onClick={handleSave} disabled={saving}
        className="text-[10px] font-bold text-emerald-700 hover:text-emerald-800 px-1 py-0.5 border border-emerald-300 rounded disabled:opacity-50">
        {saving ? '…' : '✓'}
      </button>
      <button onClick={() => { setEditing(false); setError('') }}
        className="text-[10px] text-stone-500 hover:text-stone-700 px-1 py-0.5">✕</button>
      {error && <span className="text-[9px] text-red-700 ml-1">{error}</span>}
    </div>
  )
}

// ── Gap stats — shared by the pace insight card and the timeline ────
function computeGapStats(sortedGames: Booking[]) {
  const gaps: (number | null)[] = sortedGames.map((g, i) => {
    if (i === 0) return null
    return Math.round(
      differenceInDays(parseISO(g.game_date), parseISO(sortedGames[i - 1].game_date)) / 7
    )
  })
  const nums       = gaps.filter((g): g is number => g !== null)
  const fastestGap = nums.length ? Math.min(...nums) : null
  const slowestGap = nums.length ? Math.max(...nums) : null
  const isUneven   = nums.length > 1 && slowestGap! - fastestGap! > 2
  return { gaps, fastestGap, slowestGap, isUneven }
}

// ── Game timeline (pace view) — warm-light, tap-friendly ─────────────
function GameTimelineCard({ sortedGames, gaps, avgGap }: {
  sortedGames: Booking[]
  gaps: (number | null)[]
  avgGap: number | null
}) {
  const [legendOpen, setLegendOpen] = useState(true)

  if (sortedGames.length < 2) return null

  const start   = parseISO(sortedGames[0].game_date).getTime()
  const end     = parseISO(sortedGames[sortedGames.length - 1].game_date).getTime()
  const totalMs = end - start || 1
  const pcts    = sortedGames.map(g => ((parseISO(g.game_date).getTime() - start) / totalMs) * 100)

  function gapColors(gap: number | null): { dot: string; text: string } {
    if (gap === null)                            return { dot: 'bg-stone-300', text: 'text-stone-500' }
    if (gap <= 1)                                return { dot: 'bg-red-600',    text: 'text-red-700'   }
    if (avgGap !== null && gap > avgGap + 2)      return { dot: 'bg-amber-600', text: 'text-amber-700' }
    return { dot: 'bg-emerald-600', text: 'text-emerald-700' }
  }

  // Stagger labels that would overlap (within 9% horizontally) onto a second row
  let lastPct = -100, row = 0
  const rows = pcts.map(pct => {
    row = (pct - lastPct < 9) ? (row === 0 ? 1 : 0) : 0
    lastPct = pct
    return row
  })

  return (
    <div className="px-4 pt-5 pb-1">
      <div className="flex items-center justify-between gap-2 mb-3">
        <p className="text-[15px] font-bold text-ink flex-1">Game timeline — pace view</p>
        <button type="button" onClick={() => setLegendOpen(v => !v)}
          className="text-[12.5px] font-bold text-blue-700">
          {legendOpen ? 'Hide legend' : 'Show legend'}
        </button>
      </div>
      {legendOpen && (
        <div className="flex gap-3.5 flex-wrap mb-3.5">
          {[
            { dot: 'bg-red-600',     label: 'Too fast' },
            { dot: 'bg-emerald-600', label: 'On pace' },
            { dot: 'bg-amber-600',   label: 'Slower' },
          ].map(({ dot, label }) => (
            <div key={label} className="flex items-center gap-1.5 text-xs text-stone-600">
              <span className={`w-2 h-2 rounded-full ${dot}`} />{label}
            </div>
          ))}
        </div>
      )}
      <div className="relative" style={{ height: 16 }}>
        <div className="absolute top-[5px] left-0 right-0 h-[2px] bg-parchment-3" />
        {sortedGames.map((g, i) => (
          <div key={g.id} className="absolute top-0" style={{ left: `${pcts[i]}%`, transform: 'translateX(-50%)' }}>
            <div className={`w-3 h-3 rounded-full border-2 border-white ${gapColors(gaps[i]).dot}`}
              style={{ boxShadow: '0 0 0 1px #E2DACE' }} />
          </div>
        ))}
      </div>
      <div className="relative mt-1" style={{ height: 34 }}>
        {sortedGames.map((g, i) => (
          <div key={g.id}
            className={`absolute whitespace-nowrap text-[9.5px] font-semibold ${gapColors(gaps[i]).text}`}
            style={{ left: `${pcts[i]}%`, transform: 'translateX(-50%)', top: rows[i] * 16 }}>
            {format(parseISO(g.game_date), 'd MMM')}
          </div>
        ))}
      </div>
    </div>
  )
}

// ── Tournament block ───────────────────────────────────────────────
function TournamentBlock({
  tournament, games, announcedSet, today, isAdmin, isGC, players, stats, bookingCaptainMap, forceOpenToken,
}: {
  tournament: NonNullable<Booking['tournament']>
  games: Booking[]
  announcedSet: Set<string>
  today: string
  isAdmin: boolean
  isGC: boolean
  players: TournamentPlayer[]
  stats: Record<string, PlayerStatsTotals>
  bookingCaptainMap: Record<string, SquadCaptain>
  forceOpenToken?: number
}) {
  const [open, setOpen]               = useState(false)
  const [playersOpen, setPlayersOpen] = useState(false)
  const [statsSortKey, setStatsSortKey] = useState<StatsSortKey>('mvpPoints')
  const [statsSortDir, setStatsSortDir] = useState<'asc' | 'desc'>('desc')

  function handleStatsSort(key: StatsSortKey) {
    if (key === statsSortKey) {
      setStatsSortDir(d => d === 'asc' ? 'desc' : 'asc')
    } else {
      setStatsSortKey(key)
      // Name defaults A→Z; every numeric column defaults highest-first —
      // that's the direction someone clicking a stat header actually wants.
      setStatsSortDir(key === 'name' ? 'asc' : 'desc')
    }
  }

  // A "view" click from the Captain Bandwidth cards bumps forceOpenToken —
  // expand this block even if the viewer had previously collapsed it manually
  useEffect(() => {
    if (forceOpenToken !== undefined) setOpen(true)
  }, [forceOpenToken])

  const completed = games.filter(g => g.game_date < today)
  const scheduled = games.filter(g => g.game_date >= today)
  const [totalLeagueGames, setTotalLeagueGames] = useState<number | null>(
    tournament.total_league_games ?? null
  )
  const totalLeague = totalLeagueGames ?? games.length
  const unbooked    = Math.max(0, totalLeague - games.length)

  const allDates    = games.map(g => g.game_date).sort()
  const gap         = avgGapWeeks(allDates)

  // Slot balance counts
  const slotCounts = Object.fromEntries(
    ALL_SLOTS.map(s => [`${s.day}-${s.time}`, 0])
  ) as Record<SlotKey, number>
  games.forEach(g => {
    const k = slotKey(g.game_date, g.slot_time)
    if (slotCounts[k] !== undefined) slotCounts[k]++
  })
  const maxSlotCount  = Math.max(...Object.values(slotCounts), 1)
  const dominantSlot  = Object.entries(slotCounts).reduce((a, b) => b[1] > a[1] ? b : a, ['', 0])[0]
  const isSlotImbalanced = maxSlotCount > Math.ceil(games.length / 2) && games.length >= 3

  const sortedGames = [...games].sort((a, b) => a.game_date.localeCompare(b.game_date))
  const { gaps, fastestGap, slowestGap, isUneven } = computeGapStats(sortedGames)

  const lastGameDate = sortedGames.length > 0
    ? sortedGames[sortedGames.length - 1].game_date
    : today

  const pace = paceSignal(gap, unbooked, lastGameDate, today)

  // Tournament format mix — use Array.from instead of spread on Set (downlevel compat)
  const tournamentFormats = Array.from(
    new Set(games.map(g => g.format).filter((f): f is string => !!f))
  )
  const activeFormats = tournamentFormats.length === 0 ? ['T20', 'T30'] : tournamentFormats

  // Players with no synced stats always sort to the bottom, regardless of
  // direction or column — "No stats synced" isn't a value on any stat's
  // scale, so it shouldn't jump to the top under a descending numeric sort.
  const sortedPlayers = [...players].sort((a, b) => {
    const factor = statsSortDir === 'asc' ? 1 : -1
    if (statsSortKey === 'name') return factor * a.name.localeCompare(b.name)
    const aStat = stats[a.id] ?? null
    const bStat = stats[b.id] ?? null
    if (!aStat && !bStat) return a.name.localeCompare(b.name)
    if (!aStat) return 1
    if (!bStat) return -1
    const col = STAT_COLUMNS.find(c => c.key === statsSortKey)!
    const aVal = col.value(aStat) ?? -Infinity
    const bVal = col.value(bStat) ?? -Infinity
    return factor * (aVal - bVal) || a.name.localeCompare(b.name)
  })

  return (
    <div id={`tournament-block-${tournament.id}`} className="bg-white border border-parchment-3 rounded-2xl mb-4 overflow-hidden scroll-mt-24">

      {/* Header — a div (not <button>) since it now contains the nested
          interactive Share button; role/tabIndex/onKeyDown keep it keyboard
          operable the same way a <button> would be. */}
      <div role="button" tabIndex={0}
        className="w-full text-left px-4 py-3 hover:bg-parchment-2 transition-colors cursor-pointer"
        onClick={() => setOpen(v => !v)}
        onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setOpen(v => !v) } }}>
        <div className="flex items-start gap-3">
          <span className="text-amber-500 mt-0.5">🏆</span>
          <div className="flex-1 min-w-0">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2 flex-wrap min-w-0">
                {tournament.cricheroes_points_table_url ? (
                  <a
                    href={tournament.cricheroes_points_table_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="font-cinzel text-sm font-bold text-ink underline decoration-gold underline-offset-2"
                  >
                    {tournament.name}
                  </a>
                  ) : (
                  <span className="font-cinzel text-sm font-bold text-ink">{tournament.name}</span>
                )}
                {tournamentFormats.length > 0 && (
                  <span className="font-rajdhani text-[10px] font-bold px-2 py-0.5 rounded-full bg-blue-50 text-blue-700">
                    {tournamentFormats.join(' / ')}
                  </span>
                )}
                <span className={`font-rajdhani text-[10px] px-2 py-0.5 rounded-full ${pace.bg} ${pace.txt}`}>{pace.label}</span>
              </div>
              {(isAdmin || isGC) && (
                <TournamentShareButton
                  tournamentId={tournament.id}
                  className="flex-shrink-0 text-stone-400 hover:text-emerald-700 transition-colors"
                />
              )}
            </div>
            <p className="font-rajdhani text-xs text-stone-500 mt-0.5">
              {tournament.captains && <>Captain: <PlayerNameLink name={tournament.captains.name} playerId={tournament.captains.player_id} className="text-blue-700" /> &nbsp;·&nbsp;</>}
              Avg gap: <span className="text-ink font-semibold">{gap !== null ? `${gap} week${gap !== 1 ? 's' : ''}` : 'N/A'}</span>
            </p>
            <div className="flex gap-1.5 flex-wrap mt-2">
              <span className="font-rajdhani text-[10px] px-2 py-0.5 rounded-full bg-amber-50 text-amber-700">{scheduled.length} upcoming</span>
              <span className="font-rajdhani text-[10px] px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700">{completed.length} past</span>
              {unbooked > 0 && (
                <span className="font-rajdhani text-[10px] px-2 py-0.5 rounded-full bg-stone-100 text-stone-600">{unbooked} unbooked</span>
              )}
            </div>
          </div>
          <span className="text-stone-400 flex-shrink-0">{open ? '▲' : '▼'}</span>
        </div>
      </div>

      {/* Collapsed mini bar */}
      {!open && (
        <div className="px-4 pb-3">
          <div className="flex gap-0.5 h-2 rounded-full overflow-hidden bg-parchment-3 mt-1">
            {sortedGames.map(g => (
              <div key={g.id} className={`flex-1 ${g.game_date < today ? 'bg-emerald-600' : 'bg-amber-600'}`} />
            ))}
            {Array.from({ length: unbooked }).map((_, i) => (
              <div key={`u${i}`} className="flex-1 bg-stone-400 opacity-50" />
            ))}
          </div>
        </div>
      )}

      {open && (
        <div className="bg-parchment">

          {/* Matches — tabbed (Upcoming / Past Matches / Unbooked), replacing the old 4-card stat grid */}
          <div className="px-4 pt-4">
            <div className="flex items-center justify-between gap-2 mb-2.5">
              <p className="text-[15px] font-bold text-ink">Matches</p>
              {isAdmin ? (
                <div className="flex items-center gap-1 text-xs text-stone-500">
                  <InlineGameCountEditor tournamentId={tournament.id} currentValue={totalLeagueGames} onSaved={setTotalLeagueGames} /> league games
                </div>
              ) : (
                <span className="text-xs text-stone-500">{totalLeague} league games</span>
              )}
            </div>
            <MatchTabsSection
              upcoming={scheduled}
              pastMatches={completed}
              unbooked={unbooked}
              sortedGames={sortedGames}
              bookingCaptainMap={bookingCaptainMap}
              tournamentId={tournament.id}
              tournamentName={tournament.name}
              organiserName={tournament.organiser_name}
              organiserContact={tournament.organiser_contact}
              canSuggestSlots={isAdmin || isGC}
              showFormatOnRow={tournamentFormats.length > 1}
            />

            {/* Pace insight — also carries the organiser name, moved down from the header.
                The old WhatsApp "ping about pace" nudge was dropped in favour of the more actionable
                Suggest-slots WhatsApp nudge on the Unbooked tab, which covers the same need. The
                share-tournament-card action lives in the header now (top-right, next to the title). */}
            {(gap !== null || tournament.organiser_name) && (
              <div className="mt-2.5 bg-amber-50 border border-amber-200 rounded-2xl p-4">
                <div className="flex items-start justify-between gap-3 flex-wrap">
                  <div className="flex gap-5 flex-wrap">
                    {gap !== null && (
                      <div>
                        <p className="text-[10px] font-bold uppercase tracking-wide text-amber-700">Avg gap</p>
                        <p className="font-cinzel text-xl font-extrabold text-amber-800 mt-0.5">{gap}w</p>
                      </div>
                    )}
                    {fastestGap !== null && (
                      <div>
                        <p className="text-[10px] font-bold uppercase tracking-wide text-stone-500">Fastest</p>
                        <p className="font-cinzel text-xl font-extrabold text-red-700 mt-0.5">{fastestGap}w</p>
                      </div>
                    )}
                    {slowestGap !== null && (
                      <div>
                        <p className="text-[10px] font-bold uppercase tracking-wide text-stone-500">Slowest</p>
                        <p className="font-cinzel text-xl font-extrabold text-amber-700 mt-0.5">{slowestGap}w</p>
                      </div>
                    )}
                  </div>
                  {tournament.organiser_name && (
                    <span className="text-xs text-stone-600 flex-shrink-0">
                      Organiser: <span className="text-stone-800 font-semibold">{tournament.organiser_name}</span>
                    </span>
                  )}
                </div>
                {gap !== null && (
                  <p className="text-[13px] leading-relaxed text-amber-900 mt-3">
                    {isUneven
                      ? `Games are unevenly spaced (${fastestGap}w–${slowestGap}w) — ask the organiser to smooth scheduling closer to the ${gap}w average.`
                      : `Games are evenly paced around the ${gap}w average — no action needed.`}
                  </p>
                )}
              </div>
            )}
          </div>

          {/* Pace timeline */}
          <GameTimelineCard sortedGames={sortedGames} gaps={gaps} avgGap={gap} />

          {/* Slot balance — grouped by day */}
          <SlotBalanceByDay
            slotCounts={slotCounts}
            maxSlotCount={maxSlotCount}
            activeFormats={activeFormats}
            isSlotImbalanced={isSlotImbalanced}
            dominantSlot={dominantSlot}
            gamesLength={games.length}
          />

          {/* Player Stats — collapsible, sourced from announced squads.
              Stats are aggregated purely from THIS tournament's own synced
              matches via getLeaderboard({ tournamentId }) — never
              career-wide analytics. Trimmed to M/R/Wk/Dis/MVP — the
              headline numbers — rather than Captains Corner's fuller
              M/R/Avg/SR/Wk/Econ/Ct "Form" panel (ContextStatsTable in
              CaptainsCornerGrid.tsx), sorted by MVP descending by default
              since that's the one figure meant to rank players against
              each other. A player can be represented here (they were in an
              announced squad) but still show "No stats synced" if none of
              their matches in this tournament have a scorecard reconciled
              yet — those rows always sort to the bottom. */}
          <div className="px-4 py-4 border-t border-parchment-3 mt-2">
            <button
              onClick={() => setPlayersOpen(v => !v)}
              className="flex items-center gap-1 text-xs font-bold uppercase tracking-wide text-stone-500 mb-2 w-full text-left"
            >
              <span>{playersOpen ? '▲' : '▶'}</span>
              <span>Player Stats — {players.length}</span>
            </button>
            {playersOpen && (
              players.length > 0 ? (
                <div className="rounded-lg border border-parchment-3 bg-white overflow-x-auto">
                  <table className="w-full" style={{ fontVariantNumeric: 'tabular-nums' }}>
                    <thead>
                      <tr className="border-b border-parchment-3">
                        <th
                          onClick={() => handleStatsSort('name')}
                          className="font-rajdhani text-[9px] font-bold uppercase tracking-wide text-right pl-3 pr-2 py-1.5 cursor-pointer select-none text-stone-500 hover:text-gold-dim whitespace-nowrap"
                        >
                          Player{statsSortKey === 'name' && (statsSortDir === 'asc' ? ' ▲' : ' ▼')}
                        </th>
                        {STAT_COLUMNS.map(col => (
                          <th
                            key={col.key}
                            onClick={() => handleStatsSort(col.key)}
                            className="font-rajdhani text-[9px] font-bold uppercase tracking-wide text-right pr-2 py-1.5 cursor-pointer select-none text-stone-500 hover:text-gold-dim whitespace-nowrap"
                          >
                            {col.label}{statsSortKey === col.key && (statsSortDir === 'asc' ? ' ▲' : ' ▼')}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {sortedPlayers.map(p => {
                        const stat = stats[p.id] ?? null
                        return (
                          <tr key={p.id} className="border-t border-parchment-3 first:border-t-0">
                            <td className="font-rajdhani text-[11px] font-semibold text-ink text-right pl-3 pr-2 py-1.5 whitespace-nowrap">
                              <span className="hidden sm:inline">
                                <PlayerNameLink name={p.name} playerId={p.id} cricHeroesUrl={p.cricheroes_url} className="text-blue-700" />
                              </span>
                              <span className="sm:hidden">
                                <PlayerNameLink name={mobileMatrixName(p.name)} playerId={p.id} cricHeroesUrl={p.cricheroes_url} className="text-blue-700" />
                              </span>
                            </td>
                            {stat == null ? (
                              <td colSpan={STAT_COLUMNS.length} className="text-[10.5px] italic text-stone-400 pr-2 py-1.5 text-right">No stats synced</td>
                            ) : (
                              STAT_COLUMNS.map(col => {
                                const display = statCell(col.value(stat)).text
                                return (
                                  <td key={col.key} className={`font-cinzel text-[11.5px] font-bold text-right pr-2 py-1.5 ${
                                    display === '—' ? 'text-stone-400' : 'text-ink'
                                  }`}>
                                    {display}
                                  </td>
                                )
                              })
                            )}
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              ) : (
                <p className="text-xs text-stone-500">No announced squads yet for this tournament.</p>
              )
            )}
            <p className="text-center text-[13px] font-semibold text-stone-500 mt-4">
              {players.length} player{players.length !== 1 ? 's' : ''} represented across this tournament
            </p>
          </div>
        </div>
      )}
    </div>
  )
}

// ── Tabs — Upcoming / Past Matches / Unbooked (warm-light cards) ────
// Naming mirrors /fixtures ("Upcoming" / "Past Matches"). Upcoming is first
// since that's what captains care about most day-to-day.
function MatchTabsSection({
  upcoming, pastMatches, unbooked, sortedGames, bookingCaptainMap,
  tournamentId, tournamentName, organiserName, organiserContact, canSuggestSlots,
  showFormatOnRow,
}: {
  upcoming: Booking[]
  pastMatches: Booking[]
  unbooked: number
  sortedGames: Booking[]
  bookingCaptainMap: Record<string, SquadCaptain>
  tournamentId: string
  tournamentName: string
  organiserName: string | null
  organiserContact: string | null
  canSuggestSlots: boolean
  // Format is shown once at the tournament header now (see TournamentBlock).
  // Only repeat it per-row when this tournament actually mixes formats —
  // otherwise it's the same value on every row and just adds noise.
  showFormatOnRow: boolean
}) {
  type TabKey = 'upcoming' | 'past' | 'unbooked'
  // Upcoming or Unbooked — whichever is actionable — take priority over
  // Past Matches, which is read-only and the least useful default view.
  const [activeTab, setActiveTab] = useState<TabKey>(
    upcoming.length > 0 ? 'upcoming' : unbooked > 0 ? 'unbooked' : 'past'
  )

  function gapLabelFor(g: Booking): string {
    const idx = sortedGames.findIndex(x => x.id === g.id)
    if (idx <= 0) return '—'
    return `${Math.round(
      differenceInDays(parseISO(sortedGames[idx].game_date), parseISO(sortedGames[idx - 1].game_date)) / 7
    )}w`
  }

  function gapColors(gapStr: string): { bg: string; text: string } {
    const n = parseInt(gapStr)
    if (isNaN(n))  return { bg: 'bg-stone-100', text: 'text-stone-600' }
    if (n <= 1)    return { bg: 'bg-red-50',    text: 'text-red-700'   }
    if (n >= 3)    return { bg: 'bg-amber-50',  text: 'text-amber-700' }
    return { bg: 'bg-emerald-50', text: 'text-emerald-700' }
  }

  const tabs: Array<{ key: TabKey; label: string; count: number }> = [
    { key: 'upcoming', label: 'Upcoming',     count: upcoming.length },
    { key: 'past',     label: 'Past Matches', count: pastMatches.length },
    { key: 'unbooked', label: 'Unbooked',     count: unbooked },
  ]

  return (
    <div>
      <div className="flex bg-parchment-2 rounded-xl p-1 gap-1">
        {tabs.map(t => {
          const disabled = t.key === 'unbooked' && t.count === 0
          return (
            <button key={t.key} type="button" disabled={disabled}
              onClick={() => setActiveTab(t.key)}
              className={`flex-1 rounded-lg py-2.5 text-[12.5px] font-bold transition-colors ${
                disabled
                  ? 'text-stone-300 cursor-not-allowed'
                  : activeTab === t.key ? 'bg-white text-ink shadow-sm' : 'text-stone-500'
              }`}>
              {t.label} [{t.count}]
            </button>
          )
        })}
      </div>

      <div className="flex flex-col gap-2.5 mt-3">
        {activeTab === 'past' && (
          pastMatches.length === 0
            ? <p className="text-xs text-stone-500 py-3">No past matches yet.</p>
            : pastMatches.map(g => {
                const d = parseISO(g.game_date)
                const captain = bookingCaptainMap[g.id] ?? null
                const gs = gapLabelFor(g)
                const c  = gapColors(gs)
                const inner = (
                  <div className="flex items-center gap-3.5">
                    <div className="text-center w-11 flex-shrink-0">
                      <p className="font-cinzel text-xl font-extrabold text-ink leading-none">{format(d, 'd')}</p>
                      <p className="text-[11px] font-semibold text-stone-500 uppercase mt-1">{format(d, 'MMM')}</p>
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-[13.5px] font-bold text-ink">{format(d, 'EEE')} · {g.slot_time}</p>
                      {g.match_result && <div className="mt-0.5"><ResultBadge result={g.match_result} /></div>}
                      <p className="text-xs text-stone-500 mt-0.5">
                        {showFormatOnRow && <>{g.format} · </>}Captain{' '}
                        {captain
                          ? <PlayerNameLink name={captain.name} playerId={captain.id} cricHeroesUrl={captain.cricheroes_url} className="text-blue-700" />
                          : 'Unassigned'}
                      </p>
                    </div>
                    <span className={`${c.bg} ${c.text} text-[11.5px] font-bold px-2.5 py-1 rounded-full flex-shrink-0 text-center`}>
                      {gs === '—' ? 'first' : `${gs} gap`}
                    </span>
                  </div>
                )
                // Links into the Hub's own match page (scorecard synced there) rather
                // than out to CricHeroes — keeps captains self-reliant on the Hub.
                return (
                  <Link key={g.id} href={`/matches/history/${g.id}`}
                    className="block bg-white border border-parchment-3 rounded-2xl px-4 py-3.5 hover:border-gold-dim transition-colors">
                    {inner}
                  </Link>
                )
              })
        )}
        {activeTab === 'upcoming' && (
          upcoming.length === 0
            ? <p className="text-xs text-stone-500 py-3">No upcoming games yet.</p>
            : upcoming.map(g => {
                const d  = parseISO(g.game_date)
                const gs = gapLabelFor(g)
                const c  = gapColors(gs)
                const inner = (
                  <div className="flex items-center gap-3.5">
                    <div className="text-center w-11 flex-shrink-0">
                      <p className="font-cinzel text-xl font-extrabold text-ink leading-none">{format(d, 'd')}</p>
                      <p className="text-[11px] font-semibold text-stone-500 uppercase mt-1">{format(d, 'MMM')}</p>
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-[13.5px] font-bold text-ink">{format(d, 'EEE')} · {g.slot_time}</p>
                      {showFormatOnRow && <p className="text-xs text-stone-500 mt-0.5">{g.format}</p>}
                    </div>
                    <span className={`${c.bg} ${c.text} text-[11.5px] font-bold px-2.5 py-1 rounded-full flex-shrink-0 text-center`}>
                      {gs === '—' ? 'first' : `${gs} gap`}
                    </span>
                  </div>
                )
                return g.cricheroes_url ? (
                  <a key={g.id} href={g.cricheroes_url} target="_blank" rel="noopener noreferrer"
                    className="block bg-white border border-parchment-3 rounded-2xl px-4 py-3.5 hover:border-gold-dim transition-colors">
                    {inner}
                  </a>
                ) : (
                  <div key={g.id} className="bg-white border border-parchment-3 rounded-2xl px-4 py-3.5">
                    {inner}
                  </div>
                )
              })
        )}
        {activeTab === 'unbooked' && (
          unbooked === 0
            ? <p className="text-xs text-stone-500 py-3">No unbooked games — fully booked.</p>
            : (
              <>
                <div className="bg-parchment-2 border border-parchment-3 rounded-2xl px-4 py-3">
                  <p className="text-xs font-semibold text-stone-600">
                    ○ {unbooked} unbooked game{unbooked !== 1 ? 's' : ''} — date &amp; slot not yet booked
                  </p>
                </div>
                {canSuggestSlots && (
                  <SuggestedSlotsPanel
                    tournamentId={tournamentId}
                    tournamentName={tournamentName}
                    organiserName={organiserName}
                    organiserContact={organiserContact}
                  />
                )}
              </>
            )
        )}
      </div>
    </div>
  )
}

// ── Suggested slots for unbooked games — GC/Admin only ────────────────
// Fetches candidates from the server (which reuses the R1-R6 validation
// engine) on demand rather than on mount, since this hits Supabase with a
// wider club-wide query than the rest of the page needs.
// No slot_time — every suggested date is a fully open day, so any
// slot_time on it would work; showing one specific time would wrongly
// read as a constraint. See the API route's header comment.
interface SuggestedSlot { game_date: string; day: 'Sat' | 'Sun' }

function SuggestedSlotsPanel({
  tournamentId, tournamentName, organiserName, organiserContact,
}: {
  tournamentId: string
  tournamentName: string
  organiserName: string | null
  organiserContact: string | null
}) {
  const [suggestions, setSuggestions] = useState<SuggestedSlot[] | null>(null)
  const [monthlyCap, setMonthlyCap] = useState(2)
  const [overCapMonths, setOverCapMonths] = useState<string[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  async function loadSuggestions() {
    setLoading(true); setError('')
    try {
      const res = await fetch(`/api/tournaments/${tournamentId}/suggested-slots`)
      const data = await res.json()
      if (!res.ok) { setError(data.error ?? 'Could not load suggestions'); return }
      setSuggestions(data.suggestions ?? [])
      setMonthlyCap(data.monthlyCap ?? 2)
      setOverCapMonths(data.overCapMonths ?? [])
    } catch {
      setError('Network error')
    } finally {
      setLoading(false)
    }
  }

  // Months where the club's own per-tournament monthly cap means not every
  // suggested date in that month can actually be booked — the extra options
  // are backups in case an earlier one in the same month falls through, not
  // a guarantee all of them are simultaneously bookable. Named explicitly by
  // date rather than "the options below" — that phrasing read as applying to
  // every suggestion shown (including unaffected months), when the cap is
  // really scoped to just the listed dates that share an over-cap month.
  const capNote = overCapMonths.length > 0 && suggestions
    ? overCapMonths
        .map(m => {
          const datesInMonth = suggestions
            .filter(s => s.game_date.startsWith(m))
            .map(s => `${s.day} ${format(parseISO(s.game_date), 'd MMM')}`)
          return `Of ${datesInMonth.join(', ')}, only ${monthlyCap} can actually be booked (${tournamentName} is capped at ${monthlyCap} confirmed games per month).`
        })
        .join(' ')
    : ''

  // This panel only mounts once the viewer is actually on the Unbooked tab
  // (see canSuggestSlots gating in MatchTabsSection), so fetching immediately
  // here already is the lazy behaviour — no extra click needed to see it.
  useEffect(() => {
    loadSuggestions()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tournamentId])

  const waMessage = suggestions && suggestions.length > 0
    ? [
        `Hi${organiserName ? ' ' + organiserName : ''}! For ${tournamentName}, here are our next earliest fully open days on our end:`,
        ...suggestions.map(s => `• ${s.day} ${format(parseISO(s.game_date), 'd MMM')}`),
        ...(capNote ? [``, capNote] : []),
        `Let us know which of these works and we'll get it locked in. Thanks!`,
      ].join('\n')
    : ''

  const waLink = organiserContact && waMessage
    ? `https://wa.me/${organiserContact.replace(/\D/g, '')}?text=${encodeURIComponent(waMessage)}`
    : null

  return (
    <div className="mt-2.5 bg-parchment-2 border border-parchment-3 rounded-2xl px-4 py-3.5">
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs font-bold text-stone-700">Suggest slots to organiser</p>
        {loading && <span className="text-[11px] text-stone-400 flex-shrink-0">Finding slots…</span>}
        {error && (
          <button type="button" onClick={loadSuggestions}
            className="text-[11px] font-bold text-gold-dim hover:text-gold flex-shrink-0">
            Retry
          </button>
        )}
      </div>
      {!loading && !error && (
        <p className="text-[11px] text-stone-500 mt-0.5">
          Only days with nothing booked at all — a day with any existing game on it, even at a different time, isn't suggested.
        </p>
      )}
      {error && <p className="text-[11px] text-red-700 mt-1.5">{error}</p>}
      {suggestions && (
        suggestions.length === 0 ? (
          <p className="text-xs text-stone-500 mt-2">No open slots found that satisfy the booking rules in the next few months.</p>
        ) : (
          <>
            <div className="flex flex-col gap-1.5 mt-2">
              {suggestions.map(s => (
                <p key={s.game_date} className="text-xs text-stone-700">
                  <span className="font-semibold text-ink">{s.day} {format(parseISO(s.game_date), 'd MMM')}</span>
                </p>
              ))}
            </div>
            {capNote && (
              <p className="text-[11px] text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-2.5 py-1.5 mt-2">
                {capNote}
              </p>
            )}
            {waLink && (
              <a href={waLink} target="_blank" rel="noopener noreferrer"
                className="mt-2.5 w-full flex items-center justify-center gap-2 bg-emerald-100 text-emerald-700 rounded-xl py-2 text-xs font-bold hover:bg-emerald-200 transition-colors">
                {WA_ICON} Suggest these slots via WhatsApp
              </a>
            )}
            {!organiserContact && (
              <p className="text-[10px] text-stone-400 mt-1.5">Add organiser WhatsApp in /admin/tournaments to enable sending.</p>
            )}
          </>
        )
      )}
    </div>
  )
}

// ── Slot balance — grouped by day (warm-light cards) ─────────────────
function SlotBalanceByDay({
  slotCounts, maxSlotCount, activeFormats, isSlotImbalanced, dominantSlot, gamesLength,
}: {
  slotCounts: Record<SlotKey, number>
  maxSlotCount: number
  activeFormats: string[]
  isSlotImbalanced: boolean
  dominantSlot: string
  gamesLength: number
}) {
  const days: Array<'Sat' | 'Sun'> = ['Sat', 'Sun']
  return (
    <div className="px-4 pt-6 pb-2">
      <p className="text-[15px] font-bold text-ink mb-3">Slot balance across this tournament</p>
      <div className="flex flex-col gap-3">
        {days.map(day => {
          // Only slots valid for this tournament's actual format(s) — cuts N/A rows to save space
          const rows = ALL_SLOTS.filter(s => s.day === day && s.validFor.some(f => activeFormats.includes(f)))
          return (
            <div key={day} className="bg-white border border-parchment-3 rounded-2xl px-3.5 pb-1">
              <p className="text-xs font-bold uppercase tracking-wide text-stone-500 pt-2.5 pb-1.5">{day}</p>
              {rows.map(s => {
                const k: SlotKey = `${s.day}-${s.time}`
                const count      = slotCounts[k]
                const pct        = count > 0 ? Math.max(12, Math.round((count / maxSlotCount) * 100)) : 0
                return (
                  <div key={k} className="flex items-center gap-3 py-1.5 border-t border-parchment-2 first:border-t-0">
                    <span className="w-[52px] flex-shrink-0 text-[12.5px] font-semibold text-stone-700">{s.time}</span>
                    <div className="flex-1 h-2 bg-parchment-2 rounded-full overflow-hidden">
                      {count > 0 && (
                        <div className={`h-full rounded-full ${count === maxSlotCount ? 'bg-emerald-600' : 'bg-amber-600'}`}
                          style={{ width: `${pct}%` }} />
                      )}
                    </div>
                    <span className="w-[18px] flex-shrink-0 text-sm font-extrabold text-ink text-right">
                      {count}
                    </span>
                  </div>
                )
              })}
            </div>
          )
        })}
      </div>
      {isSlotImbalanced && (
        <p className="text-xs text-blue-700 mt-2.5">
          ↗ {dominantSlot} has {maxSlotCount} of {gamesLength} games — unbooked games should favour other slots
        </p>
      )}
    </div>
  )
}

// ── Root client component ──────────────────────────────────────────
export function TournamentPlannerClient({
  bookings, announcedBookingIds, captains, today, viewerRole, tournamentPlayersMap, tournamentStatsMap, bookingCaptainMap,
}: Props) {
  const announcedSet = useMemo(() => new Set(announcedBookingIds), [announcedBookingIds])
  const [showUpcoming,  setShowUpcoming]  = useState(true)
  const [showOngoing,   setShowOngoing]   = useState(true)
  const [showCompleted, setShowCompleted] = useState(false)

  // "view" click from a Captain Bandwidth tournament card — scrolls to and expands
  // the matching TournamentBlock below. Token bumps on every click (even repeat
  // clicks on the same tournament) so a manually re-collapsed block reopens too.
  const [expandRequest, setExpandRequest] = useState<{ id: string; token: number } | null>(null)
  const expandTokenRef = useRef(0)

  const tournamentMap = useMemo(() => {
    const map = new Map<string, { tournament: NonNullable<Booking['tournament']>; games: Booking[] }>()
    bookings.forEach(b => {
      if (!b.tournament) return
      const tid = b.tournament.id
      if (!map.has(tid)) map.set(tid, { tournament: b.tournament, games: [] })
      map.get(tid)!.games.push(b)
    })
    return map
  }, [bookings])

  // Classified + sorted independent of the show/hide filters, so the filter
  // cards below can display a true count per bucket regardless of which
  // buckets are currently shown.
  const classifiedTournaments = useMemo(() =>
    Array.from(tournamentMap.values())
      .map(({ tournament, games }) => {
        const totalLeague    = tournament.total_league_games ?? games.length
        const completedGames = games.filter(g => g.game_date < today)
        const scheduledGames = games.filter(g => g.game_date >= today)
        const isCompleted    = completedGames.length >= totalLeague && scheduledGames.length === 0
        const isUpcoming     = completedGames.length === 0
        const isOngoing      = !isCompleted && !isUpcoming

        // Priority signal for sorting — "overdue relative to this tournament's
        // own pace" (paceSignal's Nudge/Ask-to-slow-down labels), not raw avg
        // gap or raw unbooked count alone. See the same logic driving each
        // tournament block's own pace pill.
        const sortedGames  = [...games].sort((a, b) => a.game_date.localeCompare(b.game_date))
        const gap          = avgGapWeeks(games.map(g => g.game_date).sort())
        const unbooked     = Math.max(0, totalLeague - games.length)
        const lastGameDate = sortedGames.length > 0 ? sortedGames[sortedGames.length - 1].game_date : today
        const pace         = paceSignal(gap, unbooked, lastGameDate, today)
        const priorityRank = pace.label === 'Nudge to schedule' ? 0
          : pace.label === 'Ask to slow down' ? 1
          : 2

        return { tournament, games, isCompleted, isUpcoming, isOngoing, priorityRank }
      })
      .sort((a, b) => a.priorityRank - b.priorityRank || b.games.length - a.games.length),
    [tournamentMap, today]
  )

  const tournamentCounts = useMemo(() => ({
    upcoming:  classifiedTournaments.filter(t => t.isUpcoming).length,
    ongoing:   classifiedTournaments.filter(t => t.isOngoing).length,
    completed: classifiedTournaments.filter(t => t.isCompleted).length,
  }), [classifiedTournaments])

  const sortedTournaments = useMemo(() =>
    classifiedTournaments.filter(t => {
      if (t.isCompleted) return showCompleted
      if (t.isUpcoming)  return showUpcoming
      if (t.isOngoing)   return showOngoing
      return true
    }),
    [classifiedTournaments, showUpcoming, showOngoing, showCompleted]
  )

  function handleViewTournament(tournamentId: string) {
    // A tournament under a captain's "By tournament" list is always
    // upcoming or ongoing (see tournamentBreakdown's own outstanding>0 ||
    // unbooked>0 filter in BandwidthSection) — but if the viewer has toggled
    // that bucket's filter card off, the matching block below doesn't exist
    // to scroll to. Force its bucket back on so "view" never dead-ends.
    const entry = classifiedTournaments.find(t => t.tournament.id === tournamentId)
    if (entry?.isUpcoming && !showUpcoming) setShowUpcoming(true)
    if (entry?.isOngoing  && !showOngoing)  setShowOngoing(true)
    if (entry?.isCompleted && !showCompleted) setShowCompleted(true)

    expandTokenRef.current += 1
    setExpandRequest({ id: tournamentId, token: expandTokenRef.current })
    requestAnimationFrame(() => scrollToTournament(tournamentId))
  }

  const isCaptainView    = viewerRole.isCaptain && !!viewerRole.captainId
  const myTournaments    = isCaptainView
    ? sortedTournaments.filter(({ tournament }) => tournament?.captain_id === viewerRole.captainId)
    : sortedTournaments
  const otherTournaments = isCaptainView
    ? sortedTournaments.filter(({ tournament }) => tournament?.captain_id !== viewerRole.captainId)
    : []

  return (
    <div>
      <BandwidthSection
        captains={captains}
        bookings={bookings}
        announcedSet={announcedSet}
        today={today}
        viewerCaptainId={viewerRole.captainId}
        onViewTournament={handleViewTournament}
      />

      {/* Tournament filter — same stat-card look as the Upcoming/Unbooked
          cards on each captain's bandwidth card above, rather than plain
          checkboxes. Each card still toggles show/hide for its bucket —
          same behaviour as before, just card-styled. */}
      <div className="flex items-center gap-3 mb-5 flex-wrap">
        <span className="font-rajdhani text-[10px] uppercase tracking-widest text-stone-500">Show:</span>
        <button type="button" onClick={() => setShowUpcoming(v => !v)}
          className={`rounded-lg border px-3 py-2 text-left transition-colors min-w-[84px] ${
            showUpcoming ? 'bg-amber-50 border-amber-200' : 'bg-parchment-2 border-parchment-3 opacity-50 hover:opacity-75'
          }`}>
          <p className={`font-cinzel text-lg font-bold leading-tight ${showUpcoming ? 'text-amber-700' : 'text-stone-500'}`}>
            {tournamentCounts.upcoming}
          </p>
          <p className={`font-rajdhani text-[10px] font-bold tracking-widest uppercase ${showUpcoming ? 'text-amber-700' : 'text-stone-500'}`}>
            Upcoming
          </p>
        </button>
        <button type="button" onClick={() => setShowOngoing(v => !v)}
          className={`rounded-lg border px-3 py-2 text-left transition-colors min-w-[84px] ${
            showOngoing ? 'bg-emerald-50 border-emerald-200' : 'bg-parchment-2 border-parchment-3 opacity-50 hover:opacity-75'
          }`}>
          <p className={`font-cinzel text-lg font-bold leading-tight ${showOngoing ? 'text-emerald-700' : 'text-stone-500'}`}>
            {tournamentCounts.ongoing}
          </p>
          <p className={`font-rajdhani text-[10px] font-bold tracking-widest uppercase ${showOngoing ? 'text-emerald-700' : 'text-stone-500'}`}>
            Ongoing
          </p>
        </button>
        <button type="button" onClick={() => setShowCompleted(v => !v)}
          className={`rounded-lg border px-3 py-2 text-left transition-colors min-w-[84px] ${
            showCompleted ? 'bg-parchment-3 border-stone-300' : 'bg-parchment-2 border-parchment-3 opacity-50 hover:opacity-75'
          }`}>
          <p className={`font-cinzel text-lg font-bold leading-tight ${showCompleted ? 'text-stone-700' : 'text-stone-500'}`}>
            {tournamentCounts.completed}
          </p>
          <p className={`font-rajdhani text-[10px] font-bold tracking-widest uppercase ${showCompleted ? 'text-stone-700' : 'text-stone-500'}`}>
            Completed
          </p>
        </button>
      </div>

      <section>
        <h2 className="font-cinzel text-xl font-bold text-gold-dim mb-1">By Tournament</h2>
        <p className="font-rajdhani text-sm text-stone-500 mb-5">
          Organiser pace, game scheduling frequency, and slot balance per tournament — tournaments flagged "Nudge to schedule" surface first.
        </p>
        {sortedTournaments.length === 0 ? (
          <p className="font-rajdhani text-sm text-stone-500">
            No tournaments match the selected filters.{' '}
            <button
              onClick={() => { setShowUpcoming(true); setShowOngoing(true); setShowCompleted(true) }}
              className="text-gold-dim underline"
            >Show all</button>
          </p>
        ) : (
          <>
            {isCaptainView && myTournaments.length > 0 && (
              <>
                <p className="font-rajdhani text-[10px] uppercase tracking-widest text-stone-500 mb-3">Your tournaments</p>
                {myTournaments.map(({ tournament, games }) => (
                  <TournamentBlock key={tournament.id} tournament={tournament} games={games}
                    announcedSet={announcedSet} today={today}
                    isAdmin={viewerRole.isAdmin} isGC={viewerRole.isGC}
                    players={tournamentPlayersMap[tournament.id] ?? []}
                    stats={tournamentStatsMap[tournament.id] ?? {}}
                    bookingCaptainMap={bookingCaptainMap}
                    forceOpenToken={expandRequest?.id === tournament.id ? expandRequest.token : undefined} />
                ))}
                {otherTournaments.length > 0 && (
                  <p className="font-rajdhani text-[10px] uppercase tracking-widest text-stone-500 mt-6 mb-3">Other tournaments</p>
                )}
              </>
            )}
            {(isCaptainView ? otherTournaments : sortedTournaments).map(({ tournament, games }) => (
              <TournamentBlock key={tournament.id} tournament={tournament} games={games}
                announcedSet={announcedSet} today={today}
                isAdmin={viewerRole.isAdmin} isGC={viewerRole.isGC}
                players={tournamentPlayersMap[tournament.id] ?? []}
                stats={tournamentStatsMap[tournament.id] ?? {}}
                bookingCaptainMap={bookingCaptainMap}
                forceOpenToken={expandRequest?.id === tournament.id ? expandRequest.token : undefined} />
            ))}
          </>
        )}
      </section>
    </div>
  )
}