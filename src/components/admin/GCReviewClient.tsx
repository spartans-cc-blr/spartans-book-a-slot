'use client'

import { useState, useCallback } from 'react'

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
  player_id:  string
  booking_id: string
  status:     string
  is_captain: boolean
  is_vc:      boolean
  is_wk:      boolean
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

function buildAnnouncementText(booking: Booking, squadRows: SquadRow[]): string {
  const d      = new Date(booking.game_date + 'T00:00:00')
  const day    = d.getDate()
  const suffix = [,'st','nd','rd'][((day % 100 - 20) % 10) || day % 100 > 10 ? 0 : day % 10] ?? 'th'
  const dateStr = `${day}${suffix} ${d.toLocaleDateString('en-IN', { month: 'long' })} (${d.toLocaleDateString('en-IN', { weekday: 'long' })})`

  const playerLines = squadRows.map((s, i) => {
    const tags: string[] = []
    if (s.is_wk)      tags.push('WK')
    if (s.is_captain) tags.push('C')
    if (s.is_vc)      tags.push('VC')
    const name = s.players?.name ?? '—'
    return `${i + 1}. ${name}${tags.length ? ` (${tags.join(', ')})` : ''}`
  }).join('\n')

  return [
    `📅 *${dateStr}*`,
    ``,
    `Format: ${booking.format}`,
    ``,
    `*Team*`,
    playerLines,
    ``,
    booking.opponent_name ? `*Opponents:* ${booking.opponent_name}` : null,
    ``,
    `*Follow Reporting Time strictly* 🏏`,
  ].filter((l): l is string => l !== null).join('\n')
}

