‘use client’

import { useState } from ‘react’
import { useRouter } from ‘next/navigation’
import { SLOT_TIMES, BLOCK_REASONS } from ‘@/types’

export default function NewSoftBlockPage() {
const router = useRouter()
const [gameDate,    setGameDate]    = useState(’’)
const [slotTimes,   setSlotTimes]   = useState<string[]>([])
const [blockReason, setBlockReason] = useState<string>(BLOCK_REASONS[0])
const [notes,       setNotes]       = useState(’’)
const [submitting,  setSubmitting]  = useState(false)
const [error,       setError]       = useState(’’)

const allSelected = slotTimes.length === SLOT_TIMES.length

function toggleSlot(t: string) {
setSlotTimes(prev =>
prev.includes(t) ? prev.filter(s => s !== t) : […prev, t]
)
}

function toggleAll() {
setSlotTimes(allSelected ? [] : […SLOT_TIMES])
}

async function handleSubmit() {
if (!gameDate || slotTimes.length === 0 || !blockReason) return
setSubmitting(true)
setError(’’)

```
// POST one soft block per selected slot
const results = await Promise.all(
  slotTimes.map(slot =>
    fetch('/api/soft-blocks', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ game_date: gameDate, slot_time: slot, block_reason: blockReason, notes }),
    })
  )
)

const failed = results.filter(r => !r.ok)
if (failed.length > 0) {
  const d = await failed[0].json()
  setError(d.error ?? 'One or more slots failed to block.')
  setSubmitting(false)
} else {
  router.push('/admin?blocked=1')
}
```

}

return (
<div className="max-w-lg">
<div className="mb-6">
<h1 className="font-cinzel text-xl font-bold text-gold">Soft Block Slots</h1>
<p className="font-rajdhani text-zinc-500 text-sm mt-1">
Reserve one or more slots for internal use. Organisers will see them as unavailable.
</p>
</div>

```
  <div className="bg-ink-3 border border-ink-5 rounded p-5 space-y-4">

    {/* Date */}
    <div>
      <label className="form-label">Date</label>
      <input type="date" value={gameDate} onChange={e => setGameDate(e.target.value)} className="form-input" />
    </div>

    {/* Slot checkboxes */}
    <div>
      <div className="flex items-center justify-between mb-2">
        <label className="form-label mb-0">Time Slots</label>
        <button onClick={toggleAll}
          className="font-rajdhani text-xs text-gold-dim hover:text-gold transition-colors">
          {allSelected ? '✕ Deselect All' : '✓ Select All'}
        </button>
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
    </div>

    {/* Reason */}
    <div>
      <label className="form-label">Reason <span className="text-zinc-700">(internal only)</span></label>
      <select value={blockReason} onChange={e => setBlockReason(e.target.value)} className="form-input">
        {BLOCK_REASONS.map(r => <option key={r} value={r}>{r}</option>)}
      </select>
    </div>

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
        disabled={!gameDate || slotTimes.length === 0 || !blockReason || submitting}
        className="font-rajdhani text-sm font-bold tracking-widest uppercase bg-crimson hover:bg-crimson-dark disabled:opacity-40 disabled:cursor-not-allowed text-white px-5 py-2.5 rounded transition-colors">
        {submitting
          ? 'Saving...'
          : `🔒 Block ${slotTimes.length > 1 ? `${slotTimes.length} Slots` : 'Slot'}`}
      </button>
    </div>
  </div>
</div>
```

)
}