'use client'

import { useState, useRef, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'

// ── Types ─────────────────────────────────────────────────────────────────────
interface Captain { id: string; name: string; cricheroes_url?: string | null }
interface Ground  { id: string; name: string }
interface Tournament { id: string; name: string }
interface UpcomingBooking {
  id: string
  game_date: string
  slot_time: string
  format: string | null
  status: string
  captain_name: string | null
  tournament_name: string | null
}

interface ParsedCommand {
  action: 'book' | 'reserve' | 'modify' | 'cancel' | null
  booking_id: string | null
  game_date: string | null
  slot_time: string | null
  format: string | null
  captain_id: string | null
  captain_name: string | null
  tournament_id: string | null
  tournament_name: string | null
  venue: string | null
  organiser_name: string | null
  organiser_phone: string | null
  notes: string | null
  opponent_name: string | null
  confidence: 'high' | 'medium' | 'low'
  issues: string[]
  summary: string
}

interface NLPBookingBarProps {
  captains: Captain[]
  grounds: Ground[]
  tournaments: Tournament[]
  upcomingBookings: UpcomingBooking[]
}

// ── Example hints ─────────────────────────────────────────────────────────────
const EXAMPLES = [
  'book sat 3 may 07:30 T30 at Neelgiri',
  'reserve 26 apr 07:30 for Ranjith',
  'cancel booking on 3 may 10:30',
  'change 26 apr 07:30 captain to Vikram',
]

// ── Format date nicely ─────────────────────────────────────────────────────────
function fmtDate(d: string) {
  if (!d) return ''
  const dt = new Date(d + 'T00:00:00')
  return dt.toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short' })
}

// ── Slot label ─────────────────────────────────────────────────────────────────
function slotLabel(s: string) {
  const map: Record<string, string> = {
    '07:30': '7:30 AM', '10:30': '10:30 AM', '12:30': '12:30 PM', '14:30': '2:30 PM',
  }
  return map[s] ?? s
}

// ── Action pill colours ────────────────────────────────────────────────────────
const ACTION_STYLE: Record<string, string> = {
  book:    'bg-emerald-900/60 text-emerald-400 border-emerald-800',
  reserve: 'bg-amber-900/60  text-amber-400  border-amber-800',
  modify:  'bg-blue-900/60   text-blue-400   border-blue-800',
  cancel:  'bg-red-900/60    text-red-400    border-red-800',
}

const ACTION_ICON: Record<string, string> = {
  book: '✚', reserve: '⏸', modify: '✎', cancel: '✕',
}

// ── Confidence indicator ───────────────────────────────────────────────────────
function ConfidenceDot({ confidence }: { confidence: string }) {
  const colour = confidence === 'high' ? 'bg-emerald-400' : confidence === 'medium' ? 'bg-amber-400' : 'bg-red-400'
  return (
    <span className="flex items-center gap-1.5 font-rajdhani text-xs text-zinc-500">
      <span className={`inline-block w-1.5 h-1.5 rounded-full ${colour}`} />
      {confidence} confidence
    </span>
  )
}

export default function NLPBookingBar({ captains, grounds, tournaments, upcomingBookings }: NLPBookingBarProps) {
  const router = useRouter()
  const [open, setOpen]           = useState(false)
  const [text, setText]           = useState('')
  const [parsing, setParsing]     = useState(false)
  const [parsed, setParsed]       = useState<ParsedCommand | null>(null)
  const [parseError, setParseError] = useState('')
  const [executing, setExecuting] = useState(false)
  const [execError, setExecError] = useState('')
  const [hintIdx, setHintIdx]     = useState(0)
  const inputRef = useRef<HTMLTextAreaElement>(null)

  // Rotate hint placeholder
  useEffect(() => {
    const t = setInterval(() => setHintIdx(i => (i + 1) % EXAMPLES.length), 3500)
    return () => clearInterval(t)
  }, [])

  // Focus input when opened
  useEffect(() => {
    if (open) setTimeout(() => inputRef.current?.focus(), 80)
  }, [open])

  // Close on Escape
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { setOpen(false); reset() }
      // Cmd/Ctrl+K to open
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') { e.preventDefault(); setOpen(v => !v) }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [])

  function reset() {
    setText('')
    setParsed(null)
    setParseError('')
    setExecError('')
  }

  // ── Parse ─────────────────────────────────────────────────────────────────
  const handleParse = useCallback(async () => {
    if (!text.trim()) return
    setParsing(true)
    setParsed(null)
    setParseError('')
    setExecError('')

    try {
      const res = await fetch('/api/admin/nlp-parse', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          text: text.trim(),
          context: {
            captains: captains.map(c => ({ id: c.id, name: c.name })),
            grounds:  grounds.map(g => ({ id: g.id, name: g.name })),
            tournaments: tournaments.map(t => ({ id: t.id, name: t.name })),
            upcomingBookings: upcomingBookings.map(b => ({
              id: b.id,
              game_date: b.game_date,
              slot_time: b.slot_time,
              format: b.format,
              captain_name: b.captain_name,
              tournament_name: b.tournament_name,
            })),
          },
        }),
      })

      if (!res.ok) {
        const d = await res.json()
        setParseError(d.error ?? 'Parse failed')
        return
      }

      const data: ParsedCommand = await res.json()
      setParsed(data)

      // Low confidence → redirect to form pre-filled instead of confirming directly
      if (data.confidence === 'low') return

    } catch (err) {
      setParseError('Network error — try again')
    } finally {
      setParsing(false)
    }
  }, [text, captains, grounds, tournaments, upcomingBookings])

  // Ctrl+Enter to parse
  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
      e.preventDefault()
      handleParse()
    }
  }

  // ── Build pre-fill URL for form redirect (low confidence or edit) ──────────
  function buildFormURL(p: ParsedCommand): string {
    if (p.action === 'cancel' && p.booking_id) {
      return `/admin/bookings/${p.booking_id}`
    }
    if (p.action === 'modify' && p.booking_id) {
      const params = new URLSearchParams()
      if (p.game_date)    params.set('date', p.game_date)
      if (p.slot_time)    params.set('slot', p.slot_time)
      if (p.format)       params.set('format', p.format)
      if (p.captain_id)   params.set('captain', p.captain_id)
      return `/admin/bookings/${p.booking_id}?${params}`
    }
    if (p.action === 'reserve') {
      const params = new URLSearchParams()
      if (p.game_date)      params.set('date', p.game_date)
      if (p.slot_time)      params.set('slot', p.slot_time)
      if (p.organiser_name) params.set('organiser', p.organiser_name)
      if (p.organiser_phone)params.set('phone', p.organiser_phone)
      if (p.notes)          params.set('notes', p.notes)
      return `/admin/soft-blocks/new?${params}`
    }
    // book
    const params = new URLSearchParams()
    if (p.game_date)      params.set('date', p.game_date)
    if (p.slot_time)      params.set('slot', p.slot_time)
    if (p.format)         params.set('format', p.format)
    if (p.captain_id)     params.set('captain', p.captain_id)
    if (p.tournament_id)  params.set('tournament', p.tournament_id)
    if (p.venue)          params.set('venue', p.venue)
    if (p.notes)          params.set('notes', p.notes)
    if (p.opponent_name)  params.set('opponent', p.opponent_name)
    return `/admin/bookings/new?${params}`
  }

  // ── Execute — calls existing API routes, all protected by requireAdmin() ──
  async function handleExecute() {
    if (!parsed) return
    setExecuting(true)
    setExecError('')

    try {
      // CANCEL
      if (parsed.action === 'cancel') {
        if (!parsed.booking_id) { setExecError('Could not identify which booking to cancel.'); return }
        const res = await fetch(`/api/bookings/${parsed.booking_id}`, { method: 'DELETE' })
        if (!res.ok) { const d = await res.json(); setExecError(d.error ?? 'Cancel failed'); return }
        setOpen(false); reset()
        router.push('/admin?saved=1')
        router.refresh()
        return
      }

      // MODIFY
      if (parsed.action === 'modify') {
        if (!parsed.booking_id) { setExecError('Could not identify which booking to modify.'); return }
        const body: Record<string, any> = {}
        if (parsed.slot_time)    body.slot_time    = parsed.slot_time
        if (parsed.format)       body.format       = parsed.format
        if (parsed.captain_id)   body.captain_id   = parsed.captain_id
        if (parsed.tournament_id)body.tournament_id = parsed.tournament_id
        if (parsed.venue)        body.venue        = parsed.venue
        if (parsed.notes)        body.notes        = parsed.notes
        if (parsed.opponent_name)body.opponent_name = parsed.opponent_name
        const res = await fetch(`/api/bookings/${parsed.booking_id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        })
        if (!res.ok) { const d = await res.json(); setExecError(d.error ?? 'Update failed'); return }
        setOpen(false); reset()
        router.push('/admin?saved=1')
        router.refresh()
        return
      }

      // RESERVE (soft block)
      if (parsed.action === 'reserve') {
        if (!parsed.game_date || !parsed.slot_time) {
          setExecError('Date and slot are required for a reservation.')
          return
        }
        const res = await fetch('/api/bookings/reserve', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            game_date:      parsed.game_date,
            slot_time:      parsed.slot_time,
            organiser_name: parsed.organiser_name ?? 'TBC',
            organiser_phone:parsed.organiser_phone ?? null,
            notes:          parsed.notes ?? null,
          }),
        })
        if (!res.ok) { const d = await res.json(); setExecError(d.error ?? 'Reserve failed'); return }
        setOpen(false); reset()
        router.push('/admin?reserved=1')
        router.refresh()
        return
      }

      // BOOK (new confirmed booking)
      if (parsed.action === 'book') {
        if (!parsed.game_date || !parsed.slot_time || !parsed.format) {
          setExecError('Date, slot and format are required to book.')
          return
        }
        const res = await fetch('/api/bookings', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            game_date:      parsed.game_date,
            slot_time:      parsed.slot_time,
            format:         parsed.format,
            captain_id:     parsed.captain_id ?? null,
            tournament_id:  parsed.tournament_id ?? null,
            venue:          parsed.venue ?? null,
            notes:          parsed.notes ?? null,
            opponent_name:  parsed.opponent_name ?? null,
          }),
        })
        if (!res.ok) { const d = await res.json(); setExecError(d.error ?? 'Booking failed'); return }
        setOpen(false); reset()
        router.push('/admin?booked=1')
        router.refresh()
        return
      }

    } catch (err) {
      setExecError('Network error — try again')
    } finally {
      setExecuting(false)
    }
  }

  // ── Render: target booking match (for modify/cancel) ──────────────────────
  function TargetBookingRow({ bookingId }: { bookingId: string }) {
    const bk = upcomingBookings.find(b => b.id === bookingId)
    if (!bk) return <span className="text-zinc-500 text-xs">{bookingId.slice(0, 8)}…</span>
    return (
      <span className="font-rajdhani text-xs text-zinc-300">
        {fmtDate(bk.game_date)} · {slotLabel(bk.slot_time)} {bk.format ?? ''} {bk.captain_name ? `— ${bk.captain_name}` : ''}
      </span>
    )
  }

  // ── Parsed result card ────────────────────────────────────────────────────
  function ParsedCard() {
    if (!parsed) return null
    const actionStyle = ACTION_STYLE[parsed.action ?? ''] ?? 'bg-zinc-800 text-zinc-400 border-zinc-700'
    const hasErrors   = parsed.issues.filter(i => i.toLowerCase().includes('invalid') || i.toLowerCase().includes('error')).length > 0
    const isLowConf   = parsed.confidence === 'low'

    return (
      <div className="border border-ink-5 rounded-lg bg-ink-3 overflow-hidden mt-3 animate-in fade-in slide-in-from-top-1 duration-200">
        {/* Header */}
        <div className="flex items-center gap-3 px-4 py-3 border-b border-ink-5 bg-ink-4">
          <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full border text-xs font-rajdhani font-bold tracking-wide ${actionStyle}`}>
            {ACTION_ICON[parsed.action ?? '']} {(parsed.action ?? '').toUpperCase()}
          </span>
          <span className="font-rajdhani text-sm text-parchment flex-1">{parsed.summary}</span>
          <ConfidenceDot confidence={parsed.confidence} />
        </div>

        {/* Fields grid */}
        <div className="px-4 py-3 grid grid-cols-2 sm:grid-cols-3 gap-x-6 gap-y-2">
          {(parsed.action === 'modify' || parsed.action === 'cancel') && parsed.booking_id && (
            <div className="col-span-2 sm:col-span-3">
              <p className="font-rajdhani text-[10px] uppercase tracking-widest text-zinc-600 mb-0.5">Target Booking</p>
              <TargetBookingRow bookingId={parsed.booking_id} />
            </div>
          )}

          {parsed.game_date && (
            <Field label="Date" value={fmtDate(parsed.game_date)} />
          )}
          {parsed.slot_time && (
            <Field label="Slot" value={slotLabel(parsed.slot_time)} />
          )}
          {parsed.format && (
            <Field label="Format" value={parsed.format} />
          )}
          {parsed.captain_name && (
            <Field label="Captain" value={parsed.captain_name} />
          )}
          {parsed.tournament_name && (
            <Field label="Tournament" value={parsed.tournament_name} />
          )}
          {parsed.venue && (
            <Field label="Venue" value={parsed.venue} />
          )}
          {parsed.organiser_name && (
            <Field label="Organiser" value={parsed.organiser_name} />
          )}
          {parsed.opponent_name && (
            <Field label="Opponent" value={parsed.opponent_name} />
          )}
          {parsed.notes && (
            <Field label="Notes" value={parsed.notes} />
          )}
        </div>

        {/* Issues */}
        {parsed.issues.length > 0 && (
          <div className="px-4 pb-3">
            {parsed.issues.map((iss, i) => (
              <p key={i} className="font-rajdhani text-xs text-amber-400 flex items-start gap-1.5 mt-1">
                <span className="mt-0.5">⚠</span> {iss}
              </p>
            ))}
          </div>
        )}

        {/* Exec error */}
        {execError && (
          <div className="px-4 pb-3">
            <p className="font-rajdhani text-xs text-red-400 flex items-start gap-1.5">
              <span>✕</span> {execError}
            </p>
          </div>
        )}

        {/* Actions */}
        <div className="flex items-center gap-2 px-4 py-3 border-t border-ink-5 bg-ink-4">
          {isLowConf ? (
            <>
              <span className="font-rajdhani text-xs text-zinc-500 flex-1">
                Low confidence — open form with fields pre-filled instead?
              </span>
              <button
                onClick={() => { router.push(buildFormURL(parsed)); setOpen(false); reset() }}
                className="font-rajdhani text-xs font-bold bg-gold/10 border border-gold-dim text-gold px-3 py-1.5 rounded hover:bg-gold/20 transition-colors">
                Open Form →
              </button>
            </>
          ) : (
            <>
              <button
                onClick={() => { router.push(buildFormURL(parsed)); setOpen(false); reset() }}
                className="font-rajdhani text-xs text-zinc-500 hover:text-zinc-300 px-2 py-1.5 rounded border border-transparent hover:border-ink-5 transition-colors">
                Edit in form
              </button>
              <span className="flex-1" />
              {!hasErrors && (
                <button
                  onClick={handleExecute}
                  disabled={executing}
                  className={`font-rajdhani text-xs font-bold px-4 py-1.5 rounded transition-colors
                    ${parsed.action === 'cancel'
                      ? 'bg-crimson hover:bg-crimson-dark text-white'
                      : 'bg-gold hover:bg-gold/90 text-ink font-bold'
                    } disabled:opacity-50`}>
                  {executing ? 'Working…' : parsed.action === 'cancel' ? '✕ Confirm Cancel' : '✓ Confirm'}
                </button>
              )}
            </>
          )}
        </div>
      </div>
    )
  }

  // ── Trigger button (shown on dashboard) ───────────────────────────────────
  return (
    <>
      {/* Trigger pill */}
      <button
        onClick={() => setOpen(true)}
        className="group flex items-center gap-2.5 w-full bg-ink-3 hover:bg-ink-4 border border-ink-5 hover:border-gold-dim rounded-lg px-4 py-3 transition-all text-left">
        <span className="text-zinc-600 group-hover:text-gold transition-colors text-base">⌘</span>
        <span className="font-rajdhani text-sm text-zinc-500 group-hover:text-zinc-300 transition-colors flex-1">
          Quick command… <span className="text-zinc-700 italic">{EXAMPLES[hintIdx]}</span>
        </span>
        <kbd className="font-rajdhani text-[10px] text-zinc-700 border border-zinc-800 rounded px-1.5 py-0.5 hidden sm:inline">⌘K</kbd>
      </button>

      {/* Modal overlay */}
      {open && (
        <div
          className="fixed inset-0 z-50 flex items-start justify-center pt-[10vh] px-4"
          onClick={e => { if (e.target === e.currentTarget) { setOpen(false); reset() } }}>
          {/* Backdrop */}
          <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" />

          {/* Panel */}
          <div className="relative w-full max-w-xl bg-ink-2 border border-ink-5 rounded-xl shadow-2xl overflow-hidden animate-in fade-in slide-in-from-top-2 duration-200">
            {/* Input row */}
            <div className="flex items-start gap-3 p-4 border-b border-ink-5">
              <span className="text-gold text-lg mt-1 flex-shrink-0">⌘</span>
              <textarea
                ref={inputRef}
                value={text}
                onChange={e => { setText(e.target.value); setParsed(null); setParseError('') }}
                onKeyDown={handleKeyDown}
                placeholder={EXAMPLES[hintIdx]}
                rows={2}
                className="flex-1 bg-transparent font-rajdhani text-parchment text-sm placeholder:text-zinc-700 resize-none outline-none leading-relaxed"
              />
              <button
                onClick={handleParse}
                disabled={!text.trim() || parsing}
                className="flex-shrink-0 bg-gold hover:bg-gold/90 disabled:opacity-40 text-ink font-rajdhani text-xs font-bold px-3 py-1.5 rounded transition-colors">
                {parsing ? '…' : 'Parse'}
              </button>
            </div>

            {/* Hint row */}
            {!parsed && !parseError && !parsing && (
              <div className="px-4 py-2.5 flex flex-wrap gap-2">
                {EXAMPLES.map((ex, i) => (
                  <button
                    key={i}
                    onClick={() => setText(ex)}
                    className="font-rajdhani text-[11px] text-zinc-600 hover:text-zinc-300 bg-ink-4 hover:bg-ink-5 border border-ink-5 rounded px-2 py-0.5 transition-colors">
                    {ex}
                  </button>
                ))}
                <span className="font-rajdhani text-[10px] text-zinc-700 ml-auto self-center">⌃↵ to parse</span>
              </div>
            )}

            {/* Parse error */}
            {parseError && (
              <div className="px-4 py-2.5">
                <p className="font-rajdhani text-xs text-red-400">✕ {parseError}</p>
              </div>
            )}

            {/* Parsed card */}
            {parsed && (
              <div className="px-4 pb-4">
                <ParsedCard />
              </div>
            )}

            {/* Footer */}
            <div className="px-4 py-2 border-t border-ink-5 bg-ink-3 flex items-center justify-between">
              <span className="font-rajdhani text-[10px] text-zinc-700">
                Supports: book · reserve · modify · cancel
              </span>
              <button
                onClick={() => { setOpen(false); reset() }}
                className="font-rajdhani text-[10px] text-zinc-600 hover:text-zinc-400 transition-colors">
                ESC to close
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}

// ── Small field display ────────────────────────────────────────────────────────
function Field({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="font-rajdhani text-[10px] uppercase tracking-widest text-zinc-600 mb-0.5">{label}</p>
      <p className="font-rajdhani text-sm text-parchment">{value}</p>
    </div>
  )
}