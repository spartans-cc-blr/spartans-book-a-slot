'use client'

import { useState } from 'react'

interface Booking {
  id: string
  game_date: string
  slot_time: string
  format: string
  opponent_name: string | null
  tournament: { name: string } | null
}

interface AvailRow {
  player_id: string
  booking_id: string
  response: 'O' | 'E'
  players: { id: string; name: string } | null
}

interface SquadRow {
  player_id: string
  booking_id: string
  status: string
  players: { id: string; name: string; primary_skill: string | null; is_captain: boolean } | null
}

interface Props {
  weekLabel: string
  bookings:  Booking[]
  avail:     AvailRow[]
  squads:    SquadRow[]
}

const SLOT_SHORT: Record<string, string> = {
  '07:30': '7:15', '10:30': '10:15', '12:30': '12:15', '14:30': '2:15',
}

export function GCReviewClient({ weekLabel, bookings, avail, squads: initialSquads }: Props) {
  const [squads, setSquads]   = useState(initialSquads)
  const [notes, setNotes]     = useState<Record<string, string>>({})
  const [saving, setSaving]   = useState<Record<string, boolean>>({})
  const [done, setDone]       = useState<Record<string, 'approved' | 'returned'>>({})

  // Build a lookup: bookingId → playerIds in squad
  const squadMap = Object.fromEntries(
    bookings.map(b => [
      b.id,
      squads.filter(s => s.booking_id === b.id).map(s => s.player_id),
    ])
  )

  // Find unique O/E players across the weekend
  const sharedPlayers = (() => {
    const seen = new Map<string, { name: string; rows: AvailRow[] }>()
    for (const a of avail) {
      if (!a.players) continue
      const existing = seen.get(a.player_id)
      if (existing) {
        existing.rows.push(a)
      } else {
        seen.set(a.player_id, { name: a.players.name, rows: [a] })
      }
    }
    return Array.from(seen.values())
  })()

  async function decide(bookingId: string, decision: 'approved' | 'returned') {
    setSaving(p => ({ ...p, [bookingId]: true }))
    try {
      const res = await fetch('/api/gc/weekend-review', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          booking_id: bookingId,
          decision,
          note: notes[bookingId] ?? '',
        }),
      })
      if (res.ok) {
        setDone(p => ({ ...p, [bookingId]: decision }))
        // Update local squad status
        setSquads(prev => prev.map(s =>
          s.booking_id === bookingId
            ? { ...s, status: decision === 'approved' ? 'approved' : 'draft' }
            : s
        ))
      }
    } finally {
      setSaving(p => ({ ...p, [bookingId]: false }))
    }
  }

  if (bookings.length === 0) {
    return (
      <p className="font-rajdhani text-zinc-500 text-sm">
        No confirmed fixtures found for this weekend.
      </p>
    )
  }

  return (
    <div className="flex flex-col gap-8">

      {/* ── Fairness check ── */}
      <section>
        <h2 className="font-cinzel text-sm font-semibold text-gold mb-3">
          Fairness check — O / E players this weekend
        </h2>

        {sharedPlayers.length === 0 ? (
          <p className="font-rajdhani text-zinc-600 text-sm">
            No O or E responses this weekend.
          </p>
        ) : (
          <div className="bg-ink-3 border border-ink-5 rounded overflow-hidden">
            <table className="w-full text-sm border-collapse">
              <thead>
                <tr className="bg-ink-4 border-b border-ink-5">
                  <th className="px-3 py-2 text-left font-rajdhani text-[10px] font-bold tracking-[2px] uppercase text-zinc-600">
                    Player
                  </th>
                  <th className="px-3 py-2 text-left font-rajdhani text-[10px] font-bold tracking-[2px] uppercase text-zinc-600">
                    Resp
                  </th>
                  {bookings.map(b => (
                    <th key={b.id} className="px-3 py-2 text-left font-rajdhani text-[10px] font-bold tracking-[2px] uppercase text-zinc-600">
                      {SLOT_SHORT[b.slot_time] ?? b.slot_time} {b.format}
                    </th>
                  ))}
                  <th className="px-3 py-2 text-left font-rajdhani text-[10px] font-bold tracking-[2px] uppercase text-zinc-600">
                    Status
                  </th>
                </tr>
              </thead>
              <tbody>
                {sharedPlayers.map(({ name, rows }) => {
                  const pid      = rows[0].player_id
                  const inAnySquad = bookings.some(b => squadMap[b.id]?.includes(pid))
                  const respLabel  = rows.map(r => r.response).join('/')
                  return (
                    <tr key={pid} className="border-b border-ink-4 last:border-0">
                      <td className="px-3 py-2 font-rajdhani text-sm text-parchment">{name}</td>
                      <td className="px-3 py-2">
                        <span className="font-rajdhani text-[10px] font-bold px-1.5 py-0.5 rounded-sm bg-amber-950/40 border border-amber-700 text-amber-400">
                          {respLabel}
                        </span>
                      </td>
                      {bookings.map(b => {
                        const availRow = rows.find(r => r.booking_id === b.id)
                        const inSquad  = squadMap[b.id]?.includes(pid)
                        if (!availRow) return (
                          <td key={b.id} className="px-3 py-2 font-rajdhani text-[11px] text-zinc-700">—</td>
                        )
                        return (
                          <td key={b.id} className="px-3 py-2 font-rajdhani text-[11px]">
                            {inSquad
                              ? <span className="text-emerald-400">✓ In squad</span>
                              : <span className="text-amber-500">Available</span>
                            }
                          </td>
                        )
                      })}
                      <td className="px-3 py-2 font-rajdhani text-[11px] font-bold">
                        {inAnySquad
                          ? <span className="text-emerald-400">Covered</span>
                          : <span className="text-red-400">Not selected ⚠</span>
                        }
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* ── Per-slot squad review ── */}
      <section>
        <h2 className="font-cinzel text-sm font-semibold text-gold mb-3">
          Squad approvals
        </h2>
        <div className="flex flex-col gap-4">
          {bookings.map(b => {
            const slotSquads = squads.filter(s => s.booking_id === b.id)
            const status     = slotSquads[0]?.status ?? 'draft'
            const isPending  = status === 'pending_approval'
            const isApproved = status === 'approved' || done[b.id] === 'approved'
            const isReturned = done[b.id] === 'returned'
            const isSaving   = saving[b.id]
            const slotLabel  = `${SLOT_SHORT[b.slot_time] ?? b.slot_time} · ${b.format}${b.tournament?.name ? ` · ${b.tournament.name}` : ''}`

            return (
              <div key={b.id} className="bg-ink-3 border border-ink-5 rounded overflow-hidden">
                {/* Header */}
                <div className="px-4 py-3 bg-ink-4 border-b border-ink-5 flex items-center justify-between gap-4 flex-wrap">
                  <div>
                    <p className="font-cinzel text-sm font-semibold text-parchment">{slotLabel}</p>
                    {b.opponent_name && (
                      <p className="font-rajdhani text-xs text-zinc-500 mt-0.5">vs {b.opponent_name}</p>
                    )}
                  </div>
                  <StatusPill status={isApproved ? 'approved' : isReturned ? 'returned' : status} />
                </div>

                {/* Squad list */}
                {slotSquads.length === 0 ? (
                  <p className="px-4 py-4 font-rajdhani text-sm text-zinc-600">
                    No squad submitted yet.
                  </p>
                ) : (
                  <div className="px-4 py-3 flex flex-wrap gap-2">
                    {slotSquads.map(s => (
                      <span key={s.player_id}
                        className={`font-rajdhani text-xs px-2 py-1 rounded-sm border ${
                          s.players?.is_captain
                            ? 'bg-gold/10 border-gold-dim text-gold'
                            : 'bg-ink-4 border-ink-5 text-zinc-300'
                        }`}>
                        {s.players?.name ?? '—'}
                        {s.players?.primary_skill && (
                          <span className="ml-1 text-zinc-600 text-[9px]">
                            {s.players.primary_skill.slice(0, 3).toUpperCase()}
                          </span>
                        )}
                      </span>
                    ))}
                    <span className="font-rajdhani text-[10px] text-zinc-600 self-center ml-1">
                      {slotSquads.length} selected
                    </span>
                  </div>
                )}

                {/* GC actions — only for pending squads */}
                {isPending && !done[b.id] && (
                  <div className="px-4 pb-4">
                    <textarea
                      value={notes[b.id] ?? ''}
                      onChange={e => setNotes(p => ({ ...p, [b.id]: e.target.value }))}
                      placeholder="Return note for captain (optional — only needed if returning)..."
                      rows={2}
                      className="w-full mb-3 px-3 py-2 text-xs font-rajdhani bg-ink-4 border border-ink-5 rounded text-zinc-300 placeholder-zinc-700 resize-none focus:outline-none focus:border-zinc-600"
                    />
                    <div className="flex gap-3">
                      <button
                        onClick={() => decide(b.id, 'approved')}
                        disabled={isSaving}
                        className="font-rajdhani text-xs font-bold tracking-wide px-4 py-2 rounded-sm bg-emerald-950/40 border border-emerald-700 text-emerald-400 hover:bg-emerald-950/70 transition-colors disabled:opacity-40 disabled:cursor-not-allowed">
                        {isSaving ? 'Saving…' : 'Approve squad'}
                      </button>
                      <button
                        onClick={() => decide(b.id, 'returned')}
                        disabled={isSaving}
                        className="font-rajdhani text-xs font-bold tracking-wide px-4 py-2 rounded-sm bg-crimson/10 border border-crimson/40 text-red-400 hover:bg-crimson/20 transition-colors disabled:opacity-40 disabled:cursor-not-allowed">
                        {isSaving ? 'Saving…' : 'Return with note'}
                      </button>
                    </div>
                  </div>
                )}

                {/* Confirmation messages */}
                {done[b.id] === 'approved' && announcementText[b.id] && (
                  <div className="px-4 pb-4 flex gap-3 flex-wrap">
                    <button
                      onClick={() => navigator.clipboard.writeText(announcementText[b.id])}
                      className="font-rajdhani text-xs font-bold px-3 py-1.5 rounded-sm border border-ink-5 text-zinc-400 hover:text-zinc-200 transition-colors">
                      📋 Copy announcement
                    </button>
                    
                      href={buildAnnouncementWhatsAppLink(announcementText[b.id])}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="font-rajdhani text-xs font-bold px-3 py-1.5 rounded-sm bg-emerald-950/40 border border-emerald-700 text-emerald-400 hover:bg-emerald-950/70 transition-colors">
                      📱 Send via WhatsApp
                    </a>
                  </div>
                )}
                {done[b.id] === 'returned' && (
                  <div className="px-4 pb-3 font-rajdhani text-xs text-amber-400">
                    ↩ Returned to captain for revision.
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
    returned:         'Returned to captain',
  }
  return (
    <span className={`font-rajdhani text-[9px] font-bold tracking-wider px-2 py-0.5 rounded-sm border ${map[status] ?? map.draft}`}>
      {labels[status] ?? status}
    </span>
  )
}
