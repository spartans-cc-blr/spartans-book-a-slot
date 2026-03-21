'use client'

import { useState, useMemo } from 'react'

// ── Types ──────────────────────────────────────────────────────
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
  weekLabel:  string
  bookings:   Booking[]
  players:    Player[]
  // availMap[bookingId][playerId] = response
  availMap:   Record<string, Record<string, string>>
}

// ── Response config ────────────────────────────────────────────
const RESPONSE_CONFIG: Record<string, { bg: string; text: string; border: string; label: string }> = {
  Y: { bg: '#14532d', text: '#4ade80', border: '#166534', label: 'Yes' },
  O: { bg: '#431407', text: '#fb923c', border: '#9a3412', label: 'One game' },
  E: { bg: '#422006', text: '#fbbf24', border: '#92400e', label: 'Either' },
}

const SLOT_DISPLAY: Record<string, string> = {
  '07:30': '7:15 AM',
  '10:30': '10:15 AM',
  '12:30': '12:15 PM',
  '14:30': '2:15 PM',
}

// ── Derived: effective count per player per weekend ────────────
// O = player wants max 1 game this whole weekend
// E = player wants max 1 game per day
// We show warnings in the grid when a player appears in multiple columns
function getPlayerWeekendInfo(
  playerId: string,
  bookings: Booking[],
  availMap: Record<string, Record<string, string>>
): {
  responses: Record<string, string>  // bookingId → response
  weekendCount: number               // how many games they're eligible for
  hasO: boolean
  eDates: string[]                   // dates where they marked E
} {
  const responses: Record<string, string> = {}
  for (const b of bookings) {
    const r = availMap[b.id]?.[playerId]
    if (r && r !== 'N' && r !== 'L') {
      responses[b.id] = r
    }
  }

  const hasO    = Object.values(responses).includes('O')
  const eDates  = bookings
    .filter(b => responses[b.id] === 'E')
    .map(b => b.game_date)
    // unique dates
    .filter((d, i, arr) => arr.indexOf(d) === i)

  // max eligible: if O → 1. If E → 1 per day. If Y → appears in every Y slot
  const weekendCount = hasO
    ? 1
    : Object.keys(responses).length

  return { responses, weekendCount, hasO, eDates }
}

