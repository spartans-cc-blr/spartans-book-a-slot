'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { SLOT_TIMES, BLOCK_REASONS } from '@/types'
import type { SlotTime } from '@/types'

export default function NewSoftBlockPage() {
  const router = useRouter()
  const [gameDate,     setGameDate]     = useState('')
  const [slotTime,     setSlotTime]     = useState<SlotTime | ''>('')
  const [blockReason,  setBlockReason]  = useState(BLOCK_REASONS[0])
  const [notes,        setNotes]        = useState('')
  const [submitting,   setSubmitting]   = useState(false)
  const [error,        setError]        = useState('')

  async function handleSubmit() {
    if (!gameDate || !slotTime || !blockReason) return
    setSubmitting(true)
    setError('')
    const res = await fetch('/api/soft-blocks', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ game_date: gameDate, slot_time: slotTime, block_reason: blockReason, notes }),
    })
    if (res.ok) {
      router.push('/admin?blocked=1')
    } else {
      const d = await res.json()
      setError(d.error ?? 'Something went wrong.')
      setSubmitting(false)
    }
  }

  return (
    <div className="max-w-lg">
      <div className="mb-6">
        <h1 className="font-cinzel text-xl font-bold text-gold">Soft Block a Slot</h1>
        <p className="font-rajdhani text-zinc-500 text-sm mt-1">
          Reserve a slot for internal use. Organisers will see it as unavailable — no reason shown publicly.
        </p>
      </div>

      <div className="bg-ink-3 border border-ink-5 rounded p-5 space-y-4">
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="form-label">Date</label>
            <input type="date" value={gameDate} onChange={e => setGameDate(e.target.value)} className="form-input" />
          </div>
          <div>
            <label className="form-label">Time Slot</label>
            <select value={slotTime} onChange={e => setSlotTime(e.target.value as SlotTime)} className="form-input">
              <option value="">Select slot...</option>
              {SLOT_TIMES.map(t => <option key={t} value={t}>{t}</option>)}
            </select>
          </div>
        </div>

        <div>
          <label className="form-label">Reason <span className="text-zinc-700">(internal only)</span></label>
          <select value={blockReason} onChange={e => setBlockReason(e.target.value)} className="form-input">
            {BLOCK_REASONS.map(r => <option key={r} value={r}>{r}</option>)}
          </select>
        </div>

        <div>
          <label className="form-label">Notes</label>
          <textarea value={notes} onChange={e => setNotes(e.target.value)} rows={2}
            placeholder="e.g. Reserved for BTM Knockout — pending date confirmation" className="form-input resize-none" />
        </div>

        {/* What organisers see */}
        <div className="bg-gold/5 border border-gold-dim rounded px-4 py-3">
          <p className="font-rajdhani text-xs font-bold text-gold mb-1">What organisers will see</p>
          <p className="font-rajdhani text-xs text-zinc-500">
            The slot will show as <span className="text-red-400 font-bold">Unavailable</span> on the public schedule. No reason is displayed. You can release it anytime from the dashboard.
          </p>
        </div>

        {error && (
          <div className="bg-red-950 border border-red-800 text-red-400 font-rajdhani text-sm px-4 py-3 rounded">{error}</div>
        )}

        <div className="flex gap-3 justify-end pt-1">
          <button onClick={() => router.push('/admin')}
            className="font-rajdhani text-sm font-bold border border-ink-5 text-zinc-500 hover:text-zinc-300 px-5 py-2.5 rounded transition-colors">
            Cancel
          </button>
          <button onClick={handleSubmit} disabled={!gameDate || !slotTime || !blockReason || submitting}
            className="font-rajdhani text-sm font-bold tracking-widest uppercase bg-crimson hover:bg-crimson-dark disabled:opacity-40 disabled:cursor-not-allowed text-white px-5 py-2.5 rounded transition-colors">
            {submitting ? 'Saving...' : '🔒 Reserve Slot'}
          </button>
        </div>
      </div>
    </div>
  )
}
