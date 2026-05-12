import { parseISO, differenceInDays, format } from 'date-fns'

// Re-use the same slot definitions and helpers
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

type SlotKey = `${'Sat'|'Sun'}-${'07:30'|'10:30'|'12:30'|'14:30'}`

interface Booking {
  id: string
  game_date: string
  slot_time: string
  format: string | null
  captain_id: string | null
  captain: { id: string; name: string } | null
}

interface Tournament {
  id: string
  name: string
  organiser_name: string | null
  organiser_contact: string | null
  total_league_games: number | null
  vc_captain_id: string | null
}

export function TournamentShareCard({
  tournament, bookings, today,
}: {
  tournament: Tournament
  bookings: Booking[]
  today: string
}) {
  const sorted     = [...bookings].sort((a, b) => a.game_date.localeCompare(b.game_date))
  const completed  = sorted.filter(g => g.game_date < today)
  const scheduled  = sorted.filter(g => g.game_date >= today)
  const totalLeague = tournament.total_league_games ?? sorted.length
  const unbooked    = Math.max(0, totalLeague - sorted.length)

  // Avg gap
  const dates = sorted.map(g => g.game_date)
  let avgGap: number | null = null
  if (dates.length >= 2) {
    let totalDays = 0
    for (let i = 1; i < dates.length; i++) {
      totalDays += differenceInDays(parseISO(dates[i]), parseISO(dates[i - 1]))
    }
    avgGap = Math.round(totalDays / 7 / (dates.length - 1))
  }

  // Per-game gaps
  const gameGaps = sorted.map((g, i) => {
    if (i === 0) return null
    return Math.round(differenceInDays(parseISO(g.game_date), parseISO(sorted[i - 1].game_date)) / 7)
  })

  // Slot counts
  const slotCounts = Object.fromEntries(ALL_SLOTS.map(s => [`${s.day}-${s.time}`, 0])) as Record<SlotKey, number>
  sorted.forEach(g => {
    const d   = parseISO(g.game_date)
    const day = d.getDay() === 6 ? 'Sat' : 'Sun'
    const k   = `${day}-${g.slot_time}` as SlotKey
    if (slotCounts[k] !== undefined) slotCounts[k]++
  })
  const maxSlotCount = Math.max(...Object.values(slotCounts), 1)

  const formats         = Array.from(new Set(sorted.map(g => g.format).filter((f): f is string => !!f)))
  const activeFormats   = formats.length === 0 ? ['T20', 'T30'] : formats

  const gapColor = (gap: number | null) => {
    if (!gap)       return 'text-zinc-500'
    if (gap <= 1)   return 'text-red-400'
    if (avgGap && gap > avgGap + 2) return 'text-amber-400'
    return 'text-emerald-400'
  }

  return (
    <div className="bg-ink-3 border border-ink-5 rounded-lg overflow-hidden">

      {/* Header */}
      <div className="px-5 py-4 border-b border-ink-5">
        <div className="flex items-start gap-3">
          <span className="text-amber-500 text-xl">🏆</span>
          <div>
            <h1 className="font-cinzel text-base font-bold text-parchment">{tournament.name}</h1>
            <p className="font-rajdhani text-xs text-zinc-500 mt-0.5">
              Avg gap: <span className="text-zinc-300 font-semibold">
                {avgGap !== null ? `${avgGap} week${avgGap !== 1 ? 's' : ''}` : 'N/A'}
              </span>
            </p>
          </div>
        </div>
      </div>

      {/* Stat bar */}
      <div className="grid grid-cols-4 border-b border-ink-5">
        {[
          { label: 'Total',     val: totalLeague.toString(), col: 'text-parchment',   sub: 'league games'   },
          { label: 'Completed', val: completed.length.toString(),  col: 'text-emerald-400', sub: 'past date'      },
          { label: 'Scheduled', val: scheduled.length.toString(),  col: 'text-amber-400',   sub: 'upcoming'       },
          { label: 'Unbooked',  val: unbooked.toString(),    col: 'text-zinc-400',    sub: 'not yet booked' },
        ].map(({ label, val, col, sub }, i) => (
          <div key={label} className={`px-3 py-2.5 text-center ${i > 0 ? 'border-l border-ink-5' : ''}`}>
            <p className="font-rajdhani text-[9px] uppercase tracking-widest text-zinc-600">{label}</p>
            <p className={`font-cinzel text-lg font-bold ${col}`}>{val}</p>
            <p className="font-rajdhani text-[9px] text-zinc-600">{sub}</p>
          </div>
        ))}
      </div>

      {/* Game list */}
      <div className="px-4 py-3 border-b border-ink-5">
        <p className="font-rajdhani text-[10px] uppercase tracking-widest text-zinc-600 mb-3">
          Schedule
        </p>
        <div className="flex flex-col gap-1.5">
          {sorted.map((g, i) => {
            const d       = parseISO(g.game_date)
            const dayName = d.getDay() === 6 ? 'Sat' : 'Sun'
            const isSat   = dayName === 'Sat'
            const gap     = gameGaps[i]
            const isDone  = g.game_date < today
            return (
              <div key={g.id}
                className={`grid grid-cols-[44px_1fr_auto] border border-ink-5 rounded overflow-hidden ${isDone ? 'opacity-50' : ''}`}>
                <div className="bg-ink-4 flex flex-col items-center justify-center py-2 border-r border-ink-5">
                  <span className="font-cinzel text-base font-bold text-parchment leading-none">{format(d, 'd')}</span>
                  <span className="font-rajdhani text-[9px] text-zinc-500 uppercase">{format(d, 'MMM')}</span>
                  <span className="font-rajdhani text-[9px] text-zinc-600">{dayName}</span>
                </div>
                <div className="px-2.5 py-2 flex flex-col gap-0.5">
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <span className={`font-rajdhani text-[9px] font-bold px-1.5 py-0.5 rounded-full ${
                      isSat ? 'bg-blue-900/40 text-blue-400' : 'bg-pink-900/30 text-pink-400'
                    }`}>{dayName}</span>
                    <span className="font-rajdhani text-[10px] px-1.5 py-0.5 rounded-full bg-zinc-800 text-zinc-400 border border-zinc-700">{g.slot_time}</span>
                    <span className="font-rajdhani text-[10px] px-1.5 py-0.5 rounded-full bg-zinc-800 text-zinc-400 border border-zinc-700">{g.format}</span>
                  </div>
                  {g.captain && (
                    <p className="font-rajdhani text-xs text-zinc-500">Captain: <span className="text-zinc-300">{g.captain.name}</span></p>
                  )}
                </div>
                <div className="flex flex-col items-end justify-center px-2.5 py-2 border-l border-ink-5 min-w-[44px]">
                  {gap !== null
                    ? <span className={`font-cinzel text-sm font-bold ${gapColor(gap)}`}>{gap}w</span>
                    : <span className="font-rajdhani text-[9px] text-zinc-600">start</span>
                  }
                  {gap !== null && <span className="font-rajdhani text-[9px] text-zinc-700">from prev</span>}
                </div>
              </div>
            )
          })}
          {Array.from({ length: unbooked }).map((_, i) => (
            <div key={`u${i}`} className="flex items-center gap-2 py-1.5 px-2 font-rajdhani text-xs text-zinc-700 border border-dashed border-ink-5 rounded">
              ○ Game {sorted.length + i + 1} — date &amp; slot not yet booked
            </div>
          ))}
        </div>
      </div>

      {/* Slot balance */}
      <div className="px-4 py-3">
        <p className="font-rajdhani text-[10px] uppercase tracking-widest text-zinc-600 mb-3">
          Slot balance
        </p>
        <div className="grid grid-cols-8 gap-1.5">
          {ALL_SLOTS.map(s => {
            const k: SlotKey   = `${s.day}-${s.time}`
            const count        = slotCounts[k]
            const barH         = count > 0 ? Math.round((count / maxSlotCount) * 100) : 0
            const isSat        = s.day === 'Sat'
            const isApplicable = s.validFor.some(f => activeFormats.includes(f))
            return (
              <div key={k} className="bg-ink-4 border border-ink-5 rounded p-1.5 flex flex-col items-center">
                <span className={`font-rajdhani text-[9px] font-bold px-1.5 py-0.5 rounded-full mb-1 ${
                  isSat ? 'bg-blue-900/50 text-blue-400' : 'bg-pink-900/40 text-pink-400'
                }`}>{s.day}</span>
                <span className="font-rajdhani text-[10px] text-zinc-500 mb-1.5">{s.time}</span>
                <div className="w-full h-8 bg-zinc-800 rounded overflow-hidden flex flex-col-reverse mb-1">
                  {count > 0 && isApplicable && (
                    <div className={`w-full rounded transition-all ${count === maxSlotCount ? 'bg-emerald-600' : 'bg-amber-600'}`}
                      style={{ height: `${barH}%` }} />
                  )}
                </div>
                <span className={`font-cinzel text-xs font-bold ${
                  !isApplicable ? 'text-zinc-800' : count > 0 ? 'text-amber-400' : 'text-zinc-600'
                }`}>
                  {!isApplicable ? 'N/A' : count > 0 ? count : '0'}
                </span>
                <span className="font-rajdhani text-[8px] text-zinc-700 mt-0.5">{s.formats}</span>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}