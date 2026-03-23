'use client'
// CaptainsCornerGrid.tsx — Redesigned v2
// Two views:
//   Matrix  (default desktop) — rows = players, cols = slots. Mirrors the Hub sheet.
//   Per-slot (default mobile) — one expanded card per game with full player list.
// Both views show cross-slot conflict indicators (O = one game, E = one per day).

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

// Spreadsheet-matched colours
const RESP: Record<string, { bg: string; text: string; border: string; label: string }> = {
  Y: { bg: '#1a4731', text: '#4ade80', border: '#166534', label: 'Available' },
  E: { bg: '#1e3a5f', text: '#60a5fa', border: '#1d4ed8', label: 'Either game today — one only' },
  O: { bg: '#3d2e00', text: '#fbbf24', border: '#d97706', label: 'One game this weekend only' },
  L: { bg: '#2e1a47', text: '#c084fc', border: '#7e22ce', label: 'On leave' },
}

const SLOT_DISPLAY: Record<string, string> = {
  '07:30': '7:15 AM',
  '10:30': '10:15 AM',
  '12:30': '12:15 PM',
  '14:30': '2:15 PM',
}

// Abbreviation for matrix header cells
const SLOT_SHORT: Record<string, string> = {
  '07:30': '7:15',
  '10:30': '10:15',
  '12:30': '12:15',
  '14:30': '2:15',
}

// Mobile name: jersey_name if set, else "FirstName L." (first name + last initial)
// Desktop name: jersey_name if set, else full name
function mobileMatrixName(player: Player): string {
  if (player.jersey_name?.trim()) return player.jersey_name.trim()
  const parts = player.name.trim().split(/\s+/)
  if (parts.length === 1) return parts[0]
  return `${parts[0]} ${parts[parts.length - 1][0]}.`
}
function desktopMatrixName(player: Player): string {
  if (player.jersey_name?.trim()) return player.jersey_name.trim()
  return player.name
}

// Truncate tournament name to ~10 chars for the rotated header
function shortTourney(name: string | null | undefined): string {
  if (!name) return '—'
  return name.length > 12 ? name.slice(0, 11) + '…' : name
}

function isSharedPlayer(
  playerId: string,
  bookings: Booking[],
  availMap: Record<string, Record<string, string>>
): { shared: boolean; oCount: number; eCount: number } {
  let oCount = 0; let eCount = 0; let yCount = 0
  for (const b of bookings) {
    const r = availMap[b.id]?.[playerId]
    if (r === 'Y') yCount++
    if (r === 'O') oCount++
    if (r === 'E') eCount++
  }
  return { shared: oCount > 0 || eCount > 0, oCount, eCount }
}

// Players who responded Y/O/E for a given booking, sorted:
// captains first, then Y, then E, then O; within each group by name
function getSlotPlayers(
  bookingId: string,
  bookings: Booking[],
  players: Player[],
  availMap: Record<string, Record<string, string>>
) {
  return players
    .flatMap(p => {
      const r = availMap[bookingId]?.[p.id]
      if (!r || r === 'L') return []
      const shared = isSharedPlayer(p.id, bookings, availMap)
      return [{ player: p, response: r, shared }]
    })
    .sort((a, b) => {
      // Captains first
      if (a.player.is_captain !== b.player.is_captain)
        return a.player.is_captain ? -1 : 1
      // Y before E before O
      const order: Record<string, number> = { Y: 0, E: 1, O: 2 }
      if (a.response !== b.response)
        return (order[a.response] ?? 9) - (order[b.response] ?? 9)
      return a.player.name.localeCompare(b.player.name)
    })
}

// Summary counts for a booking
function getCounts(
  bookingId: string,
  players: Player[],
  availMap: Record<string, Record<string, string>>
) {
  const counts: Record<string, number> = { Y: 0, O: 0, E: 0, total: 0 }
  for (const p of players) {
    const r = availMap[bookingId]?.[p.id]
    if (r === 'Y' || r === 'O' || r === 'E') {
      counts[r]++
      counts.total++
    }
  }
  return counts
}

// ── Chip ──────────────────────────────────────────────────────────
function Chip({ code, count }: { code: string; count?: number }) {
  const cfg = RESP[code]
  return (
    <span
      className="font-rajdhani text-[10px] font-bold px-1.5 py-0.5 rounded-sm flex-shrink-0"
      style={{ background: cfg.bg, color: cfg.text, border: `1px solid ${cfg.border}` }}>
      {count !== undefined ? `${count}${code}` : code}
    </span>
  )
}

