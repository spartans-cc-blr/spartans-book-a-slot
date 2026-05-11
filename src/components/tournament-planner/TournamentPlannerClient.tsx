'use client'

import { useMemo, useState } from 'react'
import { parseISO, differenceInDays, format, isPast } from 'date-fns'
import { PlayerNameLink } from '@/lib/playerLink'

// ── Types ──────────────────────────────────────────────────────────
interface Booking {
  id: string
  game_date: string
  slot_time: string
  format: string | null
  captain_id: string | null
  tournament: {
    id: string
    name: string
    organiser_name: string | null
    organiser_contact: string | null
    total_league_games: number | null
  } | null
  captain: { id: string; name: string } | null
}

interface Captain { id: string; name: string }

interface ViewerRole { isCaptain: boolean; isGC: boolean; isAdmin: boolean; captainId: string | null; isVC: boolean }

interface Props {
  bookings: Booking[]
  announcedBookingIds: string[]
  captains: Captain[]
  today: string
  viewerRole: ViewerRole
}

// ── Slot definitions ───────────────────────────────────────────────
// All valid slots across T20 + T30. Used for the balance grid.
const ALL_SLOTS = [
  { day: 'Sat', time: '07:30', formats: 'T20 / T30' },
  { day: 'Sat', time: '14:30', formats: 'T20 only'  },
  { day: 'Sun', time: '07:30', formats: 'T20 / T30' },
  { day: 'Sun', time: '10:30', formats: 'T20 only'  },
  { day: 'Sun', time: '12:30', formats: 'T20 / T30' },
] as const

type SlotKey = `${'Sat'|'Sun'}-${'07:30'|'10:30'|'12:30'|'14:30'}`

