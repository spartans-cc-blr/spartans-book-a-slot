import { parseISO, differenceInDays, format } from 'date-fns'
import type { SuggestedDate } from '@/lib/suggestedSlots'

// This is a Server Component (no 'use client'), so the icon is inlined
// here rather than imported from TournamentShareButton.tsx (a client
// component) to keep the server/client boundary clean.
const WA_ICON = (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" style={{ flexShrink: 0 }}>
    <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413Z"/>
  </svg>
)

// Re-use the same slot definitions and helpers
const ALL_SLOTS = [
  { day: 'Sat', time: '07:30', validFor: ['T20', 'T30'] },
  { day: 'Sat', time: '10:30', validFor: ['T20']        },
  { day: 'Sat', time: '12:30', validFor: ['T30']        },
  { day: 'Sat', time: '14:30', validFor: ['T20']        },
  { day: 'Sun', time: '07:30', validFor: ['T20', 'T30'] },
  { day: 'Sun', time: '10:30', validFor: ['T20']        },
  { day: 'Sun', time: '12:30', validFor: ['T30']        },
  { day: 'Sun', time: '14:30', validFor: ['T20']        },
] as const

type SlotKey = `${'Sat'|'Sun'}-${'07:30'|'10:30'|'12:30'|'14:30'}`

interface Booking {
  id: string
  game_date: string
  slot_time: string
  format: string | null
  cricheroes_url: string | null
  opponent_name: string | null
  // Resolved server-side from match_stats_cache — null until a scorecard is
  // synced for this match, even for a game that's already been played.
  match_result: string | null
}

interface Tournament {
  id: string
  name: string
  organiser_name: string | null
  organiser_contact: string | null
  total_league_games: number | null
  vc_captain_id: string | null
  captain: { id: string; name: string } | null
}

