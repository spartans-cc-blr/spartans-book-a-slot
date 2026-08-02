'use client'

import { useEffect, useState } from 'react'
import { parseISO, format } from 'date-fns'
import type { SuggestedDate } from '@/lib/suggestedSlots'

const NAME_KEY  = 'spartans_organiser_name'
const PHONE_KEY = 'spartans_organiser_phone'

type Phase = 'pick' | 'held' | 'done' | 'exhausted'

interface HeldBooking {
  id:             string
  game_date:      string
  slot_time:      string
  format:         string
  reserved_until: string
}

export function OrganiserSelfService({
  tournamentId, suggestedDates, waNumber,
}: {
  tournamentId: string
  suggestedDates: SuggestedDate[]
  waNumber: string
}) {
  const [idx, setIdx]             = useState(0)
  const [phase, setPhase]         = useState<Phase>('pick')
  const [name, setName]           = useState('')
  const [phone, setPhone]         = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError]         = useState('')
  const [justTaken, setJustTaken] = useState(false)
  const [held, setHeld]           = useState<HeldBooking | null>(null)
  const [urlInput, setUrlInput]   = useState('')
  const [urlSubmitting, setUrlSubmitting] = useState(false)
  const [urlError, setUrlError]   = useState('')

  useEffect(() => {
    setName(localStorage.getItem(NAME_KEY) ?? '')
    setPhone(localStorage.getItem(PHONE_KEY) ?? '')
  }, [])

  const current = suggestedDates[idx]
  const phoneDigits = phone.replace(/\D/g, '')
  const canReserve = name.trim().length >= 2 && phoneDigits.length >= 8 && !submitting

  function declineCurrent() {
    setError('')
    setJustTaken(false)
    if (idx + 1 < suggestedDates.length) {
      setIdx(i => i + 1)
    } else {
      setPhase('exhausted')
    }
  }

  async function reserveCurrent() {
    if (!current || !canReserve) return
    setSubmitting(true)
    setError('')
    setJustTaken(false)
    localStorage.setItem(NAME_KEY, name.trim())
    localStorage.setItem(PHONE_KEY, phone.trim())

    try {
      const res = await fetch(`/api/tournaments/${tournamentId}/organiser-reserve`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ game_date: current.game_date, organiser_name: name.trim(), organiser_phone: phone.trim() }),
      })
      const data = await res.json().catch(() => ({}))
      if (res.status === 409 || data.taken) {
        setJustTaken(true)
        setSubmitting(false)
        declineCurrent()
        return
      }
      if (!res.ok) {
        setError(data.error ?? 'Something went wrong — please try again.')
        setSubmitting(false)
        return
      }
      setHeld(data.booking)
      setPhase('held')
    } catch {
      setError('Could not reach the Hub — please try again.')
    }
    setSubmitting(false)
  }

  async function submitUrl() {
    if (!held || !urlInput.trim()) return
    setUrlSubmitting(true)
    setUrlError('')
    try {
      const res = await fetch(`/api/tournaments/${tournamentId}/organiser-attach-url`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ booking_id: held.id, cricheroes_url: urlInput.trim() }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        setUrlError(data.error ?? 'Could not save that link — please try again.')
        setUrlSubmitting(false)
        return
      }
      setPhase('done')
    } catch {
      setUrlError('Could not reach the Hub — please try again.')
    }
    setUrlSubmitting(false)
  }

  const waFallbackLink = `https://wa.me/${waNumber}?text=${encodeURIComponent(
    'Hi Spartans! We don’t see an open date that works for us right now — could you help us find one?'
  )}`

  return (
    <div className="mt-3 pt-3 border-t border-parchment-3">
      <p className="font-rajdhani text-[10px] uppercase tracking-widest text-stone-500 mb-2">
        Reserve your next date
      </p>

      {phase === 'pick' && current && (
        <div className="bg-emerald-50 border border-emerald-200 rounded-xl px-3.5 py-3">
          <p className="font-rajdhani text-sm font-bold text-emerald-800 mb-2">
            {justTaken && 'That date was just taken — here’s the next one: '}
            {current.day} {format(parseISO(current.game_date), 'd MMM')}
          </p>
          <div className="grid grid-cols-2 gap-2 mb-2.5">
            <input
              type="text" value={name} onChange={e => setName(e.target.value)}
              placeholder="Your name"
              className="font-rajdhani text-xs px-2.5 py-2 rounded-lg border border-emerald-200 bg-white text-ink"
            />
            <input
              type="tel" value={phone} onChange={e => setPhone(e.target.value)}
              placeholder="WhatsApp number"
              className="font-rajdhani text-xs px-2.5 py-2 rounded-lg border border-emerald-200 bg-white text-ink"
            />
          </div>
          {error && <p className="font-rajdhani text-xs text-red-700 mb-2">{error}</p>}
          <div className="flex gap-2">
            <button onClick={reserveCurrent} disabled={!canReserve}
              className="font-rajdhani text-xs font-bold tracking-wide bg-emerald-600 hover:bg-emerald-700 disabled:opacity-40 disabled:cursor-not-allowed text-white px-3.5 py-2 rounded-lg transition-colors">
              {submitting ? 'Reserving…' : '✅ Reserve this'}
            </button>
            <button onClick={declineCurrent} disabled={submitting}
              className="font-rajdhani text-xs font-bold tracking-wide bg-white border border-red-200 text-red-700 hover:bg-red-50 disabled:opacity-40 px-3.5 py-2 rounded-lg transition-colors">
              ❌ Not available
            </button>
          </div>
        </div>
      )}

      {phase === 'held' && held && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl px-3.5 py-3">
          <p className="font-rajdhani text-sm font-bold text-amber-800 mb-1">
            🔒 Reserved for you — {format(parseISO(held.game_date), 'EEEE d MMM')} · {held.slot_time}
          </p>
          <p className="font-rajdhani text-xs text-amber-700 mb-2.5">
            Held for 48 hours while we finalise. Once your CricHeroes match link exists, paste it below and we’ll confirm shortly after.
          </p>
          <div className="flex gap-2">
            <input
              type="text" value={urlInput} onChange={e => setUrlInput(e.target.value)}
              placeholder="https://cricheroes.in/scorecard/..."
              className="flex-1 font-rajdhani text-xs px-2.5 py-2 rounded-lg border border-amber-200 bg-white text-ink"
            />
            <button onClick={submitUrl} disabled={!urlInput.trim() || urlSubmitting}
              className="font-rajdhani text-xs font-bold tracking-wide bg-amber-600 hover:bg-amber-700 disabled:opacity-40 disabled:cursor-not-allowed text-white px-3.5 py-2 rounded-lg transition-colors whitespace-nowrap">
              {urlSubmitting ? 'Saving…' : 'Submit'}
            </button>
          </div>
          {urlError && <p className="font-rajdhani text-xs text-red-700 mt-2">{urlError}</p>}
        </div>
      )}

      {phase === 'done' && (
        <div className="bg-emerald-50 border border-emerald-200 rounded-xl px-3.5 py-3">
          <p className="font-rajdhani text-sm font-bold text-emerald-800">
            ✅ Thanks! We’ll confirm your slot shortly.
          </p>
        </div>
      )}

      {phase === 'exhausted' && (
        <div className="bg-stone-50 border border-parchment-3 rounded-xl px-3.5 py-3">
          <p className="font-rajdhani text-sm text-stone-600 mb-2">
            No open dates left in our current window — message us directly and we’ll find one.
          </p>
          <a href={waFallbackLink} target="_blank" rel="noopener noreferrer"
            className="font-rajdhani text-xs font-bold text-emerald-700 underline">
            Message Spartans on WhatsApp →
          </a>
        </div>
      )}
    </div>
  )
}