// ── Component ──────────────────────────────────────────────────
export function CaptainsCornerGrid({ weekLabel, bookings, players, availMap }: Props) {
  const [expandedBooking, setExpandedBooking] = useState<string | null>(
    bookings.length === 1 ? bookings[0].id : null
  )

  // Summary counts per booking (Y+O+E = available, ignoring N/L)
  const summaryCounts = useMemo(() => {
    const result: Record<string, Record<string, number>> = {}
    for (const b of bookings) {
      result[b.id] = { Y: 0, O: 0, E: 0, total: 0 }
      for (const p of players) {
        const r = availMap[b.id]?.[p.id]
        if (r === 'Y' || r === 'O' || r === 'E') {
          result[b.id][r] = (result[b.id][r] || 0) + 1
          result[b.id].total++
        }
      }
    }
    return result
  }, [bookings, players, availMap])

  // Players who are eligible for a specific booking (Y, O, or E — not N/L)
  function getEligiblePlayers(bookingId: string) {
    const booking = bookings.find(b => b.id === bookingId)!
    return players
      .map(p => {
        const r = availMap[bookingId]?.[p.id]
        if (!r || r === 'N' || r === 'L') return null
        const info = getPlayerWeekendInfo(p.id, bookings, availMap)
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

      {/* Mobile: stacked cards. Desktop: side-by-side columns */}
      <div className={`grid gap-4 ${bookings.length === 1 ? 'grid-cols-1 max-w-lg' : bookings.length === 2 ? 'grid-cols-1 md:grid-cols-2' : 'grid-cols-1 md:grid-cols-3'}`}>
        {bookings.map(booking => {
          const counts   = summaryCounts[booking.id]
          const eligible = getEligiblePlayers(booking.id)
          const isOpen   = expandedBooking === booking.id

          return (
            <div key={booking.id} className="bg-ink-3 border border-ink-5 rounded overflow-hidden">
              {/* Booking header */}
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
                    {/* Summary chips */}
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
                        <span className="font-rajdhani text-[10px] text-zinc-700">No responses</span>
                      )}
                    </div>
                    <span className={`text-zinc-600 transition-transform duration-200 text-lg ${isOpen ? 'rotate-180' : ''}`}>⌄</span>
                  </div>
                </div>
              </button>

              {/* Player grid — expanded */}
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
                        <span className="font-rajdhani text-[10px] font-bold tracking-[2px] uppercase text-zinc-700 text-center w-12">Resp</span>
                        <span className="font-rajdhani text-[10px] font-bold tracking-[2px] uppercase text-zinc-700 text-right w-16">Weekend</span>
                      </div>

                      {/* Player rows */}
                      {eligible.map(({ player, response, info }) => {
                        const cfg      = RESPONSE_CONFIG[response]
                        const hasDues  = player.wallet_balance < 0
                        const isShared = info.weekendCount > 1 && (info.hasO || info.eDates.length > 0)
                        // "shared" means this player is in multiple columns but can only play once
                        const conflict = info.hasO && info.weekendCount > 1
                          ? `Wants 1 game only — in ${info.weekendCount} columns`
                          : info.eDates.includes(booking.game_date) && bookings.filter(b => b.game_date === booking.game_date).length > 1
                          ? 'Available for either game today'
                          : null

                        return (
                          <div key={player.id}
                            className="grid grid-cols-[1fr_auto_auto] items-center px-4 py-2.5 border-b border-ink-4 last:border-0 hover:bg-ink-4 transition-colors">

                            {/* Player name */}
                            <div className="min-w-0">
                              <div className="flex items-center gap-1.5 flex-wrap">
                                <span className={`font-rajdhani text-sm font-semibold truncate ${hasDues ? 'text-amber-400' : 'text-parchment'}`}>
                                  {player.name}
                                </span>
                                {hasDues && (
                                  <span className="font-rajdhani text-[9px] font-bold bg-amber-950 border border-amber-800 text-amber-500 px-1 py-0.5 rounded flex-shrink-0">
                                    ₹ dues
                                  </span>
                                )}
                                {player.is_captain && (
                                  <span className="font-rajdhani text-[9px] font-bold bg-gold/10 border border-gold-dim text-gold px-1 py-0.5 rounded flex-shrink-0">
                                    CAP
                                  </span>
                                )}
                              </div>
                              {player.primary_skill && (
                                <p className="font-rajdhani text-[10px] text-zinc-600 mt-0.5 truncate">{player.primary_skill}</p>
                              )}
                              {conflict && (
                                <p className="font-rajdhani text-[10px] text-amber-600 mt-0.5">{conflict}</p>
                              )}
                            </div>

                            {/* Response badge */}
                            <div className="w-12 flex justify-center">
                              <span
                                className="font-rajdhani text-xs font-bold px-2 py-1 rounded"
                                style={{ background: cfg.bg, color: cfg.text, border: `1px solid ${cfg.border}` }}>
                                {response}
                              </span>
                            </div>

                            {/* Weekend eligibility */}
                            <div className="w-16 text-right">
                              {info.hasO ? (
                                <span className="font-rajdhani text-[10px] text-amber-600">1 game only</span>
                              ) : info.eDates.length > 0 ? (
                                <span className="font-rajdhani text-[10px] text-yellow-700">1/day</span>
                              ) : (
                                <span className="font-rajdhani text-[10px] text-zinc-700">–</span>
                              )}
                            </div>
                          </div>
                        )
                      })}

                      {/* Footer summary */}
                      <div className="px-4 py-2.5 bg-ink-4 border-t border-ink-5">
                        <p className="font-rajdhani text-xs text-zinc-500">
                          <span className="text-emerald-400 font-bold">{counts.total}</span> players available
                          {counts.Y > 0 && <span className="ml-2 text-emerald-600">{counts.Y}×Y</span>}
                          {counts.O > 0 && <span className="ml-2 text-orange-600">{counts.O}×O</span>}
                          {counts.E > 0 && <span className="ml-2 text-yellow-700">{counts.E}×E</span>}
                        </p>
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