function slotKey(game_date: string, slot_time: string): SlotKey {
  const d = parseISO(game_date)
  const day = d.getDay() === 6 ? 'Sat' : 'Sun'
  return `${day}-${slot_time}` as SlotKey
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

function paceSignal(weeks: number | null): {
  label: string; bg: string; txt: string; waLabel: string
} {
  if (weeks === null) return {
    label: 'Not enough games', bg: 'bg-zinc-800', txt: 'text-zinc-400',
    waLabel: ''
  }
  if (weeks <= 1) return {
    label: 'Ask to slow down',
    bg: 'bg-crimson/20', txt: 'text-red-400',
    waLabel: `Hi! We're playing every week for this tournament — can we space out the next few games a bit more?`
  }
  if (weeks >= 3) return {
    label: 'Nudge to schedule',
    bg: 'bg-amber-900/40', txt: 'text-amber-400',
    waLabel: `Hi! We haven't had a game in a while — can we schedule the next one soon?`
  }
  return {
    label: 'Good pace',
    bg: 'bg-emerald-900/30', txt: 'text-emerald-400',
    waLabel: ''
  }
}

// ── Captain bandwidth section ──────────────────────────────────────
function BandwidthSection({
  captains, bookings, announcedSet, today, viewerCaptainId,
}: {
  captains: Captain[]
  bookings: Booking[]
  announcedSet: Set<string>
  today: string
  viewerCaptainId: string | null
}) {
  const tourneyBookings = bookings.filter(b => b.tournament)
  const isCaptainView   = !!viewerCaptainId
  const myCaptain       = isCaptainView ? captains.find(c => c.id === viewerCaptainId) : null
  const otherCaptains   = isCaptainView ? captains.filter(c => c.id !== viewerCaptainId) : captains

  function renderCaptainCard(captain: Captain, isOwn: boolean) {
    const mine      = tourneyBookings.filter(b => b.captain_id === captain.id)
    const completed = mine.filter(b => b.game_date < today)
    const scheduled = mine.filter(b => b.game_date >= today)

    const totalLeague = Array.from(new Set(mine.map(b => b.tournament!.id)))
      .reduce((sum, tid) => {
        const t = mine.find(b => b.tournament!.id === tid)?.tournament
        return sum + (t?.total_league_games ?? mine.filter(b => b.tournament!.id === tid).length)
      }, 0)
    const unbooked = Math.max(0, totalLeague - mine.length)
    const total    = mine.length + unbooked

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

    return (
      <div
        key={captain.id}
        className={`bg-ink-3 rounded-lg border p-4 transition-opacity ${
          isOwn
            ? 'border-gold-dim ring-1 ring-gold/20'
            : isCaptainView
            ? `${isLowLoad ? 'border-emerald-800' : 'border-ink-5'} opacity-60`
            : isLowLoad ? 'border-emerald-800' : 'border-ink-5'
        }`}
      >
        <div className="flex items-center gap-3 mb-3">
          <div className="w-9 h-9 rounded-full bg-gold/20 flex items-center justify-center font-cinzel text-gold text-sm font-bold flex-shrink-0">
            {captain.name.slice(0, 2).toUpperCase()}
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="font-cinzel text-sm font-bold text-parchment">{captain.name}</span>
              {isLowLoad && (
                <span className="font-rajdhani text-[10px] px-2 py-0.5 rounded-full bg-emerald-900/50 text-emerald-400 border border-emerald-800">
                  Bandwidth available — can take new tournament
                </span>
              )}
            </div>
            <p className="font-rajdhani text-xs text-zinc-500 mt-0.5">
              <span className="text-parchment font-semibold">{total}</span> total &nbsp;·&nbsp;
              <span className="text-emerald-400 font-semibold">{completed.length}</span> completed &nbsp;·&nbsp;
              <span className="text-amber-400 font-semibold">{scheduled.length}</span> scheduled &nbsp;·&nbsp;
              <span className="text-zinc-400 font-semibold">{unbooked}</span> unbooked
            </p>
          </div>
        </div>

        {/* Bandwidth bar */}
        <div className="h-3 rounded-full bg-zinc-800 overflow-hidden flex mb-2">
          {doneW  > 0 && <div className="h-full bg-emerald-600 transition-all" style={{ width: `${doneW}%` }} />}
          {schedW > 0 && <div className="h-full bg-amber-600 transition-all"   style={{ width: `${schedW}%` }} />}
          {pendW  > 0 && <div className="h-full bg-zinc-600 transition-all"    style={{ width: `${pendW}%` }} />}
        </div>

        {/* Slot fairness grid */}
        {mine.length > 0 && (
          <div className="mt-4 pt-4 border-t border-ink-5">
            <p className="font-rajdhani text-[10px] font-bold tracking-[2px] uppercase text-zinc-600 mb-3">
              Games by slot &amp; day
            </p>
            <div className="grid grid-cols-5 gap-1.5">
              {ALL_SLOTS.map(s => {
                const k: SlotKey = `${s.day}-${s.time}`
                const count = slotCounts[k]
                const barH  = count > 0 ? Math.round((count / maxSlot) * 100) : 0
                const isSat = s.day === 'Sat'
                return (
                  <div key={k} className="bg-ink-4 border border-ink-5 rounded p-1.5 flex flex-col items-center">
                    <span className={`font-rajdhani text-[9px] font-bold px-1.5 py-0.5 rounded-full mb-1 ${
                      isSat ? 'bg-blue-900/50 text-blue-400' : 'bg-pink-900/40 text-pink-400'
                    }`}>{s.day}</span>
                    <span className="font-rajdhani text-[10px] text-zinc-500 mb-1.5">{s.time}</span>
                    <div className="w-full h-8 bg-zinc-800 rounded overflow-hidden flex flex-col-reverse mb-1">
                      {count > 0 && (
                        <div
                          className="w-full rounded bg-amber-600 transition-all"
                          style={{ height: `${barH}%` }}
                        />
                      )}
                    </div>
                    <span className={`font-cinzel text-xs font-bold ${count > 0 ? 'text-amber-400' : 'text-zinc-700'}`}>
                      {count > 0 ? count : '—'}
                    </span>
                    <span className="font-rajdhani text-[8px] text-zinc-700 mt-0.5">{s.formats}</span>
                  </div>
                )
              })}
            </div>
            {isImbalanced && (
              <p className="font-rajdhani text-xs text-blue-400 mt-2">
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
      <p className="font-rajdhani text-[10px] font-bold tracking-[3px] uppercase text-zinc-600 mb-1">
        Tournament Planner
      </p>
      <h1 className="font-cinzel text-xl font-bold text-gold mb-1">Captain Bandwidth</h1>
      <p className="font-rajdhani text-sm text-zinc-500 mb-5">
        {isCaptainView
          ? 'Your tournament load — followed by other captains.'
          : 'Total tournament game load per captain — completed, scheduled, and unbooked.'}
      </p>

      {/* Legend */}
      <div className="flex gap-5 mb-4 flex-wrap">
        {[
          { color: 'bg-emerald-600', label: 'Completed (past date)' },
          { color: 'bg-amber-600',   label: 'Scheduled (upcoming booked)' },
          { color: 'bg-zinc-600',    label: 'Unbooked (remaining league games)' },
        ].map(({ color, label }) => (
          <div key={label} className="flex items-center gap-2">
            <div className={`w-3 h-3 rounded-sm ${color}`} />
            <span className="font-rajdhani text-xs text-zinc-500">{label}</span>
          </div>
        ))}
      </div>

      <div className="flex flex-col gap-4">
        {isCaptainView && myCaptain && (
          <>
            <p className="font-rajdhani text-[10px] uppercase tracking-widest text-zinc-500">Your bandwidth</p>
            {renderCaptainCard(myCaptain, true)}
            {otherCaptains.length > 0 && (
              <p className="font-rajdhani text-[10px] uppercase tracking-widest text-zinc-600 mt-2">Other captains</p>
            )}
          </>
        )}
        {(isCaptainView ? otherCaptains : captains).map(captain => renderCaptainCard(captain, false))}
      </div>
    </section>
  )
}

// ── Inline game count editor — admin only ─────────────────────────
// Shown in the Total stat cell inside the tournament block.
// Calls PATCH /api/tournaments — same endpoint as admin tournaments page.
function InlineGameCountEditor({
  tournamentId,
  currentValue,
  onSaved,
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
      setError('Enter a number between 1–99')
      return
    }
    setSaving(true)
    setError('')
    const res = await fetch('/api/tournaments', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: tournamentId, total_league_games: parsed }),
    })
    if (res.ok) {
      onSaved(parsed)
      setEditing(false)
    } else {
      setError('Save failed — try again')
    }
    setSaving(false)
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Enter') handleSave()
    if (e.key === 'Escape') { setEditing(false); setError('') }
  }

  if (!editing) {
    return (
      <button
        onClick={() => { setVal(String(currentValue ?? '')); setEditing(true) }}
        className="group flex items-center gap-1 font-cinzel text-lg font-bold text-parchment hover:text-gold transition-colors"
        title="Edit total league games"
      >
        {currentValue ?? '?'}
        <span className="text-zinc-700 group-hover:text-gold text-xs opacity-0 group-hover:opacity-100 transition-opacity">
          ✎
        </span>
      </button>
    )
  }

  return (
    <div className="flex flex-col items-center gap-1">
      <div className="flex items-center gap-1">
        <input
          type="number"
          min={1}
          max={99}
          value={val}
          onChange={e => setVal(e.target.value)}
          onKeyDown={handleKeyDown}
          autoFocus
          className="w-14 bg-ink-4 border border-gold text-gold font-cinzel text-sm font-bold text-center rounded px-1 py-0.5 focus:outline-none"
        />
        <button
          onClick={handleSave}
          disabled={saving}
          className="font-rajdhani text-[10px] font-bold text-emerald-400 hover:text-emerald-300 px-1.5 py-0.5 border border-emerald-800 rounded disabled:opacity-50"
        >
          {saving ? '…' : '✓'}
        </button>
        <button
          onClick={() => { setEditing(false); setError('') }}
          className="font-rajdhani text-[10px] text-zinc-600 hover:text-zinc-400 px-1 py-0.5"
        >
          ✕
        </button>
      </div>
      {error && (
        <span className="font-rajdhani text-[9px] text-red-400">{error}</span>
      )}
    </div>
  )
}

// ── Tournament block ───────────────────────────────────────────────
function TournamentBlock({
  tournament, games, announcedSet, today, isAdmin, isGC,
}: {
  tournament: NonNullable<Booking['tournament']>
  games: Booking[]
  announcedSet: Set<string>
  today: string
  isAdmin: boolean
  isGC: boolean
}) {
  const [open, setOpen] = useState(false)
  const [completedOpen, setCompletedOpen] = useState(false)

  const completed = games.filter(g => g.game_date < today)
  const scheduled = games.filter(g => g.game_date >= today)
  const [totalLeagueGames, setTotalLeagueGames] = useState<number | null>(
    tournament.total_league_games ?? null
  )
  const totalLeague = totalLeagueGames ?? games.length
  const unbooked = Math.max(0, totalLeague - games.length)

  const allDates = games.map(g => g.game_date).sort()
  const gap = avgGapWeeks(allDates)
  const pace = paceSignal(gap)

  // Slot balance counts
  const slotCounts = Object.fromEntries(
    ALL_SLOTS.map(s => [`${s.day}-${s.time}`, 0])
  ) as Record<SlotKey, number>
  games.forEach(g => {
    const k = slotKey(g.game_date, g.slot_time)
    if (slotCounts[k] !== undefined) slotCounts[k]++
  })
  const maxSlotCount = Math.max(...Object.values(slotCounts), 1)
  const dominantSlot = Object.entries(slotCounts).reduce((a, b) => b[1] > a[1] ? b : a, ['', 0])[0]
  const isSlotImbalanced = maxSlotCount > Math.ceil(games.length / 2) && games.length >= 3

  // Per-game gap labels
  const gapLabel = (i: number, sorted: Booking[]): string => {
    if (i === 0) return '—'
    const weeks = Math.round(
      differenceInDays(parseISO(sorted[i].game_date), parseISO(sorted[i - 1].game_date)) / 7
    )
    return `${weeks}w`
  }

  const sortedGames = [...games].sort((a, b) => a.game_date.localeCompare(b.game_date))

  const whatsappLink = pace.waLabel
    ? `https://wa.me/${tournament.organiser_contact?.replace(/\D/g, '') ?? ''}?text=${encodeURIComponent(pace.waLabel)}`
    : null

    // Share card — summary message for organiser
  const shareMessage = useMemo(() => {
    const totalLeague = tournament.total_league_games ?? games.length
    const completedCount = games.filter(g => g.game_date < today).length
    const scheduledCount = games.filter(g => g.game_date >= today).length
    const unbookedCount  = Math.max(0, totalLeague - games.length)

    const slotLines = ALL_SLOTS
      .map(s => {
        const k: SlotKey = `${s.day}-${s.time}`
        const count = slotCounts[k]
        return count > 0 ? `  ${s.day} ${s.time}: ${count} game${count > 1 ? 's' : ''}` : null
      })
      .filter(Boolean)
      .join('\n')

    return [
      `*${tournament.name} — Spartans CC Update*`,
      ``,
      `📊 Status: ${completedCount} completed · ${scheduledCount} scheduled · ${unbookedCount} unbooked`,
      `⏱ Avg gap between games: ${gap !== null ? `${gap} week${gap !== 1 ? 's' : ''}` : 'N/A'}`,
      ``,
      `🗓 Slot breakdown so far:`,
      slotLines,
      ``,
      isSlotImbalanced
        ? `⚠️ Slot balance is skewed — would appreciate spreading remaining ${unbookedCount} game${unbookedCount !== 1 ? 's' : ''} across other slots.`
        : `✅ Slot balance looks good across the tournament.`,
      ``,
      `Could you help schedule the remaining games? Happy to discuss slots that work for both sides.`,
    ].join('\n')
  }, [tournament, games, today, gap, slotCounts, isSlotImbalanced])

  const shareLink = tournament.organiser_contact
    ? `https://wa.me/${tournament.organiser_contact.replace(/\D/g, '')}?text=${encodeURIComponent(shareMessage)}`
    : null

  return (
    <div className="bg-ink-3 border border-ink-5 rounded-lg mb-4 overflow-hidden">

      {/* Header */}
      <button
        className="w-full text-left px-4 py-3 hover:bg-ink-4 transition-colors"
        onClick={() => setOpen(v => !v)}
      >
        <div className="flex items-start gap-3">
          <span className="text-amber-500 mt-0.5">🏆</span>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="font-cinzel text-sm font-bold text-parchment">{tournament.name}</span>
              <span className={`font-rajdhani text-[10px] px-2 py-0.5 rounded-full ${pace.bg} ${pace.txt}`}>
                {pace.label}
              </span>
            </div>
            <p className="font-rajdhani text-xs text-zinc-500 mt-0.5">
              {tournament.organiser_name && <>Organiser: <span className="text-zinc-400">{tournament.organiser_name}</span> &nbsp;·&nbsp;</>}
              Avg gap: <span className="text-zinc-300 font-semibold">{gap !== null ? `${gap} week${gap !== 1 ? 's' : ''}` : 'N/A'}</span>
            </p>
          </div>

          {/* Stat pills */}
          <div className="flex gap-1.5 flex-shrink-0 flex-wrap justify-end">
            <span className="font-rajdhani text-[10px] px-2 py-0.5 rounded-full bg-emerald-900/40 text-emerald-400">
              {completed.length} done
            </span>
            <span className="font-rajdhani text-[10px] px-2 py-0.5 rounded-full bg-amber-900/40 text-amber-400">
              {scheduled.length} sched
            </span>
            {unbooked > 0 && (
              <span className="font-rajdhani text-[10px] px-2 py-0.5 rounded-full bg-zinc-700/60 text-zinc-400">
                {unbooked} unbooked
              </span>
            )}
            <span className="text-zinc-600 ml-1 self-center">{open ? '▲' : '▼'}</span>
          </div>
        </div>
      </button>

      {!open && (
        /* Collapsed: just show stat bar + pace timeline */
        <div className="px-4 pb-3">
          {/* mini timeline bar */}
          <div className="flex gap-0.5 h-2 rounded-full overflow-hidden bg-zinc-800 mt-1">
            {sortedGames.map((g, i) => (
              <div
                key={g.id}
                className={`flex-1 ${
                  g.game_date < today 
                    ? 'bg-emerald-600'
                    : g.game_date >= today
                    ? 'bg-amber-600'
                    : 'bg-zinc-600'
                }`}
              />
            ))}
            {Array.from({ length: unbooked }).map((_, i) => (
              <div key={`u${i}`} className="flex-1 bg-zinc-700 opacity-40" />
            ))}
          </div>
        </div>
      )}

      {open && (
        <div className="border-t border-ink-5">

          {/* Stat bar */}
        <div className="grid grid-cols-5 border-b border-ink-5">

        {/* Total — editable by admin */}
        <div className="px-3 py-2.5 text-center">
            <p className="font-rajdhani text-[9px] uppercase tracking-widest text-zinc-600">Total</p>
            {isAdmin ? (
            <InlineGameCountEditor
                tournamentId={tournament.id}
                currentValue={totalLeagueGames}
                onSaved={setTotalLeagueGames}
            />
            ) : (
            <p className="font-cinzel text-lg font-bold text-parchment">{totalLeague}</p>
            )}
            <p className="font-rajdhani text-[9px] text-zinc-600">league games</p>
        </div>

        {/* Completed */}
        <div className="px-3 py-2.5 text-center border-l border-ink-5">
            <p className="font-rajdhani text-[9px] uppercase tracking-widest text-zinc-600">Completed</p>
            <p className="font-cinzel text-lg font-bold text-emerald-400">{completed.length}</p>
            <p className="font-rajdhani text-[9px] text-zinc-600">announced + past</p>
        </div>

        {/* Scheduled */}
        <div className="px-3 py-2.5 text-center border-l border-ink-5">
            <p className="font-rajdhani text-[9px] uppercase tracking-widest text-zinc-600">Scheduled</p>
            <p className="font-cinzel text-lg font-bold text-amber-400">{scheduled.length}</p>
            <p className="font-rajdhani text-[9px] text-zinc-600">booked, upcoming</p>
        </div>

        {/* Unbooked */}
        <div className="px-3 py-2.5 text-center border-l border-ink-5">
            <p className="font-rajdhani text-[9px] uppercase tracking-widest text-zinc-600">Unbooked</p>
            <p className="font-cinzel text-lg font-bold text-zinc-400">{unbooked}</p>
            <p className="font-rajdhani text-[9px] text-zinc-600">games remaining</p>
        </div>

        {/* Avg gap */}
        <div className="px-3 py-2.5 text-center border-l border-ink-5">
            <p className="font-rajdhani text-[9px] uppercase tracking-widest text-zinc-600">Avg gap</p>
            <p className={`font-cinzel text-lg font-bold ${
            gap === null    ? 'text-zinc-500' :
            gap <= 1        ? 'text-red-400'  :
            gap >= 3        ? 'text-amber-400': 'text-emerald-400'
            }`}>
            {gap !== null ? `${gap}w` : '—'}
            </p>
            <p className="font-rajdhani text-[9px] text-zinc-600">
            {gap === null ? 'not enough games' : gap <= 1 ? '⚠ very frequent' : gap >= 3 ? 'slow pace' : 'good pace'}
            </p>
        </div>

        </div>

          {/* WhatsApp nudge button */}
          {(whatsappLink || isAdmin || isGC)  && (
            <div className="px-4 py-2 bg-ink-4 border-b border-ink-5 flex items-center gap-4 flex-wrap">
              <a
                href={whatsappLink ?? undefined}
                target="_blank"
                rel="noopener noreferrer"
                className="font-rajdhani text-xs font-bold text-emerald-400 hover:text-emerald-300"
              >
                📲 WhatsApp {tournament.organiser_name ?? 'organiser'} — {pace.label}
              </a>
             {(isAdmin || isGC) && shareLink && (
              <a href={shareLink} target="_blank" rel="noopener noreferrer"
                className="font-rajdhani text-xs font-bold text-blue-400 hover:text-blue-300">
                📤 Share slot & pace summary with organiser
              </a>
            )}
            {(isAdmin || isGC) && !shareLink && (
              <span className="font-rajdhani text-[10px] text-zinc-700">
                Add organiser WhatsApp in /admin/tournaments to enable sharing
              </span>
            )}
            </div>
          )}

          {/* Game timeline pace bar */}
          <div className="px-4 py-3 border-b border-ink-5">
            <div className="flex justify-between mb-1.5">
              <p className="font-rajdhani text-[10px] uppercase tracking-widest text-zinc-600">
                Game timeline — pace view
              </p>
              <p className="font-rajdhani text-[10px] text-zinc-700">each block = 1 game</p>
            </div>
            <div className="flex gap-0.5 h-4 rounded overflow-hidden bg-zinc-800">
              {sortedGames.map(g => (
                <div
                  key={g.id}
                  className={`flex-1 ${
                    g.game_date < today
                      ? 'bg-emerald-600' : 'bg-amber-600'
                  }`}
                  title={g.game_date}
                />
              ))}
              {Array.from({ length: unbooked }).map((_, i) => (
                <div key={`u${i}`} className="flex-1 bg-zinc-700 opacity-50" />
              ))}
            </div>
            {/* date labels */}
            <div className="flex mt-1">
              {sortedGames.map(g => (
                <div key={g.id} className="flex-1 font-rajdhani text-[8px] text-zinc-700 text-center truncate">
                  {format(parseISO(g.game_date), 'd MMM')}
                </div>
              ))}
              {Array.from({ length: unbooked }).map((_, i) => (
                <div key={`u${i}`} className="flex-1 font-rajdhani text-[8px] text-zinc-700 text-center">TBD</div>
              ))}
            </div>
          </div>

          {/* Game list */}
          <div className="px-4 py-3 border-b border-ink-5">

            {/* Completed — collapsible */}
            {completed.length > 0 && (
              <div className="mb-3">
                <button
                  onClick={() => setCompletedOpen(v => !v)}
                  className="flex items-center gap-1 font-rajdhani text-[10px] uppercase tracking-widest text-zinc-600 mb-2 w-full text-left hover:text-zinc-400"
                >
                  <span>{completedOpen ? '▲' : '▶'}</span>
                  <span>Completed — {completed.length} games</span>
                </button>
                {completedOpen && (
                  <div className="flex flex-col gap-1.5 opacity-60">
                    {completed.map((g, i) => {
                      const idx = sortedGames.findIndex(x => x.id === g.id)
                      return <GameRow key={g.id} game={g} gap={gapLabel(idx, sortedGames)} isDone />
                    })}
                  </div>
                )}
              </div>
            )}

            {/* Scheduled */}
            {scheduled.length > 0 && (
              <div className="mb-3">
                <p className="font-rajdhani text-[10px] uppercase tracking-widest text-zinc-600 mb-2">
                  Scheduled — {scheduled.length} games
                </p>
                <div className="flex flex-col gap-1.5">
                  {scheduled.map((g, i) => {
                    const idx = sortedGames.findIndex(x => x.id === g.id)
                    return <GameRow key={g.id} game={g} gap={gapLabel(idx, sortedGames)} />
                  })}
                </div>
              </div>
            )}

            {/* Unbooked */}
            {unbooked > 0 && (
              <div>
                <p className="font-rajdhani text-[10px] uppercase tracking-widest text-zinc-600 mb-2">
                  Unbooked — {unbooked} games remaining
                </p>
                {Array.from({ length: unbooked }).map((_, i) => (
                  <div key={i} className="flex items-center gap-2 py-1.5 font-rajdhani text-xs text-zinc-600 border-t border-ink-5 first:border-t-0">
                    <span className="text-zinc-700">○</span>
                    Game {completed.length + scheduled.length + i + 1} — date &amp; slot not yet booked
                  </div>
                ))}
                <p className="font-rajdhani text-[10px] text-zinc-700 border-t border-dashed border-ink-5 mt-2 pt-2">
                  ℹ Knockout games will appear here if Spartans qualify after league stage
                </p>
              </div>
            )}
          </div>

          {/* Slot balance grid */}
          <div className="px-4 py-3">
            <p className="font-rajdhani text-[10px] uppercase tracking-widest text-zinc-600 mb-3">
              Slot balance across this tournament
            </p>
            <div className="grid grid-cols-5 gap-1.5">
              {ALL_SLOTS.map(s => {
                const k: SlotKey = `${s.day}-${s.time}`
                const count = slotCounts[k]
                const barH = count > 0 ? Math.round((count / maxSlotCount) * 100) : 0
                const isSat = s.day === 'Sat'
                return (
                  <div key={k} className="bg-ink-4 border border-ink-5 rounded p-1.5 flex flex-col items-center">
                    <span className={`font-rajdhani text-[9px] font-bold px-1.5 py-0.5 rounded-full mb-1 ${
                      isSat ? 'bg-blue-900/50 text-blue-400' : 'bg-pink-900/40 text-pink-400'
                    }`}>{s.day}</span>
                    <span className="font-rajdhani text-[10px] text-zinc-500 mb-1.5">{s.time}</span>
                    <div className="w-full h-8 bg-zinc-800 rounded overflow-hidden flex flex-col-reverse mb-1">
                      {count > 0 && (
                        <div
                          className={`w-full rounded transition-all ${
                            count === maxSlotCount ? 'bg-emerald-600' : 'bg-amber-600'
                          }`}
                          style={{ height: `${barH}%` }}
                        />
                      )}
                    </div>
                    <span className={`font-cinzel text-xs font-bold ${count > 0 ? 'text-amber-400' : 'text-zinc-700'}`}>
                      {count > 0 ? count : '—'}
                    </span>
                    <span className="font-rajdhani text-[8px] text-zinc-700 mt-0.5">{s.formats}</span>
                  </div>
                )
              })}
            </div>
            {isSlotImbalanced && (
              <p className="font-rajdhani text-xs text-blue-400 mt-2">
                ↗ {dominantSlot} has {maxSlotCount} of {games.length} games — unbooked games should favour other slots
              </p>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

// ── Game row ───────────────────────────────────────────────────────
function GameRow({ game, gap, isDone = false }: { game: Booking; gap: string; isDone?: boolean }) {
  const d = parseISO(game.game_date)
  const dayName = d.getDay() === 6 ? 'Sat' : 'Sun'
  const isSat = dayName === 'Sat'
  const gapNum = parseInt(gap)
  const gapColor = isNaN(gapNum) ? 'text-zinc-600'
    : gapNum <= 1 ? 'text-red-400'
    : gapNum >= 3 ? 'text-amber-400'
    : 'text-emerald-400'

  return (
    <div className={`grid grid-cols-[44px_1fr_auto] gap-0 border border-ink-5 rounded overflow-hidden ${isDone ? 'opacity-55' : ''}`}>
      {/* Date block */}
      <div className="bg-ink-4 flex flex-col items-center justify-center py-2 border-r border-ink-5">
        <span className="font-cinzel text-base font-bold text-parchment leading-none">
          {format(d, 'd')}
        </span>
        <span className="font-rajdhani text-[9px] text-zinc-500 uppercase">
          {format(d, 'MMM')}
        </span>
        <span className="font-rajdhani text-[9px] text-zinc-600">{dayName}</span>
      </div>
      {/* Body */}
      <div className="px-2.5 py-2 flex flex-col gap-0.5">
        <div className="flex items-center gap-1.5 flex-wrap">
          <span className={`font-rajdhani text-[9px] font-bold px-1.5 py-0.5 rounded-full ${
            isSat ? 'bg-blue-900/40 text-blue-400' : 'bg-pink-900/30 text-pink-400'
          }`}>{dayName}</span>
          <span className="font-rajdhani text-[10px] px-1.5 py-0.5 rounded-full bg-zinc-800 text-zinc-400 border border-zinc-700">
            {game.slot_time}
          </span>
          <span className="font-rajdhani text-[10px] px-1.5 py-0.5 rounded-full bg-zinc-800 text-zinc-400 border border-zinc-700">
            {game.format}
          </span>
        </div>
        <div className="font-rajdhani text-xs text-zinc-400">
          Captain: {game.captain
            ? <PlayerNameLink name={game.captain.name} className="text-blue-400" />
            : <span className="text-zinc-600">Unassigned</span>
          }
        </div>
      </div>
      {/* Gap */}
      <div className="flex flex-col items-end justify-center px-2.5 py-2 border-l border-ink-5 min-w-[52px]">
        <span className={`font-cinzel text-sm font-bold ${gapColor}`}>{gap}</span>
        <span className="font-rajdhani text-[9px] text-zinc-700">from prev</span>
      </div>
    </div>
  )
}

// ── Root client component ──────────────────────────────────────────
export function TournamentPlannerClient({
  bookings, announcedBookingIds, captains, today, viewerRole,
}: Props) {
  const announcedSet = useMemo(() => new Set(announcedBookingIds), [announcedBookingIds])
  const [showUpcoming,  setShowUpcoming]  = useState(true)
  const [showOngoing,   setShowOngoing]   = useState(true)
  const [showCompleted, setShowCompleted] = useState(false)

  // Group bookings by tournament
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

  // Sort tournaments: most games first
  const sortedTournaments = useMemo(() =>
      Array.from(tournamentMap.values())
       .map(({ tournament, games }) => {
         const totalLeague = tournament.total_league_games ?? games.length
         const completedGames = games.filter(g => g.game_date < today)
         const scheduledGames = games.filter(g => g.game_date >= today)
         const isCompleted = completedGames.length >= totalLeague && scheduledGames.length === 0
         const isUpcoming  = completedGames.length === 0
         const isOngoing   = !isCompleted && !isUpcoming
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

  const isCaptainView   = viewerRole.isCaptain && !!viewerRole.captainId
  const myTournaments   = isCaptainView
    ? sortedTournaments.filter(t => t.games.some(g => g.captain_id === viewerRole.captainId))
    : sortedTournaments
  const otherTournaments = isCaptainView
    ? sortedTournaments.filter(t => t.games.every(g => g.captain_id !== viewerRole.captainId))
    : []

  return (
    <div>
      {/* Section 1 — Captain Bandwidth */}
      <BandwidthSection
        captains={captains}
        bookings={bookings}
        announcedSet={announcedSet}
        today={today}
        viewerCaptainId={viewerRole.captainId}
      />

      {/* Tournament filter */}
       <div className="flex items-center gap-5 mb-5 flex-wrap">
         <span className="font-rajdhani text-[10px] uppercase tracking-widest text-zinc-600">Show:</span>
         {([
           { label: 'Upcoming',  checked: showUpcoming,  set: setShowUpcoming  },
           { label: 'Ongoing',   checked: showOngoing,   set: setShowOngoing   },
           { label: 'Completed', checked: showCompleted, set: setShowCompleted },
         ]).map(({ label, checked, set }) => (
           <label key={label} className="flex items-center gap-2 cursor-pointer group">
             <input
               type="checkbox"
               checked={checked}
               onChange={e => set(e.target.checked)}
               className="accent-gold w-3.5 h-3.5 cursor-pointer"
             />
             <span className={`font-rajdhani text-xs font-semibold tracking-wide transition-colors ${
               checked ? 'text-zinc-300' : 'text-zinc-600'
             }`}>
               {label}
             </span>
           </label>
         ))}
       </div>

      {/* Section 2 — By Tournament */}
      <section>
        <h2 className="font-cinzel text-xl font-bold text-gold mb-1">By Tournament</h2>
        <p className="font-rajdhani text-sm text-zinc-500 mb-5">
          Organiser pace, game scheduling frequency, and slot balance per tournament.
        </p>
        {sortedTournaments.length === 0 ? (
         <p className="font-rajdhani text-sm text-zinc-600">
           No tournaments match the selected filters.{' '}
           <button
             onClick={() => { setShowUpcoming(true); setShowOngoing(true); setShowCompleted(true) }}
             className="text-gold underline"
           >
             Show all
           </button>
         </p>
        ) : (
              <>
                {isCaptainView && myTournaments.length > 0 && (
                  <>
                    <p className="font-rajdhani text-[10px] uppercase tracking-widest text-zinc-500 mb-3">
                      Your tournaments
                    </p>
                    {myTournaments.map(({ tournament, games }) => (
                      <TournamentBlock key={tournament.id} tournament={tournament} games={games}
                        announcedSet={announcedSet} today={today}
                        isAdmin={viewerRole.isAdmin} isGC={viewerRole.isGC} />
                    ))}
                    {otherTournaments.length > 0 && (
                      <p className="font-rajdhani text-[10px] uppercase tracking-widest text-zinc-600 mt-6 mb-3">
                        Other tournaments
                      </p>
                    )}
                  </>
                )}
                {(isCaptainView ? otherTournaments : sortedTournaments).map(({ tournament, games }) => (
                  <TournamentBlock key={tournament.id} tournament={tournament} games={games}
                    announcedSet={announcedSet} today={today}
                    isAdmin={viewerRole.isAdmin} isGC={viewerRole.isGC} />
                ))}
              </>
            )}
          </section>
        </div>
      )
    }