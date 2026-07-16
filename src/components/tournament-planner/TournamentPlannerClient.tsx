'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { parseISO, differenceInDays, format } from 'date-fns'
import { PlayerNameLink } from '@/lib/playerLink'
import { TournamentShareButton } from './TournamentShareButton'

// ── Types ──────────────────────────────────────────────────────────
interface Booking {
  id: string
  game_date: string
  slot_time: string
  format: string | null
  tournament: {
    id: string
    name: string
    organiser_name: string | null
    organiser_contact: string | null
    total_league_games: number | null
    cricheroes_points_table_url: string | null
    captain_id: string | null
    captains: { id: string; name: string } | null
  } | null
}

interface Captain { id: string; name: string }

interface TournamentPlayer { id: string; name: string; cricheroes_url: string | null }

interface SquadCaptain { name: string; cricheroes_url: string | null }

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
    const mine      = tourneyBookings.filter(b => b.tournament?.captain_id === captain.id)
    const completed = mine.filter(b => b.game_date < today)
    const scheduled = mine.filter(b => b.game_date >= today)

    const totalLeague = Array.from(new Set(mine.map(b => b.tournament!.id)))
      .reduce((sum, tid) => {
        const t = mine.find(b => b.tournament!.id === tid)?.tournament
        return sum + (t?.total_league_games ?? mine.filter(b => b.tournament!.id === tid).length)
      }, 0)
    const unbooked  = Math.max(0, totalLeague - mine.length)
    const total     = mine.length + unbooked

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

    const doneW  = total > 0 ? (completed.length / total) * 100 : 0
    const schedW = total > 0 ? (scheduled.length / total) * 100 : 0
    const pendW  = total > 0 ? (unbooked / total) * 100 : 0
    const isLowLoad = total <= 4 && unbooked <= 1

    // Format mix for this captain's bookings
    const captainFormats = Array.from(new Set(mine.map(b => b.format).filter((f): f is string => !!f)))
    const captainActiveFormats = captainFormats.length === 0 ? ['T20', 'T30'] : captainFormats

    // Per-tournament played/outstanding/unbooked — this is what captains actually care about,
    // the slot grid below is secondary
    const byTournament = new Map<string, { tournament: NonNullable<Booking['tournament']>; games: Booking[] }>()
    mine.forEach(b => {
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
              <span className="text-emerald-700 font-semibold">{completed.length}</span> completed &nbsp;·&nbsp;
              <span className="text-amber-700 font-semibold">{scheduled.length}</span> scheduled &nbsp;·&nbsp;
              <span className="text-stone-600 font-semibold">{unbooked}</span> unbooked
            </p>
          </div>
        </div>

        {/* Bandwidth bar */}
        <div className="h-3 rounded-full bg-parchment-2 overflow-hidden flex mb-2">
          {doneW  > 0 && <div className="h-full bg-emerald-600 transition-all" style={{ width: `${doneW}%` }} />}
          {schedW > 0 && <div className="h-full bg-amber-600 transition-all"   style={{ width: `${schedW}%` }} />}
          {pendW  > 0 && <div className="h-full bg-stone-400 transition-all"   style={{ width: `${pendW}%` }} />}
        </div>

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
                    <span className="text-emerald-700 font-semibold">{played}</span> played &nbsp;·&nbsp;
                    <span className="text-amber-700 font-semibold">{outstanding}</span> outstanding &nbsp;·&nbsp;
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
          : 'Total tournament game load per captain — completed, scheduled, and unbooked.'}
      </p>

      {/* Legend */}
      <div className="flex gap-5 mb-4 flex-wrap">
        {[
          { color: 'bg-emerald-600', label: 'Completed (past date)' },
          { color: 'bg-amber-600',   label: 'Scheduled (upcoming booked)' },
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
        className="group flex items-center gap-1 font-cinzel text-[26px] font-extrabold text-ink hover:text-gold-dim transition-colors leading-none"
        title="Edit total league games"
      >
        {currentValue ?? '?'}
        <span className="text-stone-400 group-hover:text-gold-dim text-xs opacity-0 group-hover:opacity-100 transition-opacity">✎</span>
      </button>
    )
  }

  return (
    <div className="flex flex-col items-start gap-1">
      <div className="flex items-center gap-1">
        <input
          type="number" min={1} max={99} value={val} autoFocus
          onChange={e => setVal(e.target.value)}
          onKeyDown={handleKeyDown}
          className="w-14 bg-white border border-gold text-ink font-cinzel text-sm font-bold text-center rounded px-1 py-0.5 focus:outline-none"
        />
        <button onClick={handleSave} disabled={saving}
          className="text-[10px] font-bold text-emerald-700 hover:text-emerald-800 px-1.5 py-0.5 border border-emerald-300 rounded disabled:opacity-50">
          {saving ? '…' : '✓'}
        </button>
        <button onClick={() => { setEditing(false); setError('') }}
          className="text-[10px] text-stone-500 hover:text-stone-700 px-1 py-0.5">✕</button>
      </div>
      {error && <span className="text-[9px] text-red-700">{error}</span>}
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
  tournament, games, announcedSet, today, isAdmin, isGC, players, bookingCaptainMap, forceOpenToken,
}: {
  tournament: NonNullable<Booking['tournament']>
  games: Booking[]
  announcedSet: Set<string>
  today: string
  isAdmin: boolean
  isGC: boolean
  players: TournamentPlayer[]
  bookingCaptainMap: Record<string, SquadCaptain>
  forceOpenToken?: number
}) {
  const [open, setOpen]               = useState(false)
  const [playersOpen, setPlayersOpen] = useState(false)

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

   const cardUrl = typeof window !== 'undefined'
     ? `${window.location.origin}/tournament-planner/share/${tournament.id}`
     : `https://hub.spartanscricketclub.in/tournament-planner/share/${tournament.id}`
 
   const whatsappLink = pace.waLabel && tournament.organiser_contact
     ? `https://wa.me/${tournament.organiser_contact.replace(/\D/g, '')}?text=${encodeURIComponent(
         `${pace.waLabel}\n\nHere's a summary of where we stand on slots and scheduling:\n${cardUrl}`
       )}`
     : null

  const shareMessage = useMemo(() => {
    const tl           = tournament.total_league_games ?? games.length
    const completedCnt = games.filter(g => g.game_date < today).length
    const scheduledCnt = games.filter(g => g.game_date >= today).length
    const unbookedCnt  = Math.max(0, tl - games.length)
    const slotLines    = ALL_SLOTS
      .map(s => { const k: SlotKey = `${s.day}-${s.time}`; const c = slotCounts[k]; return c > 0 ? `  ${s.day} ${s.time}: ${c} game${c > 1 ? 's' : ''}` : null })
      .filter(Boolean).join('\n')
    return [
      `*${tournament.name} — Spartans CC Update*`, ``,
      `📊 Status: ${completedCnt} completed · ${scheduledCnt} scheduled · ${unbookedCnt} unbooked`,
      `⏱ Avg gap between games: ${gap !== null ? `${gap} week${gap !== 1 ? 's' : ''}` : 'N/A'}`, ``,
      `🗓 Slot breakdown so far:`, slotLines, ``,
      isSlotImbalanced
        ? `⚠️ Slot balance is skewed — would appreciate spreading remaining ${unbookedCnt} game${unbookedCnt !== 1 ? 's' : ''} across other slots.`
        : `✅ Slot balance looks good across the tournament.`,
      ``, `Could you help schedule the remaining games? Happy to discuss slots that work for both sides.`,
    ].join('\n')
  }, [tournament, games, today, gap, slotCounts, isSlotImbalanced])

  const shareLink = tournament.organiser_contact
    ? `https://wa.me/${tournament.organiser_contact.replace(/\D/g, '')}?text=${encodeURIComponent(shareMessage)}`
    : null

  return (
    <div id={`tournament-block-${tournament.id}`} className="bg-white border border-parchment-3 rounded-2xl mb-4 overflow-hidden scroll-mt-24">

      {/* Header */}
      <button className="w-full text-left px-4 py-3 hover:bg-parchment-2 transition-colors" onClick={() => setOpen(v => !v)}>
        <div className="flex items-start gap-3">
          <span className="text-amber-500 mt-0.5">🏆</span>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
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
              <span className={`font-rajdhani text-[10px] px-2 py-0.5 rounded-full ${pace.bg} ${pace.txt}`}>{pace.label}</span>
            </div>
            <p className="font-rajdhani text-xs text-stone-500 mt-0.5">
              {tournament.organiser_name && <>Organiser: <span className="text-stone-700">{tournament.organiser_name}</span> &nbsp;·&nbsp;</>}
              {tournament.captains && <>Captain: <PlayerNameLink name={tournament.captains.name} className="text-blue-700" /> &nbsp;·&nbsp;</>}
              Avg gap: <span className="text-ink font-semibold">{gap !== null ? `${gap} week${gap !== 1 ? 's' : ''}` : 'N/A'}</span>
            </p>
          </div>
          <div className="flex gap-1.5 flex-shrink-0 flex-wrap justify-end">
            <span className="font-rajdhani text-[10px] px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700">{completed.length} done</span>
            <span className="font-rajdhani text-[10px] px-2 py-0.5 rounded-full bg-amber-50 text-amber-700">{scheduled.length} sched</span>
            {unbooked > 0 && (
              <span className="font-rajdhani text-[10px] px-2 py-0.5 rounded-full bg-stone-100 text-stone-600">{unbooked} unbooked</span>
            )}
            <span className="text-stone-400 ml-1 self-center">{open ? '▲' : '▼'}</span>
          </div>
        </div>
      </button>

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

          {/* Stats grid — 2x2 */}
          <div className="px-4 pt-4">
            <div className="grid grid-cols-2 gap-2.5">
              <div className="bg-white border border-parchment-3 rounded-2xl px-4 py-3.5">
                <p className="text-[11px] font-bold tracking-wide uppercase text-stone-500">Total</p>
                {isAdmin
                  ? <InlineGameCountEditor tournamentId={tournament.id} currentValue={totalLeagueGames} onSaved={setTotalLeagueGames} />
                  : <p className="font-cinzel text-[26px] font-extrabold text-ink mt-0.5 leading-none">{totalLeague}</p>
                }
                <p className="text-xs text-stone-500 mt-1">league games</p>
              </div>
              <div className="bg-white border border-parchment-3 rounded-2xl px-4 py-3.5">
                <p className="text-[11px] font-bold tracking-wide uppercase text-stone-500">Completed</p>
                <p className="font-cinzel text-[26px] font-extrabold text-emerald-700 mt-0.5 leading-none">{completed.length}</p>
                <p className="text-xs text-stone-500 mt-1">past dates</p>
              </div>
              <div className="bg-white border border-parchment-3 rounded-2xl px-4 py-3.5">
                <p className="text-[11px] font-bold tracking-wide uppercase text-stone-500">Scheduled</p>
                <p className="font-cinzel text-[26px] font-extrabold text-blue-700 mt-0.5 leading-none">{scheduled.length}</p>
                <p className="text-xs text-stone-500 mt-1">booked, upcoming</p>
              </div>
              <div className="bg-white border border-parchment-3 rounded-2xl px-4 py-3.5">
                <p className="text-[11px] font-bold tracking-wide uppercase text-stone-500">Unbooked</p>
                <p className="font-cinzel text-[26px] font-extrabold text-ink mt-0.5 leading-none">{unbooked}</p>
                <p className="text-xs text-stone-500 mt-1">games remaining</p>
              </div>
            </div>

            {/* Pace insight */}
            {gap !== null && (
              <div className="mt-2.5 bg-amber-50 border border-amber-200 rounded-2xl p-4">
                <div className="flex gap-5 flex-wrap">
                  <div>
                    <p className="text-[10px] font-bold uppercase tracking-wide text-amber-700">Avg gap</p>
                    <p className="font-cinzel text-xl font-extrabold text-amber-800 mt-0.5">{gap}w</p>
                  </div>
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
                <p className="text-[13px] leading-relaxed text-amber-900 mt-3">
                  {isUneven
                    ? `Games are unevenly spaced (${fastestGap}w–${slowestGap}w) — ask the organiser to smooth scheduling closer to the ${gap}w average.`
                    : `Games are evenly paced around the ${gap}w average — no action needed.`}
                </p>
              </div>
            )}
          </div>

          {/* Share actions */}
          {(whatsappLink || isAdmin || isGC) && (
            <div className="px-4 pt-3 flex flex-col gap-2">
              {(isAdmin || isGC) && shareLink && (
                <TournamentShareButton
                  tournamentId={tournament.id}
                  className="w-full flex items-center justify-center gap-2 bg-ink text-white rounded-xl py-3.5 text-[15px] font-bold hover:bg-ink-2 transition-colors"
                />
              )}
              {(isAdmin || isGC) && !shareLink && (
                <p className="text-xs text-stone-500">
                  Add organiser WhatsApp in /admin/tournaments to enable sharing
                </p>
              )}
              {whatsappLink && (
                <a href={whatsappLink} target="_blank" rel="noopener noreferrer"
                  className="w-full flex items-center justify-center gap-2 bg-emerald-50 border border-emerald-200 text-emerald-700 rounded-xl py-2.5 text-sm font-bold">
                  📲 WhatsApp {tournament.organiser_name ?? 'organiser'} — {pace.label}
                </a>
              )}
            </div>
          )}

          {/* Pace timeline */}
          <GameTimelineCard sortedGames={sortedGames} gaps={gaps} avgGap={gap} />

          {/* Tabs — Completed / Scheduled */}
          <GameTabsSection
            completed={completed}
            scheduled={scheduled}
            unbooked={unbooked}
            sortedGames={sortedGames}
            bookingCaptainMap={bookingCaptainMap}
          />

          {/* Slot balance — grouped by day */}
          <SlotBalanceByDay
            slotCounts={slotCounts}
            maxSlotCount={maxSlotCount}
            activeFormats={activeFormats}
            isSlotImbalanced={isSlotImbalanced}
            dominantSlot={dominantSlot}
            gamesLength={games.length}
          />

          {/* Players represented — collapsible, sourced from announced squads */}
          <div className="px-4 py-4 border-t border-parchment-3 mt-2">
            <button
              onClick={() => setPlayersOpen(v => !v)}
              className="flex items-center gap-1 text-xs font-bold uppercase tracking-wide text-stone-500 mb-2 w-full text-left"
            >
              <span>{playersOpen ? '▲' : '▶'}</span>
              <span>Players represented — {players.length}</span>
            </button>
            {playersOpen && (
              players.length > 0 ? (
                <div className="grid grid-cols-2 gap-x-3 gap-y-1.5">
                  {players.map(p => (
                    <span key={p.id} className="text-xs text-stone-700 truncate">
                      <PlayerNameLink name={p.name} cricHeroesUrl={p.cricheroes_url} className="text-blue-700" />
                    </span>
                  ))}
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

// ── Tabs — Completed / Scheduled game lists (warm-light cards) ──────
function GameTabsSection({
  completed, scheduled, unbooked, sortedGames, bookingCaptainMap,
}: {
  completed: Booking[]
  scheduled: Booking[]
  unbooked: number
  sortedGames: Booking[]
  bookingCaptainMap: Record<string, SquadCaptain>
}) {
  const [activeTab, setActiveTab] = useState<'completed' | 'scheduled'>(
    scheduled.length > 0 ? 'scheduled' : 'completed'
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

  return (
    <div className="px-4 pt-4">
      <div className="flex bg-parchment-2 rounded-xl p-1 gap-1">
        <button type="button" onClick={() => setActiveTab('completed')}
          className={`flex-1 rounded-lg py-2.5 text-[13.5px] font-bold transition-colors ${
            activeTab === 'completed' ? 'bg-white text-ink shadow-sm' : 'text-stone-500'
          }`}>
          Completed · {completed.length}
        </button>
        <button type="button" onClick={() => setActiveTab('scheduled')}
          className={`flex-1 rounded-lg py-2.5 text-[13.5px] font-bold transition-colors ${
            activeTab === 'scheduled' ? 'bg-white text-ink shadow-sm' : 'text-stone-500'
          }`}>
          Scheduled · {scheduled.length}
        </button>
      </div>

      <div className="flex flex-col gap-2.5 mt-3">
        {activeTab === 'completed' && (
          completed.length === 0
            ? <p className="text-xs text-stone-500 py-3">No completed games yet.</p>
            : completed.map(g => {
                const d = parseISO(g.game_date)
                const captain = bookingCaptainMap[g.id] ?? null
                return (
                  <div key={g.id} className="bg-white border border-parchment-3 rounded-2xl px-4 py-3.5 flex items-center gap-3.5">
                    <div className="text-center w-11 flex-shrink-0">
                      <p className="font-cinzel text-xl font-extrabold text-ink leading-none">{format(d, 'd')}</p>
                      <p className="text-[11px] font-semibold text-stone-500 uppercase mt-1">{format(d, 'MMM')}</p>
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-[13.5px] font-bold text-ink">{format(d, 'EEE')} · {g.slot_time}</p>
                      <p className="text-xs text-stone-500 mt-0.5">
                        {g.format} · Captain{' '}
                        {captain
                          ? <PlayerNameLink name={captain.name} cricHeroesUrl={captain.cricheroes_url} className="text-blue-700" />
                          : 'Unassigned'}
                      </p>
                    </div>
                    <span className="bg-emerald-50 text-emerald-700 text-[11.5px] font-bold px-2.5 py-1 rounded-full flex-shrink-0">Done</span>
                  </div>
                )
              })
        )}
        {activeTab === 'scheduled' && (
          scheduled.length === 0
            ? <p className="text-xs text-stone-500 py-3">No scheduled games yet.</p>
            : scheduled.map(g => {
                const d  = parseISO(g.game_date)
                const gs = gapLabelFor(g)
                const c  = gapColors(gs)
                return (
                  <div key={g.id} className="bg-white border border-parchment-3 rounded-2xl px-4 py-3.5 flex items-center gap-3.5">
                    <div className="text-center w-11 flex-shrink-0">
                      <p className="font-cinzel text-xl font-extrabold text-ink leading-none">{format(d, 'd')}</p>
                      <p className="text-[11px] font-semibold text-stone-500 uppercase mt-1">{format(d, 'MMM')}</p>
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-[13.5px] font-bold text-ink">{format(d, 'EEE')} · {g.slot_time}</p>
                      <p className="text-xs text-stone-500 mt-0.5">{g.format}</p>
                    </div>
                    <span className={`${c.bg} ${c.text} text-[11.5px] font-bold px-2.5 py-1 rounded-full flex-shrink-0 text-center`}>
                      {gs === '—' ? 'first' : `${gs} gap`}
                    </span>
                  </div>
                )
              })
        )}
      </div>

      {unbooked > 0 && (
        <div className="mt-2.5 bg-parchment-2 border border-parchment-3 rounded-2xl px-4 py-3">
          <p className="text-xs font-semibold text-stone-600">
            ○ {unbooked} unbooked game{unbooked !== 1 ? 's' : ''} remaining — date &amp; slot not yet booked
          </p>
        </div>
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
  bookings, announcedBookingIds, captains, today, viewerRole, tournamentPlayersMap, bookingCaptainMap,
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
  function handleViewTournament(tournamentId: string) {
    expandTokenRef.current += 1
    setExpandRequest({ id: tournamentId, token: expandTokenRef.current })
    requestAnimationFrame(() => scrollToTournament(tournamentId))
  }

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

  const sortedTournaments = useMemo(() =>
    Array.from(tournamentMap.values())
      .map(({ tournament, games }) => {
        const totalLeague    = tournament.total_league_games ?? games.length
        const completedGames = games.filter(g => g.game_date < today)
        const scheduledGames = games.filter(g => g.game_date >= today)
        const isCompleted    = completedGames.length >= totalLeague && scheduledGames.length === 0
        const isUpcoming     = completedGames.length === 0
        const isOngoing      = !isCompleted && !isUpcoming
        return { tournament, games, isCompleted, isUpcoming, isOngoing }
      })
      .filter(t => {
        if (t.isCompleted) return showCompleted
        if (t.isUpcoming)  return showUpcoming
        if (t.isOngoing)   return showOngoing
        return true
      })
      .sort((a, b) => b.games.length - a.games.length),
    [tournamentMap, today, showUpcoming, showOngoing, showCompleted]
  )

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

      {/* Tournament filter */}
      <div className="flex items-center gap-5 mb-5 flex-wrap">
        <span className="font-rajdhani text-[10px] uppercase tracking-widest text-stone-500">Show:</span>
        {([
          { label: 'Upcoming',  checked: showUpcoming,  set: setShowUpcoming  },
          { label: 'Ongoing',   checked: showOngoing,   set: setShowOngoing   },
          { label: 'Completed', checked: showCompleted, set: setShowCompleted },
        ]).map(({ label, checked, set }) => (
          <label key={label} className="flex items-center gap-2 cursor-pointer group">
            <input type="checkbox" checked={checked} onChange={e => set(e.target.checked)}
              className="accent-gold w-3.5 h-3.5 cursor-pointer" />
            <span className={`font-rajdhani text-xs font-semibold tracking-wide transition-colors ${
              checked ? 'text-ink' : 'text-stone-500'
            }`}>{label}</span>
          </label>
        ))}
      </div>

      <section>
        <h2 className="font-cinzel text-xl font-bold text-gold-dim mb-1">By Tournament</h2>
        <p className="font-rajdhani text-sm text-stone-500 mb-5">
          Organiser pace, game scheduling frequency, and slot balance per tournament.
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
                bookingCaptainMap={bookingCaptainMap}
                forceOpenToken={expandRequest?.id === tournament.id ? expandRequest.token : undefined} />
            ))}
          </>
        )}
      </section>
    </div>
  )
}