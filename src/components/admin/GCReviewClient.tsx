'use client'
// GCReviewClient.tsx — GC Review v2
// Layout (top to bottom):
//   1. Weekend Summary Bar — slot counts, playing-both list, Y-not-selected alert
//   2. Weekend Player Matrix — all Y/O/E players sorted by games desc
//   3. Per-slot Approval Panels — numbered squad table + role composition footer
// U-4: WhatsApp nudge to captain after approve/return (destination-free — GC picks recipient)

import { useState, useMemo, useCallback } from 'react'

interface Booking {
  id:            string
  game_date:     string
  slot_time:     string
  format:        string
  opponent_name: string | null
  tournament:    { name: string } | null
}

interface AvailRow {
  player_id:  string
  booking_id: string
  response:   'Y' | 'O' | 'E'
  players:    { id: string; name: string; cricheroes_url?: string | null } | null
}

interface SquadRow {
  player_id:  string
  booking_id: string
  status:     string
  is_captain: boolean
  is_vc:      boolean
  is_wk:      boolean
  match_role: 'bat' | 'bowl' | 'bat_ar' | 'bowl_ar' | null
  players:    { id: string; name: string; primary_skill: string | null; is_captain: boolean } | null
}

interface Props {
  weekLabel: string
  bookings:  Booking[]
  avail:     AvailRow[]
  squads:    SquadRow[]
  draftSquadMap: Record<string, string[]>
}

// ── Constants ─────────────────────────────────────────────────────
const SLOT_SHORT: Record<string, string> = {
  '07:30': '7:15', '10:30': '10:15', '12:30': '12:15', '14:30': '2:15',
}

const MATCH_ROLE_LABEL: Record<string, string> = {
  bat: 'BAT', bowl: 'BOWL', bat_ar: 'BAT-AR', bowl_ar: 'BOWL-AR',
}

const RESP_STYLE: Record<string, { bg: string; text: string; border: string }> = {
  Y: { bg: '#14532d', text: '#86efac', border: '#22c55e' },
  O: { bg: '#431407', text: '#fdba74', border: '#f97316' },
  E: { bg: '#1e3a5f', text: '#93c5fd', border: '#3b82f6' },
}

// ── Helpers ───────────────────────────────────────────────────────
function slotLabel(b: Booking) {
  return `${SLOT_SHORT[b.slot_time] ?? b.slot_time} · ${b.format}${b.tournament?.name ? ` · ${b.tournament.name}` : ''}`
}

function formatDate(dateStr: string) {
  return new Date(dateStr + 'T00:00:00').toLocaleDateString('en-IN', {
    weekday: 'short', day: 'numeric', month: 'short',
  })
}

// Pre-filled WA message for GC → captain notification (U-4)
function buildCaptainWaMessage(booking: Booking, decision: 'approved' | 'returned', note: string): string {
  const label = slotLabel(booking)
  const date  = formatDate(booking.game_date)
  if (decision === 'approved') {
    return `✅ *Squad approved* — ${date} · ${label}\n\nYou can now announce the squad on the Hub.\nhttps://hub.spartanscricketclub.in/captains-corner`
  }
  return `↩ *Squad returned for revision* — ${date} · ${label}\n\n${note ? `GC note: _${note}_\n\n` : ''}Please update and resubmit on the Hub.\nhttps://hub.spartanscricketclub.in/captains-corner`
}

function buildWaLink(msg: string) {
  return `https://wa.me/?text=${encodeURIComponent(msg)}`
}

// ── Sub-components ────────────────────────────────────────────────
function StatusPill({ status }: { status: string }) {
  const map: Record<string, string> = {
    draft:            'bg-zinc-900 border-zinc-700 text-zinc-500',
    pending_approval: 'bg-amber-950/40 border-amber-700 text-amber-400',
    approved:         'bg-emerald-950/40 border-emerald-700 text-emerald-400',
    announced:        'bg-gold/10 border-gold-dim text-gold',
    returned:         'bg-crimson/10 border-crimson/40 text-red-400',
  }
  const labels: Record<string, string> = {
    draft:            'Not submitted',
    pending_approval: 'Pending review',
    approved:         'Approved',
    announced:        'Announced',
    returned:         'Returned',
  }
  return (
    <span className={`font-rajdhani text-[9px] font-bold tracking-wider px-2 py-0.5 rounded-sm border ${map[status] ?? map.draft}`}>
      {labels[status] ?? status}
    </span>
  )
}

