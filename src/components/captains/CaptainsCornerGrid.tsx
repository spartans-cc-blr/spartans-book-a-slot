'use client'
// CaptainsCornerGrid.tsx — Squad Selection v3
// Two views:
//   Per-slot (default mobile) — one expanded card per game with full player list + squad selection.
//   Matrix  (default desktop) — rows = players, cols = slots. Read-only availability overview.
// Squad selection lives in Per-slot view only.
// priority_pick players auto-checked. Taken-elsewhere players struck through + checkbox disabled.
// Hard cap at 12 — further checkboxes disabled once reached.

import { useState, useMemo, useCallback } from 'react'

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
  priority_pick: boolean
}

interface Props {
  weekLabel: string
  bookings:  Booking[]
  players:   Player[]
  availMap:  Record<string, Record<string, string>>
  // squadMap: bookingId → array of playerIds already selected in that slot's draft.
  // Passed from parent so all SlotCards share cross-slot awareness.
  // Parent must lift selection state up for this to work across slots.
  // For now, passed as {} — wired to API in next sprint item.
  squadMap?: Record<string, string[]>
}

// ── Constants ─────────────────────────────────────────────────────
const MAX_SQUAD = 12

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

const SLOT_SHORT: Record<string, string> = {
  '07:30': '7:15',
  '10:30': '10:15',
  '12:30': '12:15',
  '14:30': '2:15',
}

// ── Helpers ───────────────────────────────────────────────────────
function mobileMatrixName(player: Player): string {
  const parts = player.name.trim().split(' ').filter(Boolean)
  if (parts.length === 1) return parts[0]
  return parts[0] + ' ' + parts[parts.length - 1][0] + '.'
}
function desktopMatrixName(player: Player): string {
  return player.name
}

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
      if (a.player.is_captain !== b.player.is_captain)
        return a.player.is_captain ? -1 : 1
      const order: Record<string, number> = { Y: 0, E: 1, O: 2 }
      if (a.response !== b.response)
        return (order[a.response] ?? 9) - (order[b.response] ?? 9)
      return a.player.name.localeCompare(b.player.name)
    })
}

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

// Returns true for Saturday (6) and Sunday (0)
function isWeekendDate(dateStr: string): boolean {
  const dow = new Date(dateStr + 'T00:00:00').getDay()
  return dow === 0 || dow === 6
}

