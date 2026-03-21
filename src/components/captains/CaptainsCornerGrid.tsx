'use client'
// CaptainsCornerGrid.tsx
// Colours matched to Spartans Hub spreadsheet. N removed.

import { useState, useMemo } from 'react'

interface Booking {
  id: string
  game_date: string
  slot_time: string
  format: string
  opponent_name: string | null
  tournament: { name: string; ball_type: string } | null
}

interface Player {
  id: string
  name: string
  jersey_name: string | null
  jersey_number: number | null
  wallet_balance: number
  primary_skill: string | null
  is_captain: boolean
}

interface Props {
  weekLabel: string
  bookings:  Booking[]
  players:   Player[]
  availMap:  Record<string, Record<string, string>>
}

// Colours matched to spreadsheet: Y=green, E=blue, O=gold, L=purple
const RESPONSE_CONFIG: Record<string, {
  bg: string; text: string; border: string; label: string
}> = {
  Y: { bg: '#1a4731', text: '#4ade80', border: '#166534', label: 'Available'            },
  E: { bg: '#1e3a5f', text: '#60a5fa', border: '#1d4ed8', label: 'Either game today'   },
  O: { bg: '#3d2e00', text: '#fbbf24', border: '#d97706', label: 'One game this weekend'},
  L: { bg: '#2e1a47', text: '#c084fc', border: '#7e22ce', label: 'On leave'             },
}

const SLOT_DISPLAY: Record<string, string> = {
  '07:30': '7:15 AM',
  '10:30': '10:15 AM',
  '12:30': '12:15 PM',
  '14:30': '2:15 PM',
}

function getPlayerWeekendInfo(
  playerId: string,
  bookings: Booking[],
  availMap: Record<string, Record<string, string>>
) {
  const responses: Record<string, string> = {}
  for (const b of bookings) {
    const r = availMap[b.id]?.[playerId]
    // Only count Y/O/E — L means on leave, don't show in grid
    if (r === 'Y' || r === 'O' || r === 'E') {
      responses[b.id] = r
    }
  }

  const hasO   = Object.values(responses).includes('O')
  const eDates = bookings
    .filter(b => responses[b.id] === 'E')
    .map(b => b.game_date)
    .filter((d, i, arr) => arr.indexOf(d) === i)

  return { responses, hasO, eDates, count: Object.keys(responses).length }
}