function WAIcon({ size = 13 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor">
      <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347z"/>
      <path d="M12 0C5.373 0 0 5.373 0 12c0 2.123.554 4.118 1.528 5.855L.057 23.082a.75.75 0 00.921.916l5.232-1.471A11.943 11.943 0 0012 24c6.627 0 12-5.373 12-12S18.627 0 12 0zm0 22c-1.907 0-3.699-.487-5.256-1.342l-.376-.214-3.904 1.097 1.098-3.905-.214-.376A9.96 9.96 0 012 12C2 6.477 6.477 2 12 2s10 4.477 10 10-4.477 10-10 10z"/>
    </svg>
  )
}

// ── Main export ───────────────────────────────────────────────────
export function GCReviewClient({ weekLabel, bookings, avail, squads: initialSquads, draftSquadMap }: Props) {
  const [squads,  setSquads]  = useState(initialSquads)
  const [notes,   setNotes]   = useState<Record<string, string>>({})
  const [saving,  setSaving]  = useState<Record<string, boolean>>({})
  const [done,    setDone]    = useState<Record<string, 'approved' | 'returned'>>({})
  const [expand,  setExpand]  = useState<Record<string, boolean>>({})

  // ── Derived data — order matters: submittedBookingIds must come before matrixRows ──

  const squadMap = useMemo(() => Object.fromEntries(
    bookings.map(b => [b.id, squads.filter(s => s.booking_id === b.id).map(s => s.player_id)])
  ), [bookings, squads])

  // All unique players who responded Y/O/E
  const allAvailPlayers = useMemo(() => {
    const map = new Map<string, {
      name:           string
      cricheroes_url: string | null
      responses:      Record<string, 'Y' | 'O' | 'E'>
    }>()
    for (const a of avail) {
      if (!a.players) continue
      const existing = map.get(a.player_id)
      if (existing) {
        existing.responses[a.booking_id] = a.response
      } else {
        map.set(a.player_id, {
          name:           a.players.name,
          cricheroes_url: a.players.cricheroes_url ?? null,
          responses:      { [a.booking_id]: a.response },
        })
      }
    }
    return map
  }, [avail])

  const gamesCount = useMemo(() => {
    const counts: Record<string, number> = {}
    Array.from(allAvailPlayers.keys()).forEach(pid => {
      counts[pid] = bookings.filter(b => squadMap[b.id]?.includes(pid)).length
    })
    return counts
  }, [allAvailPlayers, bookings, squadMap])

  // Only slots with submitted squads (pending/approved/announced) count toward fairness.
  // Draft slots are invisible to the GC — exclude from Y-coverage check and matrix colouring.
  // MUST be declared before matrixRows useMemo — referenced inside its sort comparator.
  const submittedBookingIds = new Set(
    bookings.filter(b => squads.some(s => s.booking_id === b.id)).map(b => b.id)
  )
  const unsubmittedCount = bookings.length - submittedBookingIds.size

  // Sorted: 2+ games → 1 game → 0 Y-missed (submitted slot) → 0 Y-pending (draft only) → alpha
  const matrixRows = useMemo(() => {
    return Array.from(allAvailPlayers.entries())
      .map(([pid, data]: [string, { name: string; cricheroes_url: string | null; responses: Record<string, 'Y' | 'O' | 'E'> }]) => ({
        pid, ...data, games: gamesCount[pid] ?? 0,
      }))
      .sort((a, b) => {
        const getGroup = (r: { pid: string; responses: Record<string, string> }): number => {
          if (bookings.some(bk => squads.find(s => s.booking_id === bk.id && s.player_id === r.pid)?.status?.match(/^(approved|announced)$/))) return 1
          if (bookings.some(bk => squads.find(s => s.booking_id === bk.id && s.player_id === r.pid)?.status === 'pending_approval')) return 2
          if (bookings.some(bk => draftSquadMap[bk.id]?.includes(r.pid))) return 3
          return 4
        }
        const earliestSlot = (r: { responses: Record<string, string> }): string => {
          const slots = bookings
            .filter(bk => r.responses[bk.id])
            .map(bk => `${bk.game_date}T${bk.slot_time}`)
            .sort()
          return slots[0] ?? '9999'
        }
        const groupDiff = getGroup(a) - getGroup(b)
        if (groupDiff !== 0) return groupDiff
        const slotDiff = earliestSlot(a).localeCompare(earliestSlot(b))
        if (slotDiff !== 0) return slotDiff
        return a.name.localeCompare(b.name)
      })
  // submittedBookingIds is a plain Set computed outside — intentionally omitted from deps
  // to avoid unnecessary re-sorts (it changes only when squads prop changes, covered by gamesCount)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [allAvailPlayers, gamesCount])

  const playingMultiple = matrixRows.filter(r => r.games >= 2)
  const slotCounts      = bookings.map(b => ({ b, count: squadMap[b.id]?.length ?? 0 }))

   // Group 1: Completely unselected — Y for at least one submitted slot, in no squad at all
  const totallyUnselected = matrixRows.filter(r =>
    r.games === 0 &&
    bookings.some(b =>
      submittedBookingIds.has(b.id) &&
      Object.keys(r.responses).length > 0
    )
  )

  // Group 2: Left out of a specific slot — selected in at least one squad,
  // but also Y for another submitted slot where they weren't picked
  const leftOutOfSlot = matrixRows.filter(r =>
    r.games > 0 &&
    bookings.some(b =>
      submittedBookingIds.has(b.id) &&
      r.responses[b.id] === 'Y' &&
      !(squadMap[b.id] ?? []).includes(r.pid)
    )
  )
 
  const allYCovered = totallyUnselected.length === 0


  async function decide(bookingId: string, decision: 'approved' | 'returned') {
    setSaving(p => ({ ...p, [bookingId]: true }))
    try {
      const res = await fetch('/api/gc/weekend-review', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ booking_id: bookingId, decision, note: notes[bookingId] ?? '' }),
      })
      if (res.ok) {
        setDone(p => ({ ...p, [bookingId]: decision }))
        setSquads(prev => prev.map(s =>
          s.booking_id === bookingId
            ? { ...s, status: decision === 'approved' ? 'approved' : 'draft' }
            : s
        ))
        const booking = bookings.find(b => b.id === bookingId)
        if (booking) {
          window.open(buildWaLink(buildCaptainWaMessage(booking, decision, notes[bookingId] ?? '')), '_blank')
        }
      }
    } finally {
      setSaving(p => ({ ...p, [bookingId]: false }))
    }
  }

  const [copied, setCopied] = useState(false)

  const copyUnselected = useCallback(() => {
    const names = totallyUnselected.map(r => r.name).sort().join('\n')
    navigator.clipboard.writeText(names).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    })
  }, [totallyUnselected])

  if (bookings.length === 0) {
    return <p className="font-rajdhani text-zinc-500 text-sm">No confirmed fixtures found for this weekend.</p>
  }

  return (
    <div className="flex flex-col gap-8">

      {/* ── 1. Weekend Summary Bar ───────────────────────────────── */}
      <section className="bg-ink-3 border border-ink-5 rounded overflow-hidden">
        <div className="px-4 py-3 bg-ink-4 border-b border-ink-5">
          <h2 className="font-cinzel text-sm font-semibold text-gold">{weekLabel} · Weekend Summary</h2>
        </div>

        {/* Slot squad counts */}
        <div className="px-4 py-3 flex flex-wrap gap-6 border-b border-ink-5">
          {slotCounts.map(({ b, count }) => (
            <div key={b.id} className="flex items-center gap-2">
              <span className="font-rajdhani text-[10px] text-zinc-500">
                {formatDate(b.game_date)} · {SLOT_SHORT[b.slot_time]} {b.format}
              </span>
              <span className={`font-rajdhani text-xs font-bold tabular-nums px-2 py-0.5 rounded-sm border ${
                count === 12 ? 'bg-emerald-950/40 border-emerald-700 text-emerald-400'
                : count > 0  ? 'bg-sky-950/40 border-sky-700 text-sky-400'
                :              'bg-zinc-900 border-zinc-700 text-zinc-600'
              }`}>
                {count} / 12
              </span>
            </div>
          ))}
        </div>

        {/* Flag rows */}
        <div className="px-4 py-3 flex flex-col gap-3">

          {/* Playing multiple */}
          <div className="flex flex-col gap-1.5">
            <button
              onClick={() => playingMultiple.length > 0 && setExpand(e => ({ ...e, both: !e.both }))}
              className={`flex items-center gap-2 font-rajdhani text-xs font-bold transition-colors ${
                playingMultiple.length > 0 ? 'text-amber-400 hover:text-amber-300' : 'text-zinc-600 cursor-default'
              }`}>
              <span className={`w-2 h-2 rounded-full flex-shrink-0 ${playingMultiple.length > 0 ? 'bg-amber-400' : 'bg-zinc-700'}`} />
              {playingMultiple.length} playing multiple games
              {playingMultiple.length > 0 && <span className="text-[10px] font-normal opacity-60">{expand.both ? '▴' : '▾'}</span>}
            </button>
            {expand.both && playingMultiple.length > 0 && (
              <div className="ml-4 flex flex-col gap-1">
                {playingMultiple.map(r => (
                  <div key={r.pid} className="flex items-center gap-2">
                    {r.cricheroes_url
                      ? <a href={r.cricheroes_url} target="_blank" rel="noopener noreferrer" className="font-rajdhani text-xs text-amber-300 hover:underline underline-offset-2">{r.name}</a>
                      : <span className="font-rajdhani text-xs text-amber-300">{r.name}</span>
                    }
                    <span className="font-rajdhani text-[10px] text-zinc-600">
                      {bookings.filter(b => squadMap[b.id]?.includes(r.pid)).map(b => `${SLOT_SHORT[b.slot_time]} ${b.format}`).join(' + ')}
                    </span>
                    <span className="font-rajdhani text-[9px] font-bold px-1 py-px rounded-sm bg-amber-950/40 border border-amber-700 text-amber-400">{r.games}×</span>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Y not selected */}
            {/* Fairness summary — partial check warning */}
            {unsubmittedCount > 0 && (
              <div className="flex items-center gap-2 font-rajdhani text-xs font-bold text-zinc-500">
                <span className="w-2 h-2 rounded-full bg-zinc-500 flex-shrink-0" />
                {unsubmittedCount} slot{unsubmittedCount > 1 ? 's' : ''} not yet submitted — fairness check partial
              </div>
            )}
           
            {/* Totally unselected — alarming */}
            <div className="flex flex-col gap-1.5">
              <button
                onClick={() => totallyUnselected.length > 0 && setExpand(e => ({ ...e, unselected: !e.unselected }))}
                className={`flex items-center gap-2 font-rajdhani text-xs font-bold transition-colors ${
                  totallyUnselected.length > 0 ? 'text-red-400 hover:text-red-300' : 'text-emerald-400 cursor-default'
                }`}>
                <span className={`w-2 h-2 rounded-full flex-shrink-0 ${totallyUnselected.length > 0 ? 'bg-red-400' : 'bg-emerald-500'}`} />
                {totallyUnselected.length === 0 ? 'All Y-available players selected ✓' : `${totallyUnselected.length} not selected for any game ⚠`}
                {totallyUnselected.length > 0 && <span className="text-[10px] font-normal opacity-60">{expand.unselected ? '▴' : '▾'}</span>}
              </button>
              {expand.unselected && totallyUnselected.length > 0 && (
                <div className="ml-4 flex flex-col gap-1">
                  {totallyUnselected.map(r => (
                    <div key={r.pid} className="flex items-center gap-2">
                      {r.cricheroes_url
                        ? <a href={r.cricheroes_url} target="_blank" rel="noopener noreferrer" className="font-rajdhani text-xs text-red-300 hover:underline underline-offset-2">{r.name}</a>
                        : <span className="font-rajdhani text-xs text-red-300">{r.name}</span>
                      }
                      <span className="font-rajdhani text-[9px] font-bold px-1 py-px rounded-sm"
                        style={{ background: RESP_STYLE.Y.bg, color: RESP_STYLE.Y.text, border: `1px solid ${RESP_STYLE.Y.border}` }}>Y</span>
                      <span className="font-rajdhani text-[10px] text-zinc-600">
                        {bookings
                          .filter(b => r.responses[b.id] === 'Y' && submittedBookingIds.has(b.id))
                          .map(b => `${SLOT_SHORT[b.slot_time]} ${b.format}`)
                          .join(', ')}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
           
            {/* Left out of a specific slot — informational */}
            {leftOutOfSlot.length > 0 && (
              <div className="flex flex-col gap-1.5">
                <button
                  onClick={() => setExpand(e => ({ ...e, leftout: !e.leftout }))}
                  className="flex items-center gap-2 font-rajdhani text-xs font-bold text-amber-500 hover:text-amber-400 transition-colors">
                  <span className="w-2 h-2 rounded-full bg-amber-500 flex-shrink-0" />
                  {leftOutOfSlot.length} selected for one game, left out of another
                  <span className="text-[10px] font-normal opacity-60">{expand.leftout ? '▴' : '▾'}</span>
                </button>
                {expand.leftout && (
                  <div className="ml-4 flex flex-col gap-1">
                    {leftOutOfSlot.map(r => (
                      <div key={r.pid} className="flex items-center gap-2">
                        {r.cricheroes_url
                          ? <a href={r.cricheroes_url} target="_blank" rel="noopener noreferrer" className="font-rajdhani text-xs text-amber-400 hover:underline underline-offset-2">{r.name}</a>
                          : <span className="font-rajdhani text-xs text-amber-400">{r.name}</span>
                        }
                        <span className="font-rajdhani text-[10px] text-zinc-600">
                          {/* Show which slots they're in vs left out of */}
                          {bookings
                            .filter(b => submittedBookingIds.has(b.id) && squadMap[b.id]?.includes(r.pid))
                            .map(b => `✓ ${SLOT_SHORT[b.slot_time]} ${b.format}`)
                            .join(' · ')}
                        </span>
                        <span className="font-rajdhani text-[10px] text-zinc-700">
                          {bookings
                            .filter(b => submittedBookingIds.has(b.id) && r.responses[b.id] === 'Y' && !squadMap[b.id]?.includes(r.pid))
                            .map(b => `— ${SLOT_SHORT[b.slot_time]} ${b.format}`)
                            .join(' · ')}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        </section>

      {/* ── 2. Weekend Player Matrix ─────────────────────────────── */}
      <section className="bg-ink-3 border border-ink-5 rounded overflow-hidden">
        <div className="px-4 py-3 bg-ink-4 border-b border-ink-5">
          <h2 className="font-cinzel text-sm font-semibold text-gold">Player Matrix</h2>
          <p className="font-rajdhani text-[10px] text-zinc-500 mt-0.5">
            All Y / O / E players · sorted by squad status then earliest slot · roles shown are match-assigned only
          </p>
        </div>

        {matrixRows.length === 0 ? (
          <p className="px-4 py-6 font-rajdhani text-sm text-zinc-600">No availability responses this weekend.</p>
        ) : (
          <>
            <div className="overflow-x-auto overflow-y-auto" style={{ maxHeight: '70vh' }}>
              <table className="border-collapse" style={{ minWidth: Math.max(320, bookings.length * 120 + 160) }}>
                <thead className="sticky top-0 z-20">
                  <tr className="border-b border-ink-5 bg-ink-4">
                    {/* Frozen player name header — sticky left AND top */}
                    <th className="px-3 py-2 text-left font-rajdhani text-[10px] font-bold tracking-[2px] uppercase text-zinc-600 sticky left-0 bg-ink-4 z-30 align-bottom" style={{ minWidth: 130 }}>
                      Player
                    </th>
                    {/* Slot columns — vertical headers */}
                    {bookings.map(b => (
                      <th key={b.id} className="bg-ink-4 z-20" style={{ width: 90, minWidth: 90, padding: 0, verticalAlign: 'bottom' }}>
                        <div style={{ writingMode: 'vertical-rl', transform: 'rotate(180deg)', whiteSpace: 'nowrap', paddingBottom: 8, paddingTop: 8, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3, margin: '0 auto' }}>
                          <span className="font-cinzel text-[10px] font-semibold text-gold">
                            {new Date(b.game_date + 'T00:00:00').toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short' })}
                          </span>
                          <span className="font-rajdhani text-[10px] font-bold text-zinc-400">
                            {SLOT_SHORT[b.slot_time]} {b.format}
                          </span>
                          {!submittedBookingIds.has(b.id) && (
                            <span className="font-rajdhani text-[9px] font-bold px-1 py-px rounded-sm bg-zinc-800 border border-zinc-700 text-zinc-500">draft</span>
                          )}
                        </div>
                      </th>
                    ))}

                    {/* Games column — vertical */}
                    <th className="bg-ink-4 z-20" style={{ width: 44, minWidth: 44, padding: 0 }}>
                      <div style={{ writingMode: 'vertical-rl', transform: 'rotate(180deg)', whiteSpace: 'nowrap', paddingBottom: 8, paddingTop: 8, margin: '0 auto' }}>
                        <span className="font-rajdhani text-[10px] font-bold tracking-[2px] uppercase text-zinc-600">Games</span>
                      </div>
                    </th>
                  </tr>
               </thead>
              <tbody>
                {matrixRows.map(row => {
                  const playerGroup = (() => {
                    if (bookings.some(bk => squads.find(s => s.booking_id === bk.id && s.player_id === row.pid)?.status?.match(/^(approved|announced)$/))) return 1
                    if (bookings.some(bk => squads.find(s => s.booking_id === bk.id && s.player_id === row.pid)?.status === 'pending_approval')) return 2
                    if (bookings.some(bk => draftSquadMap[bk.id]?.includes(row.pid))) return 3
                    return 4
                  })()
                  const nameColour =
                    playerGroup === 1 ? 'text-parchment' :
                    playerGroup === 2 ? 'text-parchment' :
                    playerGroup === 3 ? 'text-zinc-400'  :
                    'text-red-400'

                  return (
                    <tr key={row.pid} className="border-b border-ink-4 hover:bg-ink-4 transition-colors">
                      <td className="px-2 py-2 sticky left-0 bg-ink-3 z-10" style={{ minWidth: 130 }}>
                        {row.cricheroes_url
                          ? <a href={row.cricheroes_url} target="_blank" rel="noopener noreferrer" className={`font-rajdhani text-xs hover:underline underline-offset-2 ${nameColour}`}>{row.name}</a>
                          : <span className={`font-rajdhani text-xs ${nameColour}`}>{row.name}</span>
                        }
                      </td>
                      {bookings.map(b => {
                          const resp        = row.responses[b.id]
                          const inSquad     = squadMap[b.id]?.includes(row.pid)
                          const isDraftSlot = !submittedBookingIds.has(b.id)
                          const isConstrained = resp && (resp === 'O' || resp === 'E') &&
                            bookings.some(ob => ob.id !== b.id && squadMap[ob.id]?.includes(row.pid))
 
                          // No response for this slot
                          if (!resp) return (
                            <td key={b.id} className="px-2 py-2 text-center">
                              <span className="font-rajdhani text-[10px] text-zinc-700">—</span>
                            </td>
                          )
 
                          const rs2 = RESP_STYLE[resp]
 
                          // Selected in this slot — show green ✓
                          if (inSquad) return (
                            <td key={b.id} className="px-2 py-2 text-center">
                              <span className="font-rajdhani text-[11px] font-bold text-emerald-400">✓</span>
                            </td>
                          )
 
                           // Not selected — plain text, greyed out always (no box)
                           return (
                              <td key={b.id} className="px-2 py-2 text-center">
                                <span className="font-rajdhani text-[10px] font-bold" style={{ color: '#52525b' }}>
                                  {resp}
                                </span>
                              </td>
                            )
                        })}
                      <td className="px-2 py-2 text-center">
                        <span className={`font-rajdhani text-xs font-bold tabular-nums ${
                          row.games >= 1 ? 'text-emerald-400' : 'text-red-400'
                        }`}>
                          {row.games}
                        </span>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
          
          {/* Copy unselected names button */}
          {totallyUnselected.length > 0 && (
            <div className="px-4 py-2.5 border-t border-ink-5 bg-ink-4 flex items-center justify-between">
              <span className="font-rajdhani text-[10px] text-zinc-500">
                {totallyUnselected.length} player{totallyUnselected.length > 1 ? 's' : ''} not selected for any game this weekend
              </span>
              <button
                onClick={copyUnselected}
                className="flex items-center gap-1.5 font-rajdhani text-[10px] font-bold px-2.5 py-1.5 rounded-sm border border-zinc-700 text-zinc-400 hover:text-zinc-100 hover:border-zinc-500 transition-colors">
                <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1"/>
                </svg>
                {copied ? '✓ Copied' : 'Players not in any squad'}
              </button>
            </div>
          )}
          </>
        )}
      </section>

      {/* ── 3. Per-slot Approval Panels ─────────────────────────── */}
      <section>
        <h2 className="font-cinzel text-sm font-semibold text-gold mb-3">Squad Approvals</h2>
        <div className="flex flex-col gap-4">
          {bookings.map(b => {
            const slotSquads = squads
              .filter(s => s.booking_id === b.id)
              .sort((a, z) => {
                if (a.is_captain !== z.is_captain) return a.is_captain ? -1 : 1
                if (a.is_vc !== z.is_vc)           return a.is_vc ? -1 : 1
                return (a.players?.name ?? '').localeCompare(z.players?.name ?? '')
              })

            const status     = slotSquads[0]?.status ?? 'draft'
            const isPending  = status === 'pending_approval'
            const isApproved = status === 'approved' || done[b.id] === 'approved'
            const isSaving   = saving[b.id]
            const label      = slotLabel(b)

            const roleCounts = slotSquads.reduce((acc, s) => {
              if (s.match_role) acc[s.match_role] = (acc[s.match_role] ?? 0) + 1
              return acc
            }, {} as Record<string, number>)

            const approveMsg = buildCaptainWaMessage(b, 'approved', '')
            const returnMsg  = buildCaptainWaMessage(b, 'returned', notes[b.id] ?? '')

            return (
              <div key={b.id} className="bg-ink-3 border border-ink-5 rounded overflow-hidden">

                {/* Header */}
                <div className="px-4 py-3 bg-ink-4 border-b border-ink-5 flex items-center justify-between gap-4 flex-wrap">
                  <div>
                    <p className="font-cinzel text-sm font-semibold text-parchment">{label}</p>
                    {b.opponent_name && <p className="font-rajdhani text-xs text-zinc-500 mt-0.5">vs {b.opponent_name}</p>}
                  </div>
                  <StatusPill status={isApproved ? 'approved' : done[b.id] === 'returned' ? 'returned' : status} />
                </div>

                {/* Squad numbered table */}
                {slotSquads.length === 0 ? (
                  <p className="px-4 py-4 font-rajdhani text-sm text-zinc-600">No squad submitted yet.</p>
                ) : (
                  <>
                    <table className="w-full border-collapse">
                      <thead>
                        <tr className="border-b border-ink-5">
                          <th className="px-4 py-1.5 text-left font-rajdhani text-[9px] font-bold tracking-[2px] uppercase text-zinc-700 w-8">#</th>
                          <th className="px-2 py-1.5 text-left font-rajdhani text-[9px] font-bold tracking-[2px] uppercase text-zinc-700">Player</th>
                          <th className="px-3 py-1.5 text-right font-rajdhani text-[9px] font-bold tracking-[2px] uppercase text-zinc-700 w-36">Assigned Roles</th>
                        </tr>
                      </thead>
                      <tbody>
                        {slotSquads.map((s, i) => {
                          const roleTags = [
                            s.match_role && MATCH_ROLE_LABEL[s.match_role],
                            s.is_wk      && 'WK',
                            s.is_captain && 'C',
                            s.is_vc      && 'VC',
                          ].filter(Boolean) as string[]

                          const inOtherSlot = bookings.some(ob => ob.id !== b.id && squadMap[ob.id]?.includes(s.player_id))

                          return (
                            <tr key={s.player_id} className={`border-b border-ink-5 last:border-0 ${
                              s.is_captain ? 'bg-gold/5' : inOtherSlot ? 'bg-amber-950/10' : ''
                            }`}>
                              <td className="px-4 py-2 font-rajdhani text-[10px] text-zinc-600 tabular-nums">{i + 1}</td>
                              <td className="px-2 py-2">
                                <div className="flex items-center gap-1.5">
                                  <span className={`font-rajdhani text-sm ${s.is_captain ? 'text-gold font-semibold' : 'text-parchment'}`}>
                                    {s.players?.name ?? '—'}
                                  </span>
                                  {inOtherSlot && (
                                    <span className="font-rajdhani text-[8px] font-bold px-1 py-px rounded-sm bg-amber-950/60 border border-amber-800 text-amber-500">both</span>
                                  )}
                                </div>
                              </td>
                              <td className="px-3 py-2">
                                <div className="flex items-center justify-end gap-1 flex-wrap">
                                  {roleTags.length === 0
                                    ? <span className="font-rajdhani text-[9px] text-zinc-700">—</span>
                                    : roleTags.map(tag => (
                                        <span key={tag} className={`font-rajdhani text-[9px] font-bold px-1.5 py-px rounded-sm border ${
                                          tag === 'C'  ? 'bg-gold/20 border-gold-dim text-gold' :
                                          tag === 'VC' ? 'bg-gold/10 border-gold-dim text-gold' :
                                          tag === 'WK' ? 'bg-sky-950/40 border-sky-700 text-sky-400' :
                                                         'bg-emerald-950/40 border-emerald-700 text-emerald-400'
                                        }`}>{tag}</span>
                                      ))
                                  }
                                </div>
                              </td>
                            </tr>
                          )
                        })}
                      </tbody>
                    </table>

                    {/* Role composition footer */}
                    <div className="px-4 py-2 border-t border-ink-5 bg-ink-4 flex items-center gap-3 flex-wrap">
                      <span className="font-rajdhani text-[9px] text-zinc-600 font-bold tracking-[2px] uppercase">Composition</span>
                      {Object.entries(MATCH_ROLE_LABEL).map(([key, lbl]) => {
                        const count = roleCounts[key] ?? 0
                        return (
                          <span key={key} className={`font-rajdhani text-[10px] ${count > 0 ? 'text-zinc-300' : 'text-zinc-700'}`}>
                            {lbl}: <span className="font-bold tabular-nums">{count}</span>
                          </span>
                        )
                      })}
                      <span className="font-rajdhani text-[10px] text-zinc-600">
                        WK: <span className="font-bold">{slotSquads.filter(s => s.is_wk).length}</span>
                      </span>
                      <span className="font-rajdhani text-[10px] text-zinc-600 ml-auto">{slotSquads.length} selected</span>
                    </div>
                  </>
                )}

                {/* GC actions — pending only */}
                {isPending && !done[b.id] && (
                  <div className="px-4 py-3 border-t border-ink-5">
                    <textarea
                      value={notes[b.id] ?? ''}
                      onChange={e => setNotes(p => ({ ...p, [b.id]: e.target.value }))}
                      placeholder="Return note for captain (optional — only needed if returning)..."
                      rows={2}
                      className="w-full mb-3 px-3 py-2 text-xs font-rajdhani bg-ink-4 border border-ink-5 rounded text-zinc-300 placeholder-zinc-700 resize-none focus:outline-none focus:border-zinc-600"
                    />
                    <div className="flex gap-3 flex-wrap">
                      <button onClick={() => decide(b.id, 'approved')} disabled={isSaving}
                        className="font-rajdhani text-xs font-bold tracking-wide px-4 py-2 rounded-sm bg-emerald-950/40 border border-emerald-700 text-emerald-400 hover:bg-emerald-950/70 transition-colors disabled:opacity-40 disabled:cursor-not-allowed">
                        {isSaving ? 'Saving…' : '✓ Approve squad'}
                      </button>
                      <button onClick={() => decide(b.id, 'returned')} disabled={isSaving}
                        className="font-rajdhani text-xs font-bold tracking-wide px-4 py-2 rounded-sm bg-crimson/10 border border-crimson/40 text-red-400 hover:bg-crimson/20 transition-colors disabled:opacity-40 disabled:cursor-not-allowed">
                        {isSaving ? 'Saving…' : '↩ Return with note'}
                      </button>
                    </div>
                  </div>
                )}

                {/* Post-decision: approved this session */}
                {done[b.id] === 'approved' && (
                  <div className="px-4 py-3 border-t border-ink-5 flex items-center gap-3 flex-wrap">
                    <span className="font-rajdhani text-xs text-emerald-400">✓ Approved — captain can now announce</span>
                    <a href={buildWaLink(approveMsg)} target="_blank" rel="noopener noreferrer"
                      className="flex items-center gap-1.5 font-rajdhani text-[10px] font-bold px-3 py-1.5 rounded-sm bg-emerald-950/40 border border-emerald-700 text-emerald-400 hover:bg-emerald-950/70 transition-colors">
                      <WAIcon size={11} /> Notify captain
                    </a>
                  </div>
                )}

                {/* Post-decision: returned this session */}
                {done[b.id] === 'returned' && (
                  <div className="px-4 py-3 border-t border-ink-5 flex items-center gap-3 flex-wrap">
                    <span className="font-rajdhani text-xs text-amber-400">↩ Returned to captain for revision</span>
                    <a href={buildWaLink(returnMsg)} target="_blank" rel="noopener noreferrer"
                      className="flex items-center gap-1.5 font-rajdhani text-[10px] font-bold px-3 py-1.5 rounded-sm bg-amber-950/40 border border-amber-700 text-amber-400 hover:bg-amber-950/70 transition-colors">
                      <WAIcon size={11} /> Notify captain
                    </a>
                  </div>
                )}

                {/* Already approved from previous session — re-notify option */}
                {isApproved && !done[b.id] && slotSquads.length > 0 && (
                  <div className="px-4 py-2.5 border-t border-ink-5 flex items-center gap-3 flex-wrap">
                    <span className="font-rajdhani text-[10px] text-emerald-400">GC approved — captain can announce</span>
                    <a href={buildWaLink(approveMsg)} target="_blank" rel="noopener noreferrer"
                      className="flex items-center gap-1.5 font-rajdhani text-[9px] font-bold px-2 py-1 rounded-sm border border-emerald-800 text-emerald-500 hover:text-emerald-400 transition-colors">
                      <WAIcon size={10} /> Re-notify captain
                    </a>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      </section>
    </div>
  )
}