export function TournamentShareCard({
  tournament, bookings, today, suggestedDates, waNumber,
}: {
  tournament: Tournament
  bookings: Booking[]
  today: string
  // Next fully-open dates (see src/lib/suggestedSlots.ts) — a booking
  // enquiry link is shown per date so the organiser can reach the club
  // directly from this card, mirroring /schedule's enquiry links.
  suggestedDates: SuggestedDate[]
  waNumber: string
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
  const dominantSlot  = Object.entries(slotCounts).reduce((a, b) => b[1] > a[1] ? b : a, ['', 0])[0]
  const isSlotImbalanced = maxSlotCount > Math.ceil(sorted.length / 2) && sorted.length >= 3

  const formats         = Array.from(new Set(sorted.map(g => g.format).filter((f): f is string => !!f)))
  const activeFormats   = formats.length === 0 ? ['T20', 'T30'] : formats

  // Enquiry link to the club for one of the fully-open suggested dates —
  // no slot_time is named (mirrors the private planner's suggested-slots
  // panel) since the whole day is open, not one specific time.
  function suggestedDateWaLink(s: SuggestedDate): string {
    const dayLabel = format(parseISO(s.game_date), 'EEEE d MMM')
    const message = `Hi Spartans! For ${tournament.name}, is ${dayLabel} available to book? We'd like to schedule our next league game.`
    return `https://wa.me/${waNumber}?text=${encodeURIComponent(message)}`
  }

  // Result indicator for a finished game with a synced scorecard — win gets
  // a solid green pill (celebratory), a loss is plain red text, matching the
  // same asymmetric-weight convention MatchHistoryCard uses (a bordered
  // badge on every outcome made a loss read as "achieved" as a win).
  function resultBadge(result: string) {
    // Stored values are literally "WON"/"LOST" (confirmed against live data)
    // — matched via .includes() rather than exact equality so a more
    // descriptive value (e.g. "won by 5 runs") still resolves correctly.
    const r = result.toLowerCase()
    if (r.includes('won')) {
      return <span className="inline-block bg-emerald-600 text-white text-[10px] font-bold px-2 py-0.5 rounded-full">WON</span>
    }
    if (r.includes('lost')) {
      return <span className="text-red-700 text-[10px] font-bold">LOST</span>
    }
    if (r.includes('tie')) {
      return <span className="text-amber-700 text-[10px] font-bold">TIED</span>
    }
    return <span className="text-stone-400 text-[10px] font-bold">{result.toUpperCase()}</span>
  }

  const gapColor = (gap: number | null) => {
    if (!gap)       return 'text-stone-500'
    if (gap <= 1)   return 'text-red-700'
    if (avgGap && gap > avgGap + 2) return 'text-amber-700'
    return 'text-emerald-700'
  }
  const gapDotColor = (gap: number | null) => {
    if (!gap)       return 'bg-stone-400'
    if (gap <= 1)   return 'bg-red-600'
    if (avgGap && gap > avgGap + 2) return 'bg-amber-600'
    return 'bg-emerald-600'
  }

  return (
    <div className="bg-white border border-parchment-3 rounded-2xl overflow-hidden">

      {/* Header */}
      <div className="px-5 py-4 border-b border-parchment-3">
        <div className="flex items-start gap-3">
          <span className="text-amber-500 text-xl">🏆</span>
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <h1 className="font-cinzel text-base font-bold text-ink">{tournament.name}</h1>
              {formats.length > 0 && (
                <span className="font-rajdhani text-[10px] font-bold px-2 py-0.5 rounded-full bg-blue-50 text-blue-700">
                  {formats.join(' / ')}
                </span>
              )}
            </div>
            <p className="font-rajdhani text-xs text-stone-500 mt-0.5">
              {tournament.captain && (
                <>Captain: <span className="text-ink font-semibold">{tournament.captain.name}</span> &nbsp;·&nbsp; </>
              )}
              Avg gap: <span className="text-ink font-semibold">
                {avgGap !== null ? `${avgGap} week${avgGap !== 1 ? 's' : ''}` : 'N/A'}
              </span>
            </p>
          </div>
        </div>
      </div>

      {/* Stat bar */}
      <div className="grid grid-cols-4 border-b border-parchment-3">
        {[
          { label: 'Total',     val: totalLeague.toString(), col: 'text-ink',         sub: 'league games'   },
          { label: 'Completed', val: completed.length.toString(),  col: 'text-emerald-700', sub: 'past date'      },
          { label: 'Scheduled', val: scheduled.length.toString(),  col: 'text-amber-700',   sub: 'upcoming'       },
          { label: 'Unbooked',  val: unbooked.toString(),    col: 'text-stone-500',   sub: 'not yet booked' },
        ].map(({ label, val, col, sub }, i) => (
          <div key={label} className={`px-3 py-2.5 text-center ${i > 0 ? 'border-l border-parchment-3' : ''}`}>
            <p className="font-rajdhani text-[9px] uppercase tracking-widest text-stone-500">{label}</p>
            <p className={`font-cinzel text-lg font-bold ${col}`}>{val}</p>
            <p className="font-rajdhani text-[9px] text-stone-400">{sub}</p>
          </div>
        ))}
      </div>

      {/* Game list */}
      <div className="px-4 py-3 border-b border-parchment-3">
        <p className="font-rajdhani text-[10px] uppercase tracking-widest text-stone-500 mb-3">
          Schedule
        </p>
        <div className="flex flex-col gap-1.5">
          {sorted.map((g, i) => {
            const d       = parseISO(g.game_date)
            const dayName = d.getDay() === 6 ? 'Sat' : 'Sun'
            const gap     = gameGaps[i]
            const isDone  = g.game_date < today
            // Fixed-width first/third columns (not `auto`) so the divider
            // between them lines up across rows — each row is its own grid
            // (a separate element per game), so an `auto` track sizes to that
            // row's own content only and drifted row-to-row depending on
            // whether it held "start" or "10w / from prev".
            const rowClass = `grid grid-cols-[44px_1fr_72px] border border-parchment-3 rounded-xl overflow-hidden transition-colors ${isDone ? 'opacity-60' : ''} ${g.cricheroes_url ? 'hover:border-gold-dim' : ''}`
            const inner = (
              <>
                <div className="bg-parchment-2 flex flex-col items-center justify-center py-2 border-r border-parchment-3">
                  <span className="font-cinzel text-base font-bold text-ink leading-none">{format(d, 'd')}</span>
                  <span className="font-rajdhani text-[9px] text-stone-500 uppercase">{format(d, 'MMM')}</span>
                </div>
                <div className="px-2.5 py-2 flex flex-col items-start justify-center gap-0.5 min-w-0">
                  <p className="font-rajdhani text-[10px] text-stone-500">{dayName} · {g.slot_time}</p>
                  <p className="font-rajdhani text-[13px] font-semibold text-ink truncate">
                    vs {g.opponent_name || 'TBD'}
                    {formats.length > 1 && <span className="text-stone-400 font-normal"> · {g.format}</span>}
                  </p>
                  {isDone && g.match_result && resultBadge(g.match_result)}
                </div>
                <div className="flex flex-col items-end justify-center px-2.5 py-2 border-l border-parchment-3">
                  {gap !== null
                    ? <span className={`font-cinzel text-sm font-bold ${gapColor(gap)}`}>{gap}w</span>
                    : <span className="font-rajdhani text-[9px] text-stone-500">start</span>
                  }
                  {gap !== null && <span className="font-rajdhani text-[9px] text-stone-400">from prev</span>}
                </div>
              </>
            )
            return g.cricheroes_url ? (
              <a key={g.id} href={g.cricheroes_url} target="_blank" rel="noopener noreferrer" className={rowClass}>
                {inner}
              </a>
            ) : (
              <div key={g.id} className={rowClass}>
                {inner}
              </div>
            )
          })}
          {Array.from({ length: unbooked }).map((_, i) => (
            <div key={`u${i}`} className="flex items-center gap-2 py-1.5 px-2 font-rajdhani text-xs text-stone-400 border border-dashed border-parchment-3 rounded-xl">
              ○ Game {sorted.length + i + 1} — date &amp; slot not yet booked
            </div>
          ))}
        </div>

        {/* Next available dates — fully open days only (see
            src/lib/suggestedSlots.ts), each with a booking enquiry link to
            the club, mirroring /schedule's WhatsApp enquiry pattern. Only
            shown when there's actually something left to book. */}
        {unbooked > 0 && suggestedDates.length > 0 && (
          <div className="mt-3 pt-3 border-t border-parchment-3">
            <p className="font-rajdhani text-[10px] uppercase tracking-widest text-stone-500 mb-2">
              Next available dates
            </p>
            <div className="flex flex-col gap-1.5">
              {suggestedDates.map(s => (
                <a key={s.game_date} href={suggestedDateWaLink(s)} target="_blank" rel="noopener noreferrer"
                  className="flex items-center justify-between gap-2 bg-emerald-50 border border-emerald-200 rounded-xl px-3 py-2 hover:bg-emerald-100 transition-colors">
                  <span className="font-rajdhani text-xs font-semibold text-emerald-800">
                    {s.day} {format(parseISO(s.game_date), 'd MMM')}
                  </span>
                  <span className="flex items-center gap-1.5 text-emerald-700">
                    {WA_ICON}
                    <span className="font-rajdhani text-[11px] font-bold">Book this date</span>
                  </span>
                </a>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Game timeline — pace view. Needs 2+ real games to plot a line
          between, same guard as the private planner's GameTimelineCard. */}
      {sorted.length >= 2 && (() => {
        const start   = parseISO(sorted[0].game_date).getTime()
        const end     = parseISO(sorted[sorted.length - 1].game_date).getTime()
        const totalMs = end - start || 1
        const pcts    = sorted.map(g => ((parseISO(g.game_date).getTime() - start) / totalMs) * 100)
        let lastPct = -100, row = 0
        const rows = pcts.map(pct => {
          row = (pct - lastPct < 9) ? (row === 0 ? 1 : 0) : 0
          lastPct = pct
          return row
        })
        return (
          <div className="px-4 py-3 border-b border-parchment-3">
            <p className="font-rajdhani text-[10px] uppercase tracking-widest text-stone-500 mb-3">
              Game timeline — pace view
            </p>
            <div className="flex gap-3.5 flex-wrap mb-3">
              {[
                { dot: 'bg-red-600',     label: 'Too fast' },
                { dot: 'bg-emerald-600', label: 'On pace'  },
                { dot: 'bg-amber-600',   label: 'Slower'   },
              ].map(({ dot, label }) => (
                <div key={label} className="flex items-center gap-1.5 font-rajdhani text-[10px] text-stone-500">
                  <span className={`w-2 h-2 rounded-full ${dot}`} />{label}
                </div>
              ))}
            </div>
            <div className="relative" style={{ height: 16 }}>
              <div className="absolute top-[5px] left-0 right-0 h-[2px] bg-parchment-3" />
              {sorted.map((g, i) => (
                <div key={g.id} className="absolute top-0" style={{ left: `${pcts[i]}%`, transform: 'translateX(-50%)' }}>
                  <div className={`w-3 h-3 rounded-full border-2 border-white ${gapDotColor(gameGaps[i])}`}
                    style={{ boxShadow: '0 0 0 1px #E2DACE' }} />
                </div>
              ))}
            </div>
            <div className="relative mt-1" style={{ height: 30 }}>
              {sorted.map((g, i) => (
                <div key={g.id}
                  className={`absolute whitespace-nowrap font-rajdhani text-[9px] font-semibold ${gapColor(gameGaps[i])}`}
                  style={{ left: `${pcts[i]}%`, transform: 'translateX(-50%)', top: rows[i] * 14 }}>
                  {format(parseISO(g.game_date), 'd MMM')}
                </div>
              ))}
            </div>
          </div>
        )
      })()}

      {/* Slot balance — day-grouped cards with horizontal bars, identical to
          the private planner's SlotBalanceByDay (TournamentPlannerClient.tsx) */}
      <div className="px-4 pt-3 pb-2">
        <p className="font-rajdhani text-[10px] uppercase tracking-widest text-stone-500 mb-3">
          Slot balance
        </p>
        <div className="flex flex-col gap-3">
          {(['Sat', 'Sun'] as const).map(day => {
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
            ↗ {dominantSlot} has {maxSlotCount} of {sorted.length} games — unbooked games should favour other slots
          </p>
        )}
      </div>
    </div>
  )
}