export function CaptainsCornerGrid({ weekLabel, bookings, players, availMap }: Props) {
  const [expandedBooking, setExpandedBooking] = useState<string | null>(
    bookings.length === 1 ? bookings[0].id : null
  )

  // Summary counts per booking — Y/O/E only (L and blank excluded from captain view)
  const summaryCounts = useMemo(() => {
    const result: Record<string, Record<string, number>> = {}
    for (const b of bookings) {
      result[b.id] = { Y: 0, O: 0, E: 0, total: 0 }
      for (const p of players) {
        const r = availMap[b.id]?.[p.id]
        if (r === 'Y' || r === 'O' || r === 'E') {
          result[b.id][r]++
          result[b.id].total++
        }
      }
    }
    return result
  }, [bookings, players, availMap])

  function getEligiblePlayers(bookingId: string) {
    return players
      .map(p => {
        const r = availMap[bookingId]?.[p.id]
        // L and blank not shown in captain grid
        if (!r || r === 'L') return null
        const info = getPlayerWeekendInfo(p.id, bookings, availMap)
        // Skip if O on a different game this weekend (they can only play once)
        // Still show them but with a conflict note
        return { player: p, response: r, info }
      })
      .filter(Boolean) as { player: Player; response: string; info: ReturnType<typeof getPlayerWeekendInfo> }[]
  }

  return (
    <div>
      {/* Weekend header */}
      <div className="flex items-center gap-3 mb-4">
        <div className="flex-shrink-0">
          <h2 className="font-cinzel text-base font-semibold text-gold">{weekLabel}</h2>
          <p className="font-rajdhani text-xs text-zinc-600 mt-0.5">
            {bookings.length} game{bookings.length !== 1 ? 's' : ''} this weekend
          </p>
        </div>
        <div className="flex-1 h-px bg-ink-5" />
      </div>

      <div className={`grid gap-4 ${
        bookings.length === 1 ? 'grid-cols-1 max-w-lg' :
        bookings.length === 2 ? 'grid-cols-1 md:grid-cols-2' :
        'grid-cols-1 md:grid-cols-3'
      }`}>
        {bookings.map(booking => {
          const counts   = summaryCounts[booking.id]
          const eligible = getEligiblePlayers(booking.id)
          const isOpen   = expandedBooking === booking.id

          return (
            <div key={booking.id} className="bg-ink-3 border border-ink-5 rounded overflow-hidden">

              {/* Booking header — tap to expand */}
              <button
                className="w-full text-left px-4 py-3.5 border-b border-ink-5 hover:bg-ink-4 transition-colors"
                onClick={() => setExpandedBooking(isOpen ? null : booking.id)}>
                <div className="flex items-start justify-between gap-2">
                  <div className="flex-1 min-w-0">
                    <p className="font-cinzel text-sm font-semibold text-gold truncate">
                      {booking.tournament?.name ?? 'Match'}
                    </p>
                    <p className="font-rajdhani text-xs text-zinc-500 mt-0.5">
                      {SLOT_DISPLAY[booking.slot_time] ?? booking.slot_time} · {booking.format}
                      {booking.opponent_name ? ` · vs ${booking.opponent_name}` : ''}
                    </p>
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    {/* Y/O/E chips */}
                    <div className="flex gap-1.5">
                      {(['Y', 'O', 'E'] as const).map(code => {
                        const cfg = RESPONSE_CONFIG[code]
                        const cnt = counts[code] ?? 0
                        if (cnt === 0) return null
                        return (
                          <span key={code}
                            className="font-rajdhani text-[10px] font-bold px-1.5 py-0.5 rounded"
                            style={{ background: cfg.bg, color: cfg.text, border: `1px solid ${cfg.border}` }}>
                            {cnt}{code}
                          </span>
                        )
                      })}
                      {counts.total === 0 && (
                        <span className="font-rajdhani text-[10px] text-zinc-700">No responses yet</span>
                      )}
                    </div>
                    <span className={`text-zinc-600 text-lg transition-transform duration-200 ${isOpen ? 'rotate-180' : ''}`}>
                      ⌄
                    </span>
                  </div>
                </div>
              </button>

              {/* Expanded player list */}
              {isOpen && (
                <div>
                  {eligible.length === 0 ? (
                    <p className="px-4 py-5 font-rajdhani text-sm text-zinc-600 text-center">
                      No availability responses yet.
                    </p>
                  ) : (
                    <div>
                      {/* Column headers */}
                      <div className="grid grid-cols-[1fr_auto_auto] px-4 py-2 bg-ink-4 border-b border-ink-5">
                        <span className="font-rajdhani text-[10px] font-bold tracking-[2px] uppercase text-zinc-700">Player</span>
                        <span className="font-rajdhani text-[10px] font-bold tracking-[2px] uppercase text-zinc-700 text-center w-10">Resp</span>
                        <span className="font-rajdhani text-[10px] font-bold tracking-[2px] uppercase text-zinc-700 text-right w-20">Note</span>
                      </div>

                      {/* Player rows */}
                      {eligible.map(({ player, response, info }) => {
                        const cfg     = RESPONSE_CONFIG[response]
                        const hasDues = player.wallet_balance < 0

                        // Conflict: O player appearing in multiple columns
                        const note = info.hasO && info.count > 1
                          ? '1 game only'
                          : info.eDates.includes(booking.game_date) &&
                            bookings.filter(b => b.game_date === booking.game_date).length > 1
                          ? '1 per day'
                          : null

                        return (
                          <div key={player.id}
                            className="grid grid-cols-[1fr_auto_auto] items-center px-4 py-2.5 border-b border-ink-4 last:border-0 hover:bg-ink-4 transition-colors">

                            {/* Name + tags */}
                            <div className="min-w-0">
                              <div className="flex items-center gap-1.5 flex-wrap">
                                <span className={`font-rajdhani text-sm font-semibold truncate ${hasDues ? 'text-amber-400' : 'text-parchment'}`}>
                                  {player.name}
                                </span>
                                {hasDues && (
                                  <span className="font-rajdhani text-[9px] font-bold bg-amber-950 border border-amber-800 text-amber-500 px-1 py-0.5 rounded flex-shrink-0">
                                    ₹
                                  </span>
                                )}
                                {player.is_captain && (
                                  <span className="font-rajdhani text-[9px] font-bold bg-gold/10 border border-gold-dim text-gold px-1 py-0.5 rounded flex-shrink-0">
                                    CAP
                                  </span>
                                )}
                              </div>
                              {player.primary_skill && (
                                <p className="font-rajdhani text-[10px] text-zinc-600 mt-0.5 truncate">
                                  {player.primary_skill}
                                </p>
                              )}
                            </div>

                            {/* Response badge */}
                            <div className="w-10 flex justify-center">
                              <span
                                className="font-rajdhani text-xs font-bold w-7 h-7 flex items-center justify-center rounded"
                                style={{ background: cfg.bg, color: cfg.text, border: `1px solid ${cfg.border}` }}>
                                {response}
                              </span>
                            </div>

                            {/* Constraint note */}
                            <div className="w-20 text-right">
                              {note ? (
                                <span className="font-rajdhani text-[10px] text-amber-600">{note}</span>
                              ) : (
                                <span className="font-rajdhani text-[10px] text-zinc-800">—</span>
                              )}
                            </div>
                          </div>
                        )
                      })}

                      {/* Footer */}
                      <div className="px-4 py-2.5 bg-ink-4 border-t border-ink-5 flex items-center gap-3 flex-wrap">
                        <p className="font-rajdhani text-xs text-zinc-500">
                          <span className="text-emerald-400 font-bold">{counts.total}</span> available
                        </p>
                        {(['Y', 'O', 'E'] as const).map(code => {
                          const cnt = counts[code] ?? 0
                          if (cnt === 0) return null
                          const cfg = RESPONSE_CONFIG[code]
                          return (
                            <span key={code}
                              className="font-rajdhani text-[10px] font-bold px-1.5 py-0.5 rounded"
                              style={{ background: cfg.bg, color: cfg.text, border: `1px solid ${cfg.border}` }}>
                              {cnt} × {code}
                            </span>
                          )
                        })}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