// ── Response cell (matrix) ────────────────────────────────────────
function RespCell({ code, isConflict }: { code: string | null; isConflict?: boolean }) {
  if (!code) return (
    <td className="px-2 py-0 text-center" style={{ minWidth: 48 }}>
      <span className="font-rajdhani text-[11px] text-zinc-800">—</span>
    </td>
  )
  const cfg = RESP[code]
  return (
    <td className="px-2 py-0 text-center" style={{ minWidth: 48 }}>
      <span
        className="font-rajdhani text-[11px] font-bold w-8 h-6 inline-flex items-center justify-center rounded-sm"
        style={{
          background: cfg.bg,
          color: cfg.text,
          border: `1px solid ${cfg.border}`,
          // O/E in a shared context gets a subtle ring to mirror the sheet's red highlight
          outline: isConflict ? `1px solid ${cfg.text}40` : undefined,
        }}>
        {code}
      </span>
    </td>
  )
}

// ── Player row (per-slot card) ────────────────────────────────────
function PlayerRow({
  player, response, shared, bookings, availMap,
}: {
  player: Player
  response: string
  shared: { shared: boolean; oCount: number; eCount: number }
  bookings: Booking[]
  availMap: Record<string, Record<string, string>>
}) {
  const cfg     = RESP[response]
  const hasDues = player.wallet_balance < 0

  // What is this player doing on OTHER slots this weekend?
  const otherSlots = bookings
    .map(b => {
      const r = availMap[b.id]?.[player.id]
      if (!r || r === 'L') return null
      return { booking: b, response: r }
    })
    .filter(Boolean) as { booking: Booking; response: string }[]

  const conflictNote =
    response === 'O' ? 'One game this weekend'
    : response === 'E' ? 'One game today'
    : otherSlots.length > 1 ? 'Also avail. other slots'
    : null

  return (
    <div className="flex items-center gap-2 px-3 py-2.5 border-b border-ink-4 last:border-0 hover:bg-ink-4 transition-colors">
      {/* Response badge */}
      <span
        className="font-rajdhani text-xs font-bold w-7 h-7 flex items-center justify-center rounded-sm flex-shrink-0"
        style={{ background: cfg.bg, color: cfg.text, border: `1px solid ${cfg.border}` }}>
        {response}
      </span>

      {/* Name + tags */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5 flex-wrap">
          <span className={`font-rajdhani text-sm font-semibold leading-none ${hasDues ? 'text-amber-400' : 'text-parchment'}`}>
            {player.name}
          </span>
          {player.is_captain && (
            <span className="font-rajdhani text-[9px] font-bold bg-gold/10 border border-gold-dim text-gold px-1 py-px rounded-sm flex-shrink-0">
              CAP
            </span>
          )}
          {hasDues && (
            <span className="font-rajdhani text-[9px] font-bold bg-amber-950 border border-amber-800 text-amber-500 px-1 py-px rounded-sm flex-shrink-0">
              ₹ dues
            </span>
          )}
        </div>
        {(player.primary_skill || conflictNote) && (
          <p className="font-rajdhani text-[10px] mt-0.5 truncate" style={{ color: conflictNote ? RESP[response].text + 'CC' : '#52525b' }}>
            {conflictNote ?? player.primary_skill}
          </p>
        )}
      </div>

      {/* Jersey */}
      {(player.jersey_name || player.jersey_number) && (
        <span className="font-rajdhani text-[10px] text-zinc-700 flex-shrink-0">
          {player.jersey_name ? player.jersey_name : `#${player.jersey_number}`}
        </span>
      )}
    </div>
  )
}

// ── Slot card (per-slot view) ─────────────────────────────────────
function SlotCard({
  booking, bookings, players, availMap, defaultOpen,
}: {
  booking: Booking
  bookings: Booking[]
  players: Player[]
  availMap: Record<string, Record<string, string>>
  defaultOpen: boolean
}) {
  const [open, setOpen] = useState(defaultOpen)
  const counts    = getCounts(booking.id, players, availMap)
  const eligible  = getSlotPlayers(booking.id, bookings, players, availMap)

  return (
    <div className="bg-ink-3 border border-ink-5 rounded overflow-hidden">
      {/* Header */}
      <button
        className="w-full text-left px-4 py-3.5 hover:bg-ink-4 transition-colors"
        onClick={() => setOpen(v => !v)}>
        <div className="flex items-start gap-2">
          {/* Slot time badge */}
          <div className="flex-shrink-0 text-center w-14">
            <p className="font-cinzel text-base font-bold text-gold leading-none">
              {SLOT_SHORT[booking.slot_time] ?? booking.slot_time}
            </p>
            <p className="font-rajdhani text-[9px] text-zinc-600 mt-0.5">
              {booking.format}
            </p>
          </div>

          {/* Title */}
          <div className="flex-1 min-w-0">
            <p className="font-cinzel text-sm font-semibold text-parchment truncate leading-none">
              {booking.tournament?.name ?? 'Match'}
            </p>
            {booking.opponent_name && (
              <p className="font-rajdhani text-xs text-zinc-500 mt-0.5">
                vs {booking.opponent_name}
              </p>
            )}
          </div>

          {/* Count chips */}
          <div className="flex items-center gap-1.5 flex-shrink-0">
            {counts.total === 0 ? (
              <span className="font-rajdhani text-[10px] text-zinc-700">No responses</span>
            ) : (
              <>
                {(['Y', 'O', 'E'] as const).map(code =>
                  counts[code] > 0 ? <Chip key={code} code={code} count={counts[code]} /> : null
                )}
              </>
            )}
            <span className={`text-zinc-600 text-lg transition-transform duration-200 ml-1 ${open ? 'rotate-180' : ''}`}>
              ⌄
            </span>
          </div>
        </div>
      </button>

      {/* Player list */}
      {open && (
        <div>
          {/* Divider + header */}
          <div className="flex items-center gap-2 px-3 py-1.5 bg-ink-4 border-y border-ink-5">
            <span className="font-rajdhani text-[10px] font-bold tracking-[2px] uppercase text-zinc-700 flex-1">
              Player
            </span>
            <span className="font-rajdhani text-[10px] font-bold tracking-[2px] uppercase text-zinc-700 text-right">
              {counts.total} available
            </span>
          </div>

          {eligible.length === 0 ? (
            <p className="px-4 py-5 font-rajdhani text-sm text-zinc-600 text-center">
              No responses yet.
            </p>
          ) : (
            eligible.map(({ player, response, shared }) => (
              <PlayerRow
                key={player.id}
                player={player}
                response={response}
                shared={shared}
                bookings={bookings}
                availMap={availMap}
              />
            ))
          )}

          {/* Footer chips */}
          <div className="px-3 py-2.5 bg-ink-4 border-t border-ink-5 flex items-center gap-2 flex-wrap">
            {(['Y', 'O', 'E'] as const).map(code =>
              counts[code] > 0 ? (
                <div key={code} className="flex items-center gap-1">
                  <Chip code={code} />
                  <span className="font-rajdhani text-[10px] text-zinc-600">{RESP[code].label}</span>
                </div>
              ) : null
            )}
          </div>
        </div>
      )}
    </div>
  )
}

// ── Matrix view (spreadsheet-style) ──────────────────────────────
function MatrixView({
  bookings, players, availMap,
}: {
  bookings: Booking[]
  players:  Player[]
  availMap: Record<string, Record<string, string>>
}) {
  // Only show players who have at least one Y/O/E response this weekend
  const activePlayers = players.filter(p =>
    bookings.some(b => {
      const r = availMap[b.id]?.[p.id]
      return r === 'Y' || r === 'O' || r === 'E'
    })
  ).sort((a, b) => a.name.localeCompare(b.name))

  // Summary counts per booking
  const counts = useMemo(
    () => Object.fromEntries(bookings.map(b => [b.id, getCounts(b.id, players, availMap)])),
    [bookings, players, availMap]
  )

  return (
    <div className="overflow-x-auto">
      <table className="w-full border-collapse" style={{ minWidth: Math.max(240, bookings.length * 48 + 112) }}>
        {/* Header — rotated text keeps each slot column very narrow */}
        <thead>
          <tr className="bg-ink-4 border-b border-ink-5">
            {/* Player col — sticky */}
            <th className="px-2 py-2 text-left font-rajdhani text-[10px] font-bold tracking-[2px] uppercase text-zinc-600 w-28 sm:w-44 sticky left-0 bg-ink-4 z-10 align-bottom">
              Player
            </th>
            {bookings.map(b => (
                <th key={b.id} className="bg-ink-4 z-10 align-bottom text-center" style={{ width: 48, minWidth: 48, padding: 0 }}>
                  {/* Rotated text block — 3 lines: day · time+format · tourney */}
                  <div style={{
                    writingMode: 'vertical-rl',
                    transform: 'rotate(180deg)',
                    whiteSpace: 'nowrap',
                    paddingBottom: 8,
                    paddingTop: 8,
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    gap: 4,
                    width: '100%',
                  }}>
                    <span className="font-cinzel text-[10px] font-semibold text-gold">
                      {new Date(b.game_date + 'T00:00:00').toLocaleDateString('en-IN', { weekday: 'short' })}
                    </span>
                    <span className="font-rajdhani text-[10px] font-bold text-zinc-400">
                      {SLOT_DISPLAY[b.slot_time]} · {b.format}
                    </span>
                    <span className="font-rajdhani text-[10px] text-zinc-600">
                      {shortTourney(b.tournament?.name)}
                    </span>
                  </div>
                </th>
            ))}
          </tr>
        </thead>

        {/* Body */}
        <tbody>
          {activePlayers.length === 0 ? (
            <tr>
              <td colSpan={bookings.length + 1} className="px-4 py-8 text-center font-rajdhani text-sm text-zinc-600">
                No availability responses yet.
              </td>
            </tr>
          ) : (
            activePlayers.map((p, i) => {
              const hasDues   = p.wallet_balance < 0
              const shared    = isSharedPlayer(p.id, bookings, availMap)
              // Players with O or E = shared — highlight row name in amber like the sheet
              const isHighlit = shared.shared

              return (
                <tr
                  key={p.id}
                  className={`border-b border-ink-4 transition-colors ${i % 2 === 0 ? 'bg-ink-3' : 'bg-ink-2'} hover:bg-ink-4`}>
                  {/* Player name cell — sticky; mobile uses "First L.", desktop uses full name */}
                  <td className={`px-2 py-2 sticky left-0 z-10 ${i % 2 === 0 ? 'bg-ink-3' : 'bg-ink-2'} hover:bg-ink-4 transition-colors`}>
                    <div className="flex items-center gap-1 min-w-0">
                      {/* Mobile: "Muthukumar R." */}
                      <span
                        className={`sm:hidden font-rajdhani text-xs font-semibold leading-none truncate ${
                          isHighlit ? 'text-amber-400' : hasDues ? 'text-amber-400' : 'text-parchment'
                        }`}
                        title={p.name}>
                        {mobileMatrixName(p)}
                      </span>
                      {/* Desktop: full name or jersey name */}
                      <span
                        className={`hidden sm:inline font-rajdhani text-sm font-semibold leading-none truncate ${
                          isHighlit ? 'text-amber-400' : hasDues ? 'text-amber-400' : 'text-parchment'
                        }`}
                        title={p.name}>
                        {desktopMatrixName(p)}
                      </span>
                      {p.is_captain && (
                        <span className="font-rajdhani text-[8px] font-bold bg-gold/10 border border-gold-dim text-gold px-1 py-px rounded-sm flex-shrink-0">
                          C
                        </span>
                      )}
                      {hasDues && (
                        <span className="font-rajdhani text-[8px] font-bold bg-amber-950 border border-amber-800 text-amber-500 px-1 py-px rounded-sm flex-shrink-0">
                          ₹
                        </span>
                      )}
                    </div>
                  </td>

                  {/* Response per booking */}
                  {bookings.map(b => {
                    const r = availMap[b.id]?.[p.id]
                    // Show cell if Y/O/E; leave empty for L / no response
                    const display = (r === 'Y' || r === 'O' || r === 'E') ? r : null
                    // Flag conflict: O or E response means they might appear in multiple cols
                    const isConflict = display === 'O' || display === 'E'
                    return (
                      <RespCell key={b.id} code={display} isConflict={isConflict} />
                    )
                  })}
                </tr>
              )
            })
          )}
        </tbody>

        {/* Footer — Y/O/E counts per slot */}
        {activePlayers.length > 0 && (
          <tfoot>
            <tr className="bg-ink-4 border-t border-ink-5">
              <td className="px-2 py-2 font-rajdhani text-[9px] font-bold tracking-[2px] uppercase text-zinc-600 sticky left-0 bg-ink-4">
                Available
              </td>
              {bookings.map(b => (
                <td key={b.id} className="text-center" style={{ padding: '6px 4px' }}>
                  <p className="font-rajdhani text-[10px] font-bold leading-snug text-center whitespace-nowrap">
                    {(['Y', 'O', 'E'] as const)
                      .filter(code => counts[b.id][code] > 0)
                      .map((code, idx, arr) => (
                        <span key={code}>
                          <span style={{ color: RESP[code].text }}>
                            {counts[b.id][code]}{code}
                          </span>
                          {idx < arr.length - 1 && (
                            <span className="text-zinc-700">, </span>
                          )}
                        </span>
                      ))
                    }
                  </p>
                </td>
              ))}
            </tr>
          </tfoot>
        )}
      </table>
    </div>
  )
}

// ── Legend bar ────────────────────────────────────────────────────
function Legend() {
  return (
    <div className="flex items-center gap-4 flex-wrap">
      {Object.entries(RESP).map(([code, cfg]) => (
        <div key={code} className="flex items-center gap-1.5">
          <span
            className="font-rajdhani text-[11px] font-bold w-6 h-5 flex items-center justify-center rounded-sm"
            style={{ background: cfg.bg, color: cfg.text, border: `1px solid ${cfg.border}` }}>
            {code}
          </span>
          <span className="font-rajdhani text-[11px] text-zinc-600">{cfg.label}</span>
        </div>
      ))}
    </div>
  )
}

// ── Main export ────────────────────────────────────────────────────
export function CaptainsCornerGrid({ weekLabel, bookings, players, availMap }: Props) {
  // Start in 'slot' view on mobile (default), 'matrix' on wider screens
  // User can toggle regardless of device
  const [view, setView] = useState<'slot' | 'matrix'>('slot')

  return (
    <div>
      {/* Weekend header + view toggle */}
      <div className="flex items-start justify-between gap-3 mb-4 flex-wrap">
        <div>
          <h2 className="font-cinzel text-base font-semibold text-gold">{weekLabel}</h2>
          <p className="font-rajdhani text-xs text-zinc-600 mt-0.5">
            {bookings.length} game{bookings.length !== 1 ? 's' : ''} this weekend
          </p>
        </div>

        {/* View toggle — mirrors what Hub sheet offers */}
        <div className="flex border border-ink-5 rounded overflow-hidden flex-shrink-0">
          <button
            onClick={() => setView('slot')}
            className={`px-3 py-1.5 font-rajdhani text-xs font-bold tracking-wide transition-colors ${
              view === 'slot' ? 'bg-gold-dim text-gold' : 'bg-ink-4 text-zinc-500 hover:text-zinc-300'
            }`}>
            Per Slot
          </button>
          <button
            onClick={() => setView('matrix')}
            className={`px-3 py-1.5 font-rajdhani text-xs font-bold tracking-wide transition-colors ${
              view === 'matrix' ? 'bg-gold-dim text-gold' : 'bg-ink-4 text-zinc-500 hover:text-zinc-300'
            }`}>
            Matrix
          </button>
        </div>
      </div>

      {/* Legend */}
      <div className="mb-4 bg-ink-3 border border-ink-5 rounded px-3 py-2.5">
        <Legend />
        {view === 'matrix' && (
          <p className="font-rajdhani text-[10px] text-zinc-700 mt-2">
            Amber names = players marked O or E (shared across slots). Scroll right if slots overflow.
          </p>
        )}
      </div>

      {/* Per-slot view */}
      {view === 'slot' && (
        <div className="flex flex-col gap-3">
          {bookings.map((b, i) => (
            <SlotCard
              key={b.id}
              booking={b}
              bookings={bookings}
              players={players}
              availMap={availMap}
              defaultOpen={i === 0}
            />
          ))}
        </div>
      )}

      {/* Matrix view */}
      {view === 'matrix' && (
        <div className="bg-ink-3 border border-ink-5 rounded overflow-hidden">
          <MatrixView bookings={bookings} players={players} availMap={availMap} />
        </div>
      )}
    </div>
  )
}
