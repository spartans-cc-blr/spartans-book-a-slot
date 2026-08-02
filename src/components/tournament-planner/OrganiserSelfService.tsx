'use client'

import { useEffect, useState } from 'react'
import { parseISO, format } from 'date-fns'
import type { SuggestedSlotBucket } from '@/lib/suggestedSlots'

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

interface CardState {
  key:       string
  day:       'Sat' | 'Sun'
  slot_time: string
  format:    string
  game_date: string
  current:   number
  target:    number
  declined:  string[]
  phase:     Phase
  held:      HeldBooking | null
  error:     string
  busy:      boolean
  urlInput:  string
  urlError:  string
  urlBusy:   boolean
}

function initialCard(b: SuggestedSlotBucket): CardState {
  return {
    key: `${b.day}-${b.slot_time}`,
    day: b.day, slot_time: b.slot_time, format: b.format,
    game_date: b.game_date, current: b.current, target: b.target,
    declined: [], phase: 'pick', held: null, error: '', busy: false,
    urlInput: '', urlError: '', urlBusy: false,
  }
}

export function OrganiserSelfService({
  tournamentId, buckets, waNumber,
}: {
  tournamentId: string
  buckets: SuggestedSlotBucket[]
  waNumber: string
}) {
  const [name, setName]   = useState('')
  const [phone, setPhone] = useState('')
  const [cards, setCards] = useState<CardState[]>(() => buckets.map(initialCard))

  useEffect(() => {
    setName(localStorage.getItem(NAME_KEY) ?? '')
    setPhone(localStorage.getItem(PHONE_KEY) ?? '')
  }, [])

  const phoneDigits = phone.replace(/\D/g, '')
  const identityValid = name.trim().length >= 2 && phoneDigits.length >= 8

  function patchCard(key: string, patch: Partial<CardState>) {
    setCards(cs => cs.map(c => (c.key === key ? { ...c, ...patch } : c)))
  }

  async function advanceToNext(card: CardState, extraExclude?: string) {
    const excludeDates = extraExclude ? [...card.declined, extraExclude] : card.declined
    try {
      const res = await fetch(`/api/tournaments/${tournamentId}/organiser-next-slot`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ day: card.day, slot_time: card.slot_time, format: card.format, exclude_dates: excludeDates }),
      })
      const data = await res.json().catch(() => ({}))
      if (res.ok && data.game_date) {
        patchCard(card.key, { game_date: data.game_date, declined: excludeDates, phase: 'pick', busy: false, error: '' })
      } else {
        patchCard(card.key, { phase: 'exhausted', busy: false })
      }
    } catch {
      patchCard(card.key, { error: 'Could not reach the Hub — please try again.', busy: false })
    }
  }

  function declineCurrent(card: CardState) {
    patchCard(card.key, { busy: true, error: '' })
    advanceToNext(card, card.game_date)
  }

  async function reserveCurrent(card: CardState) {
    if (!identityValid || card.busy) return
    patchCard(card.key, { busy: true, error: '' })
    localStorage.setItem(NAME_KEY, name.trim())
    localStorage.setItem(PHONE_KEY, phone.trim())

    try {
      const res = await fetch(`/api/tournaments/${tournamentId}/organiser-reserve`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          game_date: card.game_date, slot_time: card.slot_time, format: card.format,
          organiser_name: name.trim(), organiser_phone: phone.trim(),
        }),
      })
      const data = await res.json().catch(() => ({}))
      if (res.status === 409 || data.taken) {
        await advanceToNext(card, card.game_date)
        return
      }
      if (!res.ok) {
        patchCard(card.key, { error: data.error ?? 'Something went wrong — please try again.', busy: false })
        return
      }
      patchCard(card.key, { phase: 'held', held: data.booking, busy: false })
    } catch {
      patchCard(card.key, { error: 'Could not reach the Hub — please try again.', busy: false })
    }
  }

  async function submitUrl(card: CardState) {
    if (!card.held || !card.urlInput.trim()) return
    patchCard(card.key, { urlBusy: true, urlError: '' })
    try {
      const res = await fetch(`/api/tournaments/${tournamentId}/organiser-attach-url`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ booking_id: card.held.id, cricheroes_url: card.urlInput.trim() }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        patchCard(card.key, { urlError: data.error ?? 'Could not save that link — please try again.', urlBusy: false })
        return
      }
      patchCard(card.key, { phase: 'done', urlBusy: false })
    } catch {
      patchCard(card.key, { urlError: 'Could not reach the Hub — please try again.', urlBusy: false })
    }
  }

  const waFallbackLink = `https://wa.me/${waNumber}?text=${encodeURIComponent(
    'Hi Spartans! We don’t see an open date that works for us right now — could you help us find one?'
  )}`

  return (
    <div className="mt-3 pt-3 border-t border-parchment-3">
      <p className="font-rajdhani text-[10px] uppercase tracking-widest text-stone-500 mb-1">
        Reserve your next dates
      </p>
      <p className="font-rajdhani text-[11px] text-stone-500 mb-2.5">
        One card per slot still below its target fill — reserve whichever suits your side.
      </p>

      <div className="grid grid-cols-2 gap-2 mb-3">
        <input
          type="text" value={name} onChange={e => setName(e.target.value)}
          placeholder="Your name"
          className="font-rajdhani text-xs px-2.5 py-2 rounded-lg border border-parchment-3 bg-white text-ink"
        />
        <input
          type="tel" value={phone} onChange={e => setPhone(e.target.value)}
          placeholder="WhatsApp number"
          className="font-rajdhani text-xs px-2.5 py-2 rounded-lg border border-parchment-3 bg-white text-ink"
        />
      </div>

      <div className="flex flex-col gap-2.5">
        {cards.map(card => (
          <div key={card.key}>
            {card.phase === 'pick' && (
              <div className="bg-emerald-50 border border-emerald-200 rounded-xl px-3.5 py-3">
                <div className="flex items-center justify-between gap-2 mb-1.5">
                  <span className="font-rajdhani text-[11px] font-bold tracking-wide text-emerald-700">
                    {card.day.toUpperCase()} · {card.slot_time}
                  </span>
                  <span className="font-rajdhani text-[11px] text-emerald-700" style={{ fontVariantNumeric: 'tabular-nums' }}>
                    {card.current}/{card.target}
                  </span>
                </div>
                <p className="font-rajdhani text-sm font-bold text-emerald-800 mb-2.5">
                  {format(parseISO(card.game_date), 'EEEE d MMM')}
                </p>
                {card.error && <p className="font-rajdhani text-xs text-red-700 mb-2">{card.error}</p>}
                <div className="flex gap-2">
                  <button onClick={() => reserveCurrent(card)} disabled={!identityValid || card.busy}
                    className="font-rajdhani text-xs font-bold tracking-wide bg-emerald-600 hover:bg-emerald-700 disabled:opacity-40 disabled:cursor-not-allowed text-white px-3.5 py-2 rounded-lg transition-colors">
                    {card.busy ? 'Reserving…' : '✅ Reserve this'}
                  </button>
                  <button onClick={() => declineCurrent(card)} disabled={card.busy}
                    className="font-rajdhani text-xs font-bold tracking-wide bg-white border border-red-200 text-red-700 hover:bg-red-50 disabled:opacity-40 px-3.5 py-2 rounded-lg transition-colors">
                    ❌ Not available
                  </button>
                </div>
              </div>
            )}

            {card.phase === 'held' && card.held && (
              <div className="bg-amber-50 border border-amber-200 rounded-xl px-3.5 py-3">
                <p className="font-rajdhani text-sm font-bold text-amber-800 mb-1">
                  🔒 Reserved — {format(parseISO(card.held.game_date), 'EEEE d MMM')} · {card.held.slot_time}
                </p>
                <p className="font-rajdhani text-xs text-amber-700 mb-2.5">
                  Held for 48 hours while we finalise. Once your CricHeroes match link exists, paste it below and we’ll confirm shortly after.
                </p>
                <div className="flex gap-2">
                  <input
                    type="text" value={card.urlInput} onChange={e => patchCard(card.key, { urlInput: e.target.value })}
                    placeholder="https://cricheroes.in/scorecard/..."
                    className="flex-1 font-rajdhani text-xs px-2.5 py-2 rounded-lg border border-amber-200 bg-white text-ink"
                  />
                  <button onClick={() => submitUrl(card)} disabled={!card.urlInput.trim() || card.urlBusy}
                    className="font-rajdhani text-xs font-bold tracking-wide bg-amber-600 hover:bg-amber-700 disabled:opacity-40 disabled:cursor-not-allowed text-white px-3.5 py-2 rounded-lg transition-colors whitespace-nowrap">
                    {card.urlBusy ? 'Saving…' : 'Submit'}
                  </button>
                </div>
                {card.urlError && <p className="font-rajdhani text-xs text-red-700 mt-2">{card.urlError}</p>}
              </div>
            )}

            {card.phase === 'done' && (
              <div className="bg-emerald-50 border border-emerald-200 rounded-xl px-3.5 py-3">
                <p className="font-rajdhani text-sm font-bold text-emerald-800">
                  ✅ Thanks! We’ll confirm your {card.day} {card.slot_time} slot shortly.
                </p>
              </div>
            )}

            {card.phase === 'exhausted' && (
              <div className="bg-stone-50 border border-parchment-3 rounded-xl px-3.5 py-3">
                <p className="font-rajdhani text-sm text-stone-600 mb-2">
                  No open {card.day} {card.slot_time} dates left in our current window — message us directly and we’ll find one.
                </p>
                <a href={waFallbackLink} target="_blank" rel="noopener noreferrer"
                  className="font-rajdhani text-xs font-bold text-emerald-700 underline">
                  Message Spartans on WhatsApp →
                </a>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}
