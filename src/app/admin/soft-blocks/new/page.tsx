'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { SLOT_TIMES, SLOT_FORMATS, BLOCK_REASONS, KNOCKOUT_HOLD_REASON } from '@/types'
import type { GameFormat } from '@/types'
import type { KnockoutConflict } from '@/app/api/soft-blocks/route'

type TournamentOption = { id: string; name: string }

function buildWaLink(conflict: KnockoutConflict, gameDate: string): string {
  const name = conflict.organiser_name ?? 'there'
  const opponentLine = conflict.opponent_name ? ` vs ${conflict.opponent_name}` : ''
  const message =
    `Hi ${name} — our ${gameDate} knockout fixture needs the ${conflict.slot_time} slot that day. ` +
    `Would you be able to move your ${conflict.tournament_name ?? 'game'}${opponentLine} to a later time or a different date?`
  const phone = (conflict.organiser_phone ?? '').replace(/\D/g, '')
  return phone
    ? `https://wa.me/${phone}?text=${encodeURIComponent(message)}`
    : `https://wa.me/?text=${encodeURIComponent(message)}`
}

export default function NewSoftBlockPage() {
  const router = useRouter()
  const [gameDate,    setGameDate]    = useState('')
  const [slotTimes,   setSlotTimes]   = useState<string[]>([])
  const [blockReason, setBlockReason] = useState<string>(BLOCK_REASONS[0])
  const [notes,       setNotes]       = useState('')
  const [submitting,  setSubmitting]  = useState(false)
  const [error,       setError]       = useState('')

  // Knockout-only fields
  const [tournaments,   setTournaments]   = useState<TournamentOption[]>([])
  const [tournamentId,  setTournamentId]  = useState('')
  const [format,        setFormat]        = useState<GameFormat | ''>('')
  const [conflict,      setConflict]      = useState<KnockoutConflict | null>(null)
  const [created,       setCreated]       = useState(false)
  const [createdDate,   setCreatedDate]   = useState('')

  const isKnockout = blockReason === KNOCKOUT_HOLD_REASON
  const allSelected = slotTimes.length === SLOT_TIMES.length

  useEffect(() => {
    fetch('/api/tournaments').then(r => r.json()).then(d => setTournaments(d.tournaments ?? []))
  }, [])

  function toggleSlot(t: string) {
    if (isKnockout) {
      // A knockout hold is one specific game, not a multi-slot block.
      setSlotTimes(prev => (prev[0] === t ? [] : [t]))
      if (format && !SLOT_FORMATS[t as keyof typeof SLOT_FORMATS].includes(format)) setFormat('')
      return
    }
    setSlotTimes(prev =>
      prev.includes(t) ? prev.filter(s => s !== t) : [...prev, t]
    )
  }

  function toggleAll() {
    if (isKnockout) return
    setSlotTimes(allSelected ? [] : [...SLOT_TIMES])
  }

  function handleReasonChange(reason: string) {
    setBlockReason(reason)
    setConflict(null)
    setCreated(false)
    if (reason === KNOCKOUT_HOLD_REASON) {
      // Switching into single-slot mode — trim any multi-selection down.
      setSlotTimes(prev => prev.slice(0, 1))
    } else {
      setTournamentId('')
      setFormat('')
    }
  }

  async function handleSubmit() {
    if (!gameDate || slotTimes.length === 0 || !blockReason) return
    if (isKnockout && (!tournamentId || !format)) return
    setSubmitting(true)
    setError('')
    setConflict(null)

    const results = await Promise.all(
      slotTimes.map(slot =>
        fetch('/api/soft-blocks', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            game_date: gameDate,
            slot_time: slot,
            block_reason: blockReason,
            notes,
            ...(isKnockout ? { tournament_id: tournamentId, format } : {}),
          }),
        })
      )
    )

    const failed = results.filter(r => !r.ok)
    if (failed.length > 0) {
      const d = await failed[0].json()
      setError(d.error ?? (d.errors?.[0]?.message) ?? 'One or more slots failed to block.')
      setSubmitting(false)
      return
    }

    if (isKnockout) {
      const d = await results[0].json()
      setSubmitting(false)
      setCreated(true)
      setCreatedDate(gameDate)
      setConflict(d.conflict ?? null)
      return
    }

    router.push('/admin?blocked=1')
  }

  const tournamentName = tournaments.find(t => t.id === tournamentId)?.name ?? null

  return (
    <div className="max-w-lg">
      <div className="mb-6">
        <h1 className="font-cinzel text-xl font-bold text-gold">Soft Block Slots</h1>
        <p className="font-rajdhani text-zinc-500 text-sm mt-1">
          Reserve one or more slots for internal use. Organisers will see them as unavailable.
        </p>
      </div>

      {created ? (
        <div className="bg-ink-3 border border-ink-5 rounded p-5 space-y-4">
          {conflict ? (
            <div className="bg-gold/5 border border-gold-dim rounded px-4 py-4 space-y-3">
              <p className="font-rajdhani text-sm font-bold text-gold">
                ⚠️ Earlier slot already taken that day
              </p>
              <div className="bg-ink-4 border border-ink-5 rounded px-3 py-2 font-rajdhani text-sm text-zinc-300">
                {conflict.slot_time} · {conflict.tournament_name ?? 'Another booking'}
                {conflict.opponent_name ? ` vs ${conflict.opponent_name}` : ''}
              </div>
              <p className="font-rajdhani text-xs text-zinc-500">
                The knockout hold was still created — but knockouts take precedence, so it's worth asking
                this match's organiser to move it later the same day rather than leaving both in place.
              </p>
              <a href={buildWaLink(conflict, createdDate)} target="_blank" rel="noopener noreferrer">
                <button className="font-rajdhani text-sm font-bold tracking-wide bg-[#25D366] hover:bg-[#1FBE59] text-white px-4 py-2 rounded transition-colors">
                  📲 Ask {conflict.organiser_name ?? 'organiser'} to reschedule
                </button>
              </a>
            </div>
          ) : (
            <div className="bg-emerald-950/40 border border-emerald-800 rounded px-4 py-4">
              <p className="font-rajdhani text-sm font-bold text-emerald-400">
                ✅ Knockout hold reserved — day protected from this slot onward.
              </p>
            </div>
          )}
          <div className="flex justify-end pt-1">
            <button onClick={() => router.push('/admin?blocked=1')}
              className="font-rajdhani text-sm font-bold tracking-widest uppercase bg-crimson hover:bg-crimson-dark text-white px-5 py-2.5 rounded transition-colors">
              Continue to Matches
            </button>
          </div>
        </div>
      ) : (
        <div className="bg-ink-3 border border-ink-5 rounded p-5 space-y-4">

          {/* Date */}
          <div>
            <label className="form-label">Date</label>
            <input type="date" value={gameDate} onChange={e => setGameDate(e.target.value)} className="form-input" />
          </div>

          {/* Slot checkboxes */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="form-label mb-0">Time Slot{isKnockout ? '' : 's'}</label>
              {!isKnockout && (
                <button onClick={toggleAll}
                  className="font-rajdhani text-xs text-gold-dim hover:text-gold transition-colors">
                  {allSelected ? '✕ Deselect All' : '✓ Select All'}
                </button>
              )}
            </div>
            <div className="grid grid-cols-2 gap-2">
              {SLOT_TIMES.map(t => {
                const selected = slotTimes.includes(t)
                return (
                  <button key={t} onClick={() => toggleSlot(t)}
                    className={`flex items-center gap-3 px-4 py-3 rounded border text-left transition-all
                      ${selected
                        ? 'border-crimson bg-crimson/10 text-parchment'
                        : 'border-ink-5 bg-ink-4 text-zinc-500 hover:border-zinc-600'}`}>
                    <span className={`w-4 h-4 rounded-sm border flex-shrink-0 flex items-center justify-center text-[10px] font-bold
                      ${selected ? 'bg-crimson border-crimson text-white' : 'border-zinc-600'}`}>
                      {selected ? '✓' : ''}
                    </span>
                    <div>
                      <p className="font-cinzel text-sm font-semibold">{t}</p>
                    </div>
                  </button>
                )
              })}
            </div>
            {slotTimes.length > 0 && (
              <p className="font-rajdhani text-xs text-zinc-600 mt-2">
                {slotTimes.length} slot{slotTimes.length > 1 ? 's' : ''} selected — {slotTimes.sort().join(', ')}
              </p>
            )}
            {isKnockout && (
              <p className="font-rajdhani text-xs text-zinc-600 mt-2">
                A knockout hold is one specific game — pick a single slot.
              </p>
            )}
          </div>

          {/* Reason */}
          <div>
            <label className="form-label">Reason <span className="text-zinc-700">(internal only)</span></label>
            <select value={blockReason} onChange={e => handleReasonChange(e.target.value)} className="form-input">
              {BLOCK_REASONS.map(r => <option key={r} value={r}>{r}</option>)}
            </select>
          </div>

          {/* Knockout-only: tournament + format */}
          {isKnockout && (
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="form-label">Tournament</label>
                <select value={tournamentId} onChange={e => setTournamentId(e.target.value)} className="form-input">
                  <option value="">Select…</option>
                  {tournaments.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
                </select>
              </div>
              <div>
                <label className="form-label">Format</label>
                <select value={format} onChange={e => setFormat(e.target.value as GameFormat)} className="form-input">
                  <option value="">Select…</option>
                  {(slotTimes[0]
                    ? SLOT_FORMATS[slotTimes[0] as keyof typeof SLOT_FORMATS]
                    : ['T20', 'T30']
                  ).map(f => <option key={f} value={f}>{f}</option>)}
                </select>
              </div>
              {tournamentName && (
                <p className="col-span-2 font-rajdhani text-xs text-zinc-600">
                  Will be tagged and linked to <span className="text-gold-dim font-semibold">{tournamentName}</span>.
                </p>
              )}
            </div>
          )}

          {/* Notes */}
          <div>
            <label className="form-label">Notes</label>
            <textarea value={notes} onChange={e => setNotes(e.target.value)} rows={2}
              placeholder="e.g. Reserved for BTM Knockout — pending date confirmation"
              className="form-input resize-none" />
          </div>

          {/* What organisers see */}
          <div className="bg-gold/5 border border-gold-dim rounded px-4 py-3">
            <p className="font-rajdhani text-xs font-bold text-gold mb-1">What organisers will see</p>
            <p className="font-rajdhani text-xs text-zinc-500">
              Selected slots will show as <span className="text-red-400 font-bold">Unavailable</span> on
              the public schedule. No reason is displayed. You can release them anytime from the dashboard.
            </p>
          </div>

          {error && (
            <div className="bg-red-950 border border-red-800 text-red-400 font-rajdhani text-sm px-4 py-3 rounded">
              {error}
            </div>
          )}

          <div className="flex gap-3 justify-end pt-1">
            <button onClick={() => router.push('/admin')}
              className="font-rajdhani text-sm font-bold border border-ink-5 text-zinc-500 hover:text-zinc-300 px-5 py-2.5 rounded transition-colors">
              Cancel
            </button>
            <button onClick={handleSubmit}
              disabled={!gameDate || slotTimes.length === 0 || !blockReason || submitting || (isKnockout && (!tournamentId || !format))}
              className="font-rajdhani text-sm font-bold tracking-widest uppercase bg-crimson hover:bg-crimson-dark disabled:opacity-40 disabled:cursor-not-allowed text-white px-5 py-2.5 rounded transition-colors">
              {submitting
                ? 'Saving...'
                : isKnockout
                  ? '🔒 Reserve Knockout Hold'
                  : `🔒 Block ${slotTimes.length > 1 ? `${slotTimes.length} Slots` : 'Slot'}`}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
