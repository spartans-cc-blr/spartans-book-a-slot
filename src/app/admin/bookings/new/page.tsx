'use client'

import { useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import type { Captain, Tournament, SlotTime, GameFormat, ValidationResult, RuleCheckItem } from '@/types'
import { SLOT_TIMES, SLOT_FORMATS } from '@/types'

const RULES: { rule: string; label: string }[] = [
  { rule: 'R1', label: 'Max 3 games per weekend' },
  { rule: 'R2', label: 'One captain per weekend' },
  { rule: 'R3', label: 'Max 2 games per tournament/month' },
  { rule: 'R4', label: 'Slot not already taken' },
  { rule: 'R5', label: 'No T20/T30 format clash' },
  { rule: 'R6', label: '12:30 game runs till evening' },
]

export default function NewBookingPage() {
  const router = useRouter()

  // Form state
  const [gameDate,     setGameDate]     = useState('')
  const [format,       setFormat]       = useState<GameFormat | ''>('')
  const [slotTime,     setSlotTime]     = useState<SlotTime | ''>('')
  const [captainId,    setCaptainId]    = useState('')
  const [tournamentId, setTournamentId] = useState('')
  const [venue,        setVenue]        = useState('')
  const [notes,        setNotes]        = useState('')

  // Data
  const [captains,     setCaptains]     = useState<Captain[]>([])
  const [tournaments,  setTournaments]  = useState<Tournament[]>([])

  // Validation
  const [ruleChecks,   setRuleChecks]   = useState<RuleCheckItem[]>(
    RULES.map(r => ({ ...r, status: 'pending', message: 'Waiting for input...' }))
  )
  const [submitting,   setSubmitting]   = useState(false)
  const [submitError,  setSubmitError]  = useState('')

  // Load captains and tournaments
  useEffect(() => {
    fetch('/api/captains').then(r => r.json()).then(d => setCaptains(d.captains ?? []))
    fetch('/api/tournaments').then(r => r.json()).then(d => setTournaments(d.tournaments ?? []))
  }, [])

  // Live validation whenever key fields change
  const validate = useCallback(async () => {
    if (!gameDate || !format || !slotTime || !captainId || !tournamentId) {
      setRuleChecks(RULES.map(r => ({ ...r, status: 'pending', message: 'Fill all fields to check.' })))
      return
    }
    const res = await fetch('/api/validate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ game_date: gameDate, format, slot_time: slotTime, captain_id: captainId, tournament_id: tournamentId }),
    })
    const result: ValidationResult = await res.json()
    const errorMap   = Object.fromEntries(result.errors.map(e => [e.rule, e.message]))
    const warningMap = Object.fromEntries((result.warnings ?? []).map(e => [e.rule, e.message]))
    setRuleChecks(RULES.map(r => ({
      ...r,
      status:  errorMap[r.rule] ? 'fail' : warningMap[r.rule] ? 'warn' : 'pass',
      message: errorMap[r.rule] ?? warningMap[r.rule] ?? '✓ Passed',
    })))
  }, [gameDate, format, slotTime, captainId, tournamentId])

  useEffect(() => { validate() }, [validate])

  const allPassed = ruleChecks.every(r => r.status === 'pass' || r.status === 'warn')

  const availableSlots = format
    ? SLOT_TIMES.filter(t => SLOT_FORMATS[t].includes(format as GameFormat))
    : SLOT_TIMES

  async function handleSubmit() {
    if (!allPassed) return
    setSubmitting(true)
    setSubmitError('')
    const res = await fetch('/api/bookings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ game_date: gameDate, format, slot_time: slotTime, captain_id: captainId, tournament_id: tournamentId, venue, notes }),
    })
    if (res.ok) {
      router.push('/admin?booked=1')
    } else {
      const d = await res.json()
      setSubmitError(d.errors?.[0]?.message ?? d.error ?? 'Something went wrong.')
      setSubmitting(false)
    }
  }

  return (
    <div>
      <div className="mb-6">
        <h1 className="font-cinzel text-xl font-bold text-gold">New Booking</h1>
        <p className="font-rajdhani text-zinc-500 text-sm mt-1">All 5 scheduling rules are checked live as you fill the form.</p>
      </div>

      <div className="grid lg:grid-cols-[1fr_300px] gap-6">
        {/* ── LEFT: FORM ── */}
        <div className="space-y-4">

          {/* Step 1: Date & Format */}
          <FormCard step={1} title="Date & Format">
            <div className="grid sm:grid-cols-2 gap-4">
              <div>
                <label className="form-label">Game Date <span className="text-zinc-700">(Sat/Sun only)</span></label>
                <input type="date" value={gameDate} onChange={e => { setGameDate(e.target.value); setSlotTime('') }}
                  className="form-input" />
              </div>
              <div>
                <label className="form-label">Format</label>
                <div className="flex border border-ink-5 rounded overflow-hidden">
                  {(['T20', 'T30'] as GameFormat[]).map(f => (
                    <button key={f} onClick={() => { setFormat(f); setSlotTime('') }}
                      className={`flex-1 py-2.5 font-cinzel text-sm font-semibold transition-colors
                        ${format === f ? 'bg-gold-dim text-gold-light' : 'bg-ink-4 text-zinc-500 hover:text-zinc-300'}`}>
                      {f}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </FormCard>

          {/* Step 2: Slot */}
          <FormCard step={2} title="Time Slot">
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              {SLOT_TIMES.map(t => {
                const available = availableSlots.includes(t)
                return (
                  <button key={t} disabled={!available || !format}
                    onClick={() => setSlotTime(t)}
                    className={`py-3 rounded border text-center transition-all
                      ${!available || !format ? 'opacity-30 cursor-not-allowed bg-ink-4 border-ink-5' :
                        slotTime === t ? 'border-gold bg-gold/10 text-gold' :
                        'bg-ink-4 border-ink-5 text-parchment hover:border-gold-dim'}`}>
                    <p className="font-cinzel text-sm font-semibold">{t}</p>
                    <p className="font-rajdhani text-[10px] text-zinc-600 mt-0.5">{SLOT_FORMATS[t].join('/')}</p>
                  </button>
                )
              })}
            </div>
            {!format && <p className="font-rajdhani text-xs text-zinc-600 mt-2 italic">Select a format first</p>}
          </FormCard>

          {/* Step 3: Captain */}
          <FormCard step={3} title="Assign Captain">
            <div className="grid grid-cols-2 gap-2">
              {captains.filter(c => c.active).map(c => (
                <button key={c.id} onClick={() => setCaptainId(c.id)}
                  className={`px-4 py-3 border rounded text-left transition-all
                    ${captainId === c.id ? 'border-gold bg-gold/8 text-gold' : 'border-ink-5 bg-ink-4 text-parchment hover:border-gold-dim'}`}>
                  <p className="font-rajdhani font-semibold text-sm">{c.name}</p>
                </button>
              ))}
            </div>
          </FormCard>

          {/* Step 4: Tournament */}
          <FormCard step={4} title="Tournament">
            <select value={tournamentId} onChange={e => setTournamentId(e.target.value)} className="form-input">
              <option value="">Select tournament...</option>
              {tournaments.filter(t => t.active).map(t => (
                <option key={t.id} value={t.id}>{t.name}{t.organiser_name ? ` — ${t.organiser_name}` : ''}</option>
              ))}
            </select>
          </FormCard>

          {/* Step 5: Venue & Notes */}
          <FormCard step={5} title="Venue & Notes (optional)">
            <div className="space-y-3">
              <div>
                <label className="form-label">Venue</label>
                <input type="text" value={venue} onChange={e => setVenue(e.target.value)}
                  placeholder="e.g. Stellar Cricket Ground, HSR Layout" className="form-input" />
              </div>
              <div>
                <label className="form-label">Internal Notes <span className="text-zinc-700">(never shown publicly)</span></label>
                <textarea value={notes} onChange={e => setNotes(e.target.value)} rows={2}
                  placeholder="Any notes for your reference..." className="form-input resize-none" />
              </div>
            </div>
          </FormCard>

          {submitError && (
            <div className="bg-red-950 border border-red-800 text-red-400 font-rajdhani text-sm px-4 py-3 rounded">
              {submitError}
            </div>
          )}

          <div className="flex gap-3 justify-end">
            <button onClick={() => router.push('/admin')}
              className="font-rajdhani text-sm font-bold tracking-wide border border-ink-5 text-zinc-500 hover:text-zinc-300 px-5 py-2.5 rounded transition-colors">
              Cancel
            </button>
            <button onClick={handleSubmit} disabled={!allPassed || submitting}
              className="font-rajdhani text-sm font-bold tracking-widest uppercase bg-crimson hover:bg-crimson-dark disabled:opacity-40 disabled:cursor-not-allowed text-white px-6 py-2.5 rounded transition-colors">
              {submitting ? 'Saving...' : '✓ Confirm Booking'}
            </button>
          </div>
        </div>

        {/* ── RIGHT: RULE PANEL ── */}
        <div>
          <div className="bg-ink-3 border border-ink-5 rounded overflow-hidden sticky top-20">
            <div className="bg-ink-4 px-4 py-3 border-b border-ink-5">
              <p className="font-cinzel text-sm text-gold">⚖ Live Rule Check</p>
            </div>
            {ruleChecks.map(r => (
              <div key={r.rule} className="px-4 py-3 border-b border-ink-4 flex gap-3 items-start">
                <span className="text-sm mt-0.5 flex-shrink-0">
                  {r.status === 'pass' ? '✅' : r.status === 'fail' ? '❌' : r.status === 'warn' ? '⚠️' : '⏳'}
                </span>
                <div>
                  <p className={`font-rajdhani text-xs font-bold ${r.status === 'pass' ? 'text-emerald-400' : r.status === 'fail' ? 'text-red-400' : r.status === 'warn' ? 'text-yellow-400' : 'text-zinc-600'}`}>
                    {r.rule}: {r.label}
                  </p>
                  <p className="font-rajdhani text-xs text-zinc-600 mt-0.5">{r.message}</p>
                </div>
              </div>
            ))}
            <div className="px-4 py-3 bg-ink-4">
              {allPassed
                ? <p className="font-rajdhani text-xs text-emerald-400 font-bold">✓ All rules passed. Ready to confirm.</p>
                : <p className="font-rajdhani text-xs text-zinc-600">Fix the issues above before confirming.</p>}
            </div>
          </div>

          {/* Summary */}
          {gameDate && slotTime && captainId && (
            <div className="mt-4 bg-ink-3 border border-ink-5 rounded p-4">
              <p className="font-cinzel text-xs text-gold mb-3">Booking Summary</p>
              <div className="font-rajdhani text-sm text-zinc-400 space-y-1.5 leading-relaxed">
                {gameDate    && <p>📅 {gameDate}</p>}
                {slotTime    && <p>🕐 {slotTime} {format && `— ${format}`}</p>}
                {captainId   && <p>👤 {captains.find(c=>c.id===captainId)?.name}</p>}
                {tournamentId && <p>🏆 {tournaments.find(t=>t.id===tournamentId)?.name}</p>}
                {venue       && <p>📍 {venue}</p>}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

function FormCard({ step, title, children }: { step: number; title: string; children: React.ReactNode }) {
  return (
    <div className="bg-ink-3 border border-ink-5 rounded p-5">
      <div className="flex items-center gap-3 mb-4 pb-3 border-b border-ink-5">
        <span className="w-5 h-5 bg-crimson rounded-full flex items-center justify-center font-mono text-xs text-white font-bold flex-shrink-0">
          {step}
        </span>
        <h3 className="font-cinzel text-sm text-gold font-semibold">{title}</h3>
      </div>
      {children}
    </div>
  )
}