export function GCReviewClient({ weekLabel, bookings, avail, squads: initialSquads }: Props) {
  const [squads,  setSquads]  = useState(initialSquads)
  const [notes,   setNotes]   = useState<Record<string, string>>({})
  const [saving,  setSaving]  = useState<Record<string, boolean>>({})
  const [done,    setDone]    = useState<Record<string, 'approved' | 'returned'>>({})
  const [copied,  setCopied]  = useState<string | null>(null)

  const copyText = useCallback((bookingId: string, text: string) => {
    navigator.clipboard.writeText(text).then(() => {
      setCopied(bookingId)
      setTimeout(() => setCopied(null), 2000)
    })
  }, [])

  const squadMap = Object.fromEntries(
    bookings.map(b => [
      b.id,
      squads.filter(s => s.booking_id === b.id).map(s => s.player_id),
    ])
  )

  const sharedPlayers = (() => {
    const seen = new Map<string, { name: string; rows: AvailRow[] }>()
    for (const a of avail) {
      if (!a.players) continue
      const existing = seen.get(a.player_id)
      if (existing) { existing.rows.push(a) }
      else { seen.set(a.player_id, { name: a.players.name, rows: [a] }) }
    }
    return Array.from(seen.values())
  })()

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
      }
    } finally {
      setSaving(p => ({ ...p, [bookingId]: false }))
    }
  }

  if (bookings.length === 0) {
    return <p className="font-rajdhani text-zinc-500 text-sm">No confirmed fixtures found for this weekend.</p>
  }

  return (
    <div className="flex flex-col gap-8">

      {/* Fairness check */}
      <section>
        <h2 className="font-cinzel text-sm font-semibold text-gold mb-3">
          Fairness check — O / E players this weekend
        </h2>
        {sharedPlayers.length === 0 ? (
          <p className="font-rajdhani text-zinc-600 text-sm">No O or E responses this weekend.</p>
        ) : (
          <div className="bg-ink-3 border border-ink-5 rounded overflow-hidden">
            <table className="w-full text-sm border-collapse">
              <thead>
                <tr className="bg-ink-4 border-b border-ink-5">
                  <th className="px-3 py-2 text-left font-rajdhani text-[10px] font-bold tracking-[2px] uppercase text-zinc-600">Player</th>
                  <th className="px-3 py-2 text-left font-rajdhani text-[10px] font-bold tracking-[2px] uppercase text-zinc-600">Resp</th>
                  {bookings.map(b => (
                    <th key={b.id} className="px-3 py-2 text-left font-rajdhani text-[10px] font-bold tracking-[2px] uppercase text-zinc-600">
                      {SLOT_SHORT[b.slot_time] ?? b.slot_time} {b.format}
                    </th>
                  ))}
                  <th className="px-3 py-2 text-left font-rajdhani text-[10px] font-bold tracking-[2px] uppercase text-zinc-600">Status</th>
                </tr>
              </thead>
              <tbody>
                {sharedPlayers.map(({ name, rows }) => {
                  const pid        = rows[0].player_id
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
                        if (!availRow) return <td key={b.id} className="px-3 py-2 font-rajdhani text-[11px] text-zinc-700">—</td>
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

      {/* Squad approvals */}
      <section>
        <h2 className="font-cinzel text-sm font-semibold text-gold mb-3">Squad approvals</h2>
        <div className="flex flex-col gap-4">
          {bookings.map(b => {
            const slotSquads  = squads.filter(s => s.booking_id === b.id)
            const status      = slotSquads[0]?.status ?? 'draft'
            const isPending   = status === 'pending_approval'
            const isApproved  = status === 'approved' || done[b.id] === 'approved'
            const isReturned  = done[b.id] === 'returned'
            const isSaving    = saving[b.id]
            const slotLabel   = `${SLOT_SHORT[b.slot_time] ?? b.slot_time} · ${b.format}${b.tournament?.name ? ` · ${b.tournament.name}` : ''}`
            const announcement = buildAnnouncementText(b, slotSquads)
            const waLink       = `https://wa.me/?text=${encodeURIComponent(announcement)}`

            const ShareButtons = () => (
              <div className="px-4 pb-4 pt-2 flex gap-3 flex-wrap items-center border-t border-ink-5">
                <button
                  onClick={() => copyText(b.id, announcement)}
                  className="font-rajdhani text-xs font-bold px-3 py-1.5 rounded-sm border border-ink-5 text-zinc-400 hover:text-zinc-200 transition-colors">
                  {copied === b.id ? 'Copied!' : 'Copy announcement'}
                </button>
                <a
                  href={waLink}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="font-rajdhani text-xs font-bold px-3 py-1.5 rounded-sm bg-emerald-950/40 border border-emerald-700 text-emerald-400 hover:bg-emerald-950/70 transition-colors">
                  Send via WhatsApp
                </a>
              </div>
            )

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

                {/* Squad chips */}
                {slotSquads.length === 0 ? (
                  <p className="px-4 py-4 font-rajdhani text-sm text-zinc-600">No squad submitted yet.</p>
                ) : (
                  <div className="px-4 py-3 flex flex-wrap gap-2">
                    {slotSquads.map(s => {
                      const MATCH_ROLE_LABEL: Record<string, string> = {
                        bat: 'BAT', bowl: 'BOWL', bat_ar: 'BAT-AR', bowl_ar: 'BOWL-AR',
                      }
                      const matchRoles = [
                        s.match_role && MATCH_ROLE_LABEL[s.match_role],
                        s.is_wk      && 'WK',
                        s.is_captain && 'C',
                        s.is_vc      && 'VC',
                      ].filter(Boolean).join('/')
                      return (
                        <span key={s.player_id}
                          className={`font-rajdhani text-xs px-2 py-1 rounded-sm border ${
                            s.is_captain ? 'bg-gold/10 border-gold-dim text-gold' : 'bg-ink-4 border-ink-5 text-zinc-300'
                          }`}>
                          {s.players?.name ?? '—'}
                          {matchRoles
                            ? <span className="ml-1 text-[9px] opacity-70">{matchRoles}</span>
                            : s.players?.primary_skill
                              ? <span className="ml-1 text-zinc-600 text-[9px]">{s.players.primary_skill.slice(0, 3).toUpperCase()}</span>
                              : null
                          }
                        </span>
                      )
                    })}
                    <span className="font-rajdhani text-[10px] text-zinc-600 self-center ml-1">
                      {slotSquads.length} selected
                    </span>
                  </div>
                )}

                {/* GC actions */}
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

                {/* Approved this session — show share buttons */}
                {done[b.id] === 'approved' && slotSquads.length > 0 && (
                  <>
                    <div className="px-4 pt-2 pb-1 font-rajdhani text-xs text-emerald-400 border-t border-ink-5">
                      ✓ Approved — captain can now announce
                    </div>
                    <ShareButtons />
                  </>
                )}

                {/* Already approved from DB (previous session) */}
                {isApproved && !done[b.id] && slotSquads.length > 0 && (
                  <>
                    <div className="px-4 pt-2 pb-1 font-rajdhani text-xs text-emerald-400 border-t border-ink-5">
                      GC approved — captain can announce
                    </div>
                    <ShareButtons />
                  </>
                )}

                {/* Returned */}
                {done[b.id] === 'returned' && (
                  <div className="px-4 pb-3 pt-2 border-t border-ink-5 font-rajdhani text-xs text-amber-400">
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