// ── useCopySquad hook ─────────────────────────────────────────────
function useCopySquad() {
  const [copied, setCopied] = useState<string | null>(null)
  const copy = useCallback((bookingId: string, label: string, names: string[]) => {
    const text = `Spartans Squad — ${label}\n` +
      names.map((n, i) => `${i + 1}. ${n}`).join('\n')
    navigator.clipboard.writeText(text).then(() => {
      setCopied(bookingId)
      setTimeout(() => setCopied(null), 2000)
    })
  }, [])
  return { copy, copied }
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

// ── StatusBadge ───────────────────────────────────────────────────
function StatusBadge({ status }: { status: 'draft' | 'pending' | 'approved' | 'announced' }) {
  const styles: Record<string, string> = {
    draft:     'bg-zinc-900 border-zinc-700 text-zinc-500',
    pending:   'bg-amber-950/40 border-amber-700 text-amber-400',
    approved:  'bg-emerald-950/40 border-emerald-700 text-emerald-400',
    announced: 'bg-gold/10 border-gold-dim text-gold',
  }
  const labels: Record<string, string> = {
    draft: 'Draft', pending: 'Pending GC', approved: 'GC Approved', announced: 'Announced',
  }
  return (
    <span className={`font-rajdhani text-[9px] font-bold tracking-wider px-1.5 py-0.5 rounded-sm border ${styles[status]}`}>
      {labels[status]}
    </span>
  )
}

// ── Response cell (matrix view) ───────────────────────────────────
function RespCell({ code, isConflict }: { code: string | null; isConflict?: boolean }) {
  if (!code) return (
    <td className="py-0 text-center" style={{ width: 48, minWidth: 48 }}>
      <span className="font-rajdhani text-[11px] text-zinc-800">—</span>
    </td>
  )
  const cfg = RESP[code]
  return (
    <td className="py-0 text-center" style={{ width: 48, minWidth: 48 }}>
      <span
        className="font-rajdhani text-[11px] font-bold w-8 h-6 inline-flex items-center justify-center rounded-sm"
        style={{
          background: cfg.bg,
          color: cfg.text,
          border: `1px solid ${cfg.border}`,
          outline: isConflict ? `1px solid ${cfg.text}40` : undefined,
        }}>
        {code}
      </span>
    </td>
  )
}

// ── SelectablePlayerRow ───────────────────────────────────────────
function SelectablePlayerRow({
  player, response, selected, atCap, status, takenLabel, onToggle,
}: {
  player:     Player
  response:   string
  selected:   Set<string>
  atCap:      boolean
  status:     'draft' | 'pending' | 'approved' | 'announced'
  takenLabel: string | null
  onToggle:   (id: string) => void
}) {
  const isTaken    = !!takenLabel
  const isSel      = selected.has(player.id)
  const isDisabled = isTaken || (atCap && !isSel) || status !== 'draft'
  const hasDues    = player.wallet_balance < 0
  const cfg        = RESP[response]

  return (
    <div
      onClick={() => !isDisabled && onToggle(player.id)}
      className={[
        'flex items-center gap-2 px-3 py-2.5 border-b border-ink-4 last:border-0 transition-colors',
        isTaken     ? 'opacity-40'                         : '',
        isSel       ? 'bg-sky-950/30'                      : '',
        !isDisabled ? 'cursor-pointer hover:bg-ink-4'      : 'cursor-default',
      ].filter(Boolean).join(' ')}>

      {/* Checkbox */}
      <span className={[
        'w-3.5 h-3.5 rounded-sm border flex items-center justify-center flex-shrink-0 transition-all',
        isSel             ? 'bg-sky-500 border-sky-400'   : '',
        isTaken           ? 'bg-zinc-800 border-zinc-700' : '',
        !isSel && !isTaken ? 'border-zinc-600'             : '',
      ].filter(Boolean).join(' ')}>
        {isSel && <span className="text-[8px] text-white font-bold leading-none">✓</span>}
      </span>

      {/* Name */}
      <span className={[
        'font-rajdhani text-sm flex-1 leading-none',
        isTaken ? 'line-through text-zinc-700' : hasDues ? 'text-amber-400' : 'text-parchment',
      ].filter(Boolean).join(' ')}>
        {player.name}
        {player.is_captain && (
          <span className="ml-1.5 font-rajdhani text-[9px] font-bold bg-gold/10 border border-gold-dim text-gold px-1 py-px rounded-sm">
            CAP
          </span>
        )}
      </span>

      {/* Role */}
      <span className="font-rajdhani text-[10px] text-zinc-700 min-w-[24px] text-right flex-shrink-0">
        {player.primary_skill?.slice(0, 3).toUpperCase() ?? ''}
      </span>

      {/* Taken pill OR response pill */}
      {isTaken ? (
        <span className="font-rajdhani text-[9px] px-1.5 py-0.5 rounded-sm bg-zinc-800 border border-zinc-700 text-zinc-500 whitespace-nowrap">
          in {takenLabel}
        </span>
      ) : (
        <span
          className="font-rajdhani text-[10px] font-bold px-1.5 py-0.5 rounded-sm flex-shrink-0"
          style={{ background: cfg.bg, color: cfg.text, border: `1px solid ${cfg.border}` }}>
          {response}
        </span>
      )}
    </div>
  )
}

// ── SlotCard ──────────────────────────────────────────────────────
function SlotCard({
  booking, bookings, players, availMap, squadMap, defaultOpen,
}: {
  booking:     Booking
  bookings:    Booking[]
  players:     Player[]
  availMap:    Record<string, Record<string, string>>
  squadMap:    Record<string, string[]>
  defaultOpen: boolean
}) {
  const [open, setOpen] = useState(defaultOpen)
  const [selected, setSelected] = useState<Set<string>>(() => {
    // Auto-pick priority_pick players who have responded for this slot
    const auto = new Set<string>()
    players.forEach(p => {
      if (p.priority_pick && availMap[booking.id]?.[p.id]) auto.add(p.id)
    })
    return auto
  })
  const [status, setStatus] = useState<'draft' | 'pending' | 'approved' | 'announced'>('draft')
  const { copy, copied } = useCopySquad()

  const counts         = getCounts(booking.id, players, availMap)
  const eligible       = getSlotPlayers(booking.id, bookings, players, availMap)
  const atCap          = selected.size >= MAX_SQUAD
  const priorityPlayers = eligible.filter(e => e.player.priority_pick)
  const normalPlayers   = eligible.filter(e => !e.player.priority_pick)
  const selectedNames   = players.filter(p => selected.has(p.id)).map(p => p.name)
  const slotLabel       = `${SLOT_SHORT[booking.slot_time] ?? booking.slot_time} ${booking.format}`

  // Returns the short slot label if this player is already selected in a different booking
  function takenElsewhere(playerId: string): string | null {
    for (const [bId, ids] of Object.entries(squadMap)) {
      if (bId !== booking.id && ids.includes(playerId)) {
        const b = bookings.find(x => x.id === bId)
        return b ? `${SLOT_SHORT[b.slot_time] ?? b.slot_time} ${b.format}` : 'another slot'
      }
    }
    return null
  }

  function toggle(playerId: string) {
    if (status !== 'draft') return
    setSelected(prev => {
      const next = new Set(prev)
      if (next.has(playerId)) {
        next.delete(playerId)
      } else {
        if (next.size >= MAX_SQUAD) return prev // hard cap — silently no-op
        next.add(playerId)
      }
      return next
    })
  }

  const pct = Math.min((selected.size / MAX_SQUAD) * 100, 100)

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
            <p className="font-rajdhani text-[9px] text-zinc-600 mt-0.5">{booking.format}</p>
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

          {/* Status + count chips */}
          <div className="flex items-center gap-1.5 flex-shrink-0">
            <StatusBadge status={status} />
            {counts.total === 0 ? (
              <span className="font-rajdhani text-[10px] text-zinc-700">No responses</span>
            ) : (
              (['Y', 'O', 'E'] as const).map(code =>
                counts[code] > 0 ? <Chip key={code} code={code} count={counts[code]} /> : null
              )
            )}
            <span className={`text-zinc-600 text-lg transition-transform duration-200 ml-1 ${open ? 'rotate-180' : ''}`}>
              ⌄
            </span>
          </div>
        </div>
      </button>

      {open && (
        <div>
          {/* Available across all slots section */}
          {priorityPlayers.length > 0 && (
            <>
              <div className="flex items-center gap-2 px-3 py-1.5 bg-ink-4 border-y border-ink-5">
                <span className="font-rajdhani text-[10px] font-bold tracking-[2px] uppercase text-zinc-700 flex-1">
                  Available across all slots
                </span>
              </div>
              {priorityPlayers.map(({ player, response }) => (
                <SelectablePlayerRow
                  key={player.id}
                  player={player}
                  response={response}
                  selected={selected}
                  atCap={atCap}
                  status={status}
                  takenLabel={takenElsewhere(player.id)}
                  onToggle={toggle}
                />
              ))}
            </>
          )}

          {/* Available section */}
          <div className="flex items-center gap-2 px-3 py-1.5 bg-ink-4 border-y border-ink-5">
            <span className="font-rajdhani text-[10px] font-bold tracking-[2px] uppercase text-zinc-700 flex-1">
              Available
            </span>
            <span className="font-rajdhani text-[10px] font-bold tracking-[2px] uppercase text-zinc-700">
              {counts.total} responded
            </span>
          </div>

          {eligible.length === 0 ? (
            <p className="px-4 py-5 font-rajdhani text-sm text-zinc-600 text-center">
              No responses yet.
            </p>
          ) : normalPlayers.length === 0 && priorityPlayers.length > 0 ? (
            <p className="px-4 py-3 font-rajdhani text-xs text-zinc-700 text-center">
              All available players are priority picks above.
            </p>
          ) : (
            normalPlayers.map(({ player, response }) => (
              <SelectablePlayerRow
                key={player.id}
                player={player}
                response={response}
                selected={selected}
                atCap={atCap}
                status={status}
                takenLabel={takenElsewhere(player.id)}
                onToggle={toggle}
              />
            ))
          )}

          {/* Footer — progress bar + actions */}
          <div className="px-3 py-2.5 bg-ink-4 border-t border-ink-5 flex items-center gap-3 flex-wrap">
            {/* Progress bar + count */}
            <div className="flex items-center gap-2 flex-1 min-w-0">
              <div className="flex-1 h-1 bg-ink-5 rounded-full overflow-hidden max-w-[80px]">
                <div
                  className={`h-full rounded-full transition-all ${selected.size === MAX_SQUAD ? 'bg-emerald-500' : 'bg-sky-600'}`}
                  style={{ width: `${pct}%` }}
                />
              </div>
              <span className={`font-rajdhani text-[11px] ${selected.size === MAX_SQUAD ? 'text-emerald-400' : 'text-zinc-500'}`}>
                {selected.size}/{MAX_SQUAD}
              </span>
              {atCap && (
                <span className="font-rajdhani text-[9px] px-1.5 py-0.5 rounded-sm bg-emerald-950/40 border border-emerald-800 text-emerald-500 whitespace-nowrap">
                  Cap reached
                </span>
              )}
            </div>

            {/* Action buttons */}
            <div className="flex items-center gap-2 flex-shrink-0">
              <button
                onClick={() => copy(booking.id, slotLabel, selectedNames)}
                className="font-rajdhani text-[10px] font-bold tracking-wide px-2 py-1 rounded-sm border border-ink-5 text-zinc-500 hover:text-zinc-300 transition-colors">
                {copied === booking.id ? 'Copied!' : 'Copy names'}
              </button>

              {status === 'draft' && (
                <button
                  onClick={() => setStatus('pending')}
                  disabled={selected.size === 0}
                  className="font-rajdhani text-[10px] font-bold tracking-wide px-2 py-1 rounded-sm bg-gold/10 border border-gold-dim text-gold hover:bg-gold/20 transition-colors disabled:opacity-30 disabled:cursor-not-allowed">
                  Submit for GC review
                </button>
              )}
              {status === 'approved' && (
                <button
                  onClick={() => setStatus('announced')}
                  className="font-rajdhani text-[10px] font-bold tracking-wide px-2 py-1 rounded-sm bg-emerald-950/40 border border-emerald-700 text-emerald-400 hover:bg-emerald-950/70 transition-colors">
                  Announce squad
                </button>
              )}
              {status === 'announced' && (
                <span className="font-rajdhani text-[10px] text-emerald-500">
                  Squad announced
                </span>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// ── Matrix view ───────────────────────────────────────────────────
function MatrixView({
  bookings, players, availMap,
}: {
  bookings: Booking[]
  players:  Player[]
  availMap: Record<string, Record<string, string>>
}) {
  const activePlayers = players.filter(p =>
    bookings.some(b => {
      const r = availMap[b.id]?.[p.id]
      return r === 'Y' || r === 'O' || r === 'E'
    })
  ).sort((a, b) => a.name.localeCompare(b.name))

  const counts = useMemo(
    () => Object.fromEntries(bookings.map(b => [b.id, getCounts(b.id, players, availMap)])),
    [bookings, players, availMap]
  )

  return (
    <div className="overflow-x-auto">
      <table className="w-full border-collapse" style={{ minWidth: Math.max(240, bookings.length * 48 + 112) }}>
        <thead>
          <tr className="bg-ink-4 border-b border-ink-5">
            <th className="px-2 py-2 text-left font-rajdhani text-[10px] font-bold tracking-[2px] uppercase text-zinc-600 w-28 sm:w-44 sticky left-0 bg-ink-4 z-10 align-bottom">
              Player
            </th>
            {bookings.map(b => (
              <th key={b.id} className="bg-ink-4 z-10 align-bottom text-center" style={{ width: 48, minWidth: 48, padding: 0 }}>
                <div style={{
                  writingMode: 'vertical-rl',
                  transform: 'rotate(180deg)',
                  whiteSpace: 'nowrap',
                  paddingBottom: 8,
                  paddingTop: 8,
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 4,
                  width: '100%',
                  margin: '0 auto',
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

        <tbody>
          {activePlayers.length === 0 ? (
            <tr>
              <td colSpan={bookings.length + 1} className="px-4 py-8 text-center font-rajdhani text-sm text-zinc-600">
                No availability responses yet.
              </td>
            </tr>
          ) : (
            activePlayers.map(p => {
              const hasDues = p.wallet_balance < 0
              return (
                <tr key={p.id} className="border-b border-ink-4 hover:bg-ink-4 transition-colors">
                  <td className="px-2 py-1.5 sticky left-0 bg-ink-3 z-10" style={{ minWidth: 112 }}>
                    <div className="flex items-center gap-1.5">
                      <span className={`font-rajdhani text-xs hidden sm:inline truncate max-w-[140px] ${hasDues ? 'text-amber-400' : 'text-parchment'}`}>
                        {desktopMatrixName(p)}
                      </span>
                      <span className={`font-rajdhani text-xs sm:hidden truncate max-w-[80px] ${hasDues ? 'text-amber-400' : 'text-parchment'}`}>
                        {mobileMatrixName(p)}
                      </span>
                      {p.is_captain && (
                        <span className="font-rajdhani text-[8px] font-bold bg-gold/10 border border-gold-dim text-gold px-0.5 rounded-sm flex-shrink-0">C</span>
                      )}
                      {hasDues && (
                        <span className="font-rajdhani text-[8px] font-bold bg-amber-950 border border-amber-800 text-amber-500 px-0.5 rounded-sm flex-shrink-0">₹</span>
                      )}
                    </div>
                  </td>
                  {bookings.map(b => {
                    const r       = availMap[b.id]?.[p.id]
                    const display = (r === 'Y' || r === 'O' || r === 'E') ? r : null
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
export function CaptainsCornerGrid({ weekLabel, bookings, players, availMap, squadMap = {} }: Props) {
  const [view, setView] = useState<'slot' | 'matrix'>('slot')

  // Matrix shows weekend games only (Sat=6, Sun=0).
  // Per-slot shows all bookings including weekday games.
  const weekendBookings = bookings.filter(b => isWeekendDate(b.game_date))

  return (
    <div>
      {/* Weekend header + view toggle */}
      <div className="flex items-start justify-between gap-3 mb-4 flex-wrap">
        <div>
          <h2 className="font-cinzel text-base font-semibold text-gold">{weekLabel}</h2>
          <p className="font-rajdhani text-xs text-zinc-600 mt-0.5">
            {bookings.length} game{bookings.length !== 1 ? 's' : ''} this week
          </p>
        </div>

        {/* View toggle */}
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

      {/* Legend panel — selection legend + response codes */}
      <div className="mb-4 bg-ink-3 border border-ink-5 rounded px-3 py-2.5">
        {/* Selection legend — only relevant in per-slot view */}
        {view === 'slot' && (
          <div className="flex flex-wrap gap-x-4 gap-y-1.5 mb-2.5 pb-2.5 border-b border-ink-5">
            {[
              { dot: 'bg-emerald-900/60 border-emerald-700',    label: 'Available across all slots' },
              { dot: 'bg-sky-900/40 border-sky-700',            label: 'Selected for this slot' },
              { dot: 'bg-zinc-800 border-zinc-600 opacity-50',  label: 'Taken — in another slot\'s squad' },
              { dot: 'bg-amber-900/40 border-amber-700',        label: 'Has outstanding dues' },
            ].map(({ dot, label }) => (
              <div key={label} className="flex items-center gap-1.5">
                <span className={`w-2.5 h-2.5 rounded-sm border flex-shrink-0 ${dot}`} />
                <span className="font-rajdhani text-[10px] text-zinc-600">{label}</span>
              </div>
            ))}
          </div>
        )}
        <Legend />
        {view === 'matrix' && (
          <p className="font-rajdhani text-[10px] text-zinc-700 mt-2">
            Amber names = players marked O or E (shared across slots). Scroll right if slots overflow.
          </p>
        )}
      </div>

      {/* Per-slot view — all bookings including weekday */}
      {view === 'slot' && (
        <div className="flex flex-col gap-3">
          {bookings.map((b, i) => (
            <SlotCard
              key={b.id}
              booking={b}
              bookings={bookings}
              players={players}
              availMap={availMap}
              squadMap={squadMap}
              defaultOpen={i === 0}
            />
          ))}
        </div>
      )}

      {/* Matrix view — weekend games only */}
      {view === 'matrix' && (
        <div className="bg-ink-3 border border-ink-5 rounded overflow-hidden">
          {weekendBookings.length > 0
            ? <MatrixView bookings={weekendBookings} players={players} availMap={availMap} />
            : <p className="px-4 py-6 font-rajdhani text-sm text-zinc-600 text-center">No weekend games this week.</p>
          }
        </div>
      )}
    </div>
  )
}
