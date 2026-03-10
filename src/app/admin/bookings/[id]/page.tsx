'use client'

import { useState, useEffect } from 'react'
import { useRouter, useParams } from 'next/navigation'
import type { Booking, Captain, Tournament, GameFormat, SlotTime } from '@/types'
import { SLOT_TIMES, SLOT_FORMATS } from '@/types'

export default function BookingDetailPage() {
  const router = useRouter()
  const { id } = useParams<{ id: string }>()

  const [booking,      setBooking]      = useState<Booking | null>(null)
  const [loading,      setLoading]      = useState(true)
  const [saving,       setSaving]       = useState(false)
  const [saveError,    setSaveError]    = useState('')
  const [saveSuccess,  setSaveSuccess]  = useState(false)

  // Editable fields
  const [captainId,     setCaptainId]     = useState('')
  const [tournamentId,  setTournamentId]  = useState('')
  const [format,        setFormat]        = useState<GameFormat | ''>('')
  const [slotTime,      setSlotTime]      = useState<SlotTime | ''>('')
  const [venue,         setVenue]         = useState('')
  const [matchId,       setMatchId]       = useState('')
  const [opponentName,  setOpponentName]  = useState('')
  const [cricheroes,    setCricheroes]    = useState('')
  const [notes,         setNotes]         = useState('')
  const [organiserName, setOrganiserName] = useState('')
  const [organiserPhone,setOrganiserPhone]= useState('')

  const [captains,    setCaptains]    = useState<Captain[]>([])
  const [tournaments, setTournaments] = useState<Tournament[]>([])

  useEffect(() => {
    fetch('/api/captains').then(r => r.json()).then(d => setCaptains(d.captains ?? []))
    fetch('/api/tournaments').then(r => r.json()).then(d => setTournaments(d.tournaments ?? []))
    fetch(`/api/bookings/${id}`)
      .then(r => r.json())
      .then(d => {
        const b: Booking = d.booking
        setBooking(b)
        setCaptainId(b.captain_id ?? '')
        setTournamentId(b.tournament_id ?? '')
        setFormat((b.format as GameFormat) ?? '')
        setSlotTime(b.slot_time)
        setVenue(b.venue ?? '')
        setMatchId(b.match_id ?? '')
        setOpponentName(b.opponent_name ?? '')
        setCricheroes(b.cricheroes_url ?? '')
        setNotes(b.notes ?? '')
        setOrganiserName(b.organiser_name ?? '')
        setOrganiserPhone(b.organiser_phone ?? '')
        setLoading(false)
      })
  }, [id])

  async function handleSave(extraFields?: Record<string, any>) {
    setSaving(true)
    setSaveError('')
    setSaveSuccess(false)
    const res = await fetch(`/api/bookings/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        captain_id:      captainId || null,
        tournament_id:   tournamentId || null,
        format:          format || null,
        slot_time:       slotTime,
        venue:           venue || null,
        match_id:        matchId || null,
        opponent_name:   opponentName || null,
        cricheroes_url:  cricheroes || null,
        notes:           notes || null,
        organiser_name:  organiserName || null,
        organiser_phone: organiserPhone || null,
        ...extraFields,
      }),
    })
    if (res.ok) {
      const d = await res.json()
      setBooking(d.booking)
      setSaveSuccess(true)
      setTimeout(() => setSaveSuccess(false), 3000)
    } else {
      const d = await res.json()
      setSaveError(d.error ?? 'Something went wrong.')
    }
    setSaving(false)
  }

  async function handleConfirm() {
    if (!captainId || !tournamentId || !format) {
      setSaveError('Captain, tournament and format are required to confirm a booking.')
      return
    }
    await handleSave({
      status:        'confirmed',
      reserved_until: null,
    })
  }

  async function handleCancel() {
    if (!confirm('Are you sure you want to cancel this booking?')) return
    const res = await fetch(`/api/bookings/${id}`, { method: 'DELETE' })
    if (res.ok) router.push('/admin')
  }

  function buildOrganiserWhatsApp() {
    if (!booking) return ''
    const phone = organiserPhone?.replace(/\D/g, '')
    if (!phone) return ''
    const date = booking.game_date
    const slot = booking.slot_time
    const msg = encodeURIComponent(
      `Hi! Your slot reservation for *${date} at ${slot}* has been confirmed with Spartans CC.\n\nPlease create the match in CricHeroes and share the Match ID with us.\n\nThanks!`
    )
    return `https://wa.me/${phone}?text=${msg}`
  }

  function buildCaptainWhatsApp() {
    if (!booking) return ''
    const waNumber = process.env.NEXT_PUBLIC_WA_NUMBER ?? ''
    const captain = captains.find(c => c.id === captainId)
    if (!captain) return ''
    const date = booking.game_date
    const slot = booking.slot_time
    const opponent = opponentName || 'TBD'
    const venue_str = venue || 'TBD'
    const msg = encodeURIComponent(
      `Hi ${captain.name}! You have been assigned as captain for a game on *${date} at ${slot}*.\n\nOpponent: ${opponent}\nVenue: ${venue_str}${cricheroes ? `\nCricHeroes: ${cricheroes}` : ''}\n\nPlease confirm your availability.`
    )
    return `https://wa.me/?text=${msg}`
  }

  if (loading) return (
    <div className="space-y-3 animate-pulse">
      {[0,1,2].map(i => <div key={i} className="h-16 bg-ink-3 rounded border border-ink-5" />)}
    </div>
  )

  if (!booking) return (
    <div className="text-center py-12 font-rajdhani text-zinc-500">Booking not found.</div>
  )

  const isReservation = booking.status === 'soft_block'
  const isConfirmed   = booking.status === 'confirmed'
  const captain       = captains.find(c => c.id === captainId)
  const tournament    = tournaments.find(t => t.id === tournamentId)
  const organiserWA   = buildOrganiserWhatsApp()
  const captainWA     = buildCaptainWhatsApp()

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="font-cinzel text-xl font-bold text-gold">
            {isReservation ? '🟡 Reservation' : '✓ Confirmed Booking'}
          </h1>
          <p className="font-rajdhani text-zinc-500 text-sm mt-1">
            {booking.game_date} · {booking.slot_time}
            {booking.format ? ` · ${booking.format}` : ''}
          </p>
        </div>
        <button onClick={() => router.push('/admin')}
          className="font-rajdhani text-xs text-zinc-500 hover:text-zinc-300 border border-ink-5 px-3 py-1.5 rounded transition-colors">
          ← Back
        </button>
      </div>

      {/* Reservation expiry warning */}
      {isReservation && booking.reserved_until && (
        <div className="bg-amber-950/40 border border-amber-800 rounded px-4 py-3 mb-5 font-rajdhani text-sm text-amber-300 flex items-center gap-3">
          <span className="text-xl">⏱</span>
          <span>This slot is reserved for <strong>{organiserName || 'organiser'}</strong>. 
          Expires <strong>{new Date(booking.reserved_until).toLocaleString('en-IN', { weekday: 'short', day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit', hour12: true })}</strong>.
          </span>
        </div>
      )}

      <div className="grid lg:grid-cols-[1fr_280px] gap-6">
        <div className="space-y-4">

          {/* Organiser details — reservation only */}
          {isReservation && (
            <FormCard title="Organiser Details">
              <div className="space-y-3">
                <div>
                  <label className="form-label">Organiser Name <span className="text-crimson">*</span></label>
                  <input type="text" value={organiserName} onChange={e => setOrganiserName(e.target.value)} className="form-input" />
                </div>
                <div>
                  <label className="form-label">WhatsApp Number</label>
                  <input type="tel" value={organiserPhone} onChange={e => setOrganiserPhone(e.target.value)} className="form-input" placeholder="e.g. 919876543210" />
                </div>
              </div>
            </FormCard>
          )}

          {/* Date & Format */}
          <FormCard title="Date & Format">
            <div className="grid sm:grid-cols-2 gap-4">
              <div>
                <label className="form-label">Game Date</label>
                <input type="text" value={booking.game_date} disabled className="form-input opacity-50 cursor-not-allowed" />
              </div>
              <div>
                <label className="form-label">Format</label>
                <div className="flex border border-ink-5 rounded overflow-hidden">
                  {(['T20', 'T30'] as GameFormat[]).map(f => (
                    <button key={f} onClick={() => setFormat(f)}
                      className={`flex-1 py-2.5 font-cinzel text-sm font-semibold transition-colors
                        ${format === f ? 'bg-gold-dim text-gold-light' : 'bg-ink-4 text-zinc-500 hover:text-zinc-300'}`}>
                      {f}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </FormCard>

          {/* Slot */}
          <FormCard title="Time Slot">
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              {SLOT_TIMES.map(t => (
                <button key={t} onClick={() => setSlotTime(t)}
                  className={`py-3 rounded border text-center transition-all
                    ${slotTime === t ? 'border-gold bg-gold/10 text-gold' : 'bg-ink-4 border-ink-5 text-parchment hover:border-gold-dim'}`}>
                  <p className="font-cinzel text-sm font-semibold">{t}</p>
                  <p className="font-rajdhani text-[10px] text-zinc-600 mt-0.5">{SLOT_FORMATS[t].join('/')}</p>
                </button>
              ))}
            </div>
          </FormCard>

          {/* Captain */}
          <FormCard title={isReservation ? 'Assign Captain (required to confirm)' : 'Captain'}>
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

          {/* Tournament */}
          <FormCard title={isReservation ? 'Tournament (required to confirm)' : 'Tournament'}>
            <select value={tournamentId} onChange={e => setTournamentId(e.target.value)} className="form-input">
              <option value="">Select tournament...</option>
              {tournaments.filter(t => t.active).map(t => (
                <option key={t.id} value={t.id}>{t.name}{t.organiser_name ? ` — ${t.organiser_name}` : ''}</option>
              ))}
            </select>
          </FormCard>

          {/* Match Details */}
          <FormCard title="Match Details">
            <div className="space-y-3">
              <div>
                <label className="form-label">Opponent Name</label>
                <input type="text" value={opponentName} onChange={e => setOpponentName(e.target.value)}
                  placeholder="e.g. Challengers CC" className="form-input" />
              </div>
              <div>
                <label className="form-label">Venue</label>
                <input type="text" value={venue} onChange={e => setVenue(e.target.value)}
                  placeholder="e.g. Stellar Cricket Ground, HSR Layout" className="form-input" />
              </div>
              <div>
                <label className="form-label">CricHeroes Match ID</label>
                <input type="text" value={matchId} onChange={e => setMatchId(e.target.value)}
                  placeholder="e.g. 12345678" className="form-input" />
                <p className="font-rajdhani text-xs text-zinc-600 mt-1">Enter after organiser creates match in CricHeroes</p>
              </div>
              <div>
                <label className="form-label">CricHeroes URL</label>
                <input type="text" value={cricheroes} onChange={e => setCricheroes(e.target.value)}
                  placeholder="e.g. https://cricheroes.in/match/12345678" className="form-input" />
              </div>
            </div>
          </FormCard>

          {/* Notes */}
          <FormCard title="Internal Notes">
            <textarea value={notes} onChange={e => setNotes(e.target.value)} rows={2}
              placeholder="Any notes for your reference..." className="form-input resize-none" />
          </FormCard>

          {saveError && (
            <div className="bg-red-950 border border-red-800 text-red-400 font-rajdhani text-sm px-4 py-3 rounded">
              {saveError}
            </div>
          )}
          {saveSuccess && (
            <div className="bg-emerald-950 border border-emerald-800 text-emerald-400 font-rajdhani text-sm px-4 py-3 rounded">
              ✓ Saved successfully.
            </div>
          )}

          <div className="flex gap-3 justify-between">
            <button onClick={handleCancel}
              className="font-rajdhani text-xs font-bold tracking-wide border border-red-900 text-red-500 hover:bg-red-950 px-4 py-2.5 rounded transition-colors">
              Cancel Booking
            </button>
            <div className="flex gap-3">
              <button onClick={() => handleSave()} disabled={saving}
                className="font-rajdhani text-sm font-bold tracking-widest uppercase border border-gold-dim text-gold hover:bg-gold/10 disabled:opacity-40 px-5 py-2.5 rounded transition-colors">
                {saving ? 'Saving...' : 'Save Changes'}
              </button>
              {isReservation && (
                <button onClick={handleConfirm} disabled={saving || !captainId || !tournamentId || !format}
                  className="font-rajdhani text-sm font-bold tracking-widest uppercase bg-crimson hover:bg-crimson-dark disabled:opacity-40 disabled:cursor-not-allowed text-white px-6 py-2.5 rounded transition-colors">
                  {saving ? 'Confirming...' : '✓ Confirm Booking'}
                </button>
              )}
            </div>
          </div>
        </div>

        {/* ── RIGHT PANEL ── */}
        <div className="space-y-4">

          {/* WhatsApp Notify buttons */}
          <div className="bg-ink-3 border border-ink-5 rounded overflow-hidden">
            <div className="bg-ink-4 px-4 py-3 border-b border-ink-5">
              <p className="font-cinzel text-sm text-gold">📲 Notify via WhatsApp</p>
            </div>
            <div className="p-4 space-y-3">
              {/* Organiser button */}
              {organiserWA ? (
                <a href={organiserWA} target="_blank" rel="noopener noreferrer"
                  className="flex items-center gap-2.5 w-full bg-[#25D366] hover:bg-[#1aaa52] text-white font-rajdhani font-bold text-sm tracking-wide px-4 py-3 rounded transition-colors">
                  <WAIcon /> Message Organiser
                </a>
              ) : (
                <div className="font-rajdhani text-xs text-zinc-600 bg-ink-4 border border-ink-5 rounded px-3 py-2.5">
                  Add organiser phone to enable WhatsApp notification
                </div>
              )}
              {/* Captain button */}
              {captainId ? (
                <a href={captainWA} target="_blank" rel="noopener noreferrer"
                  className="flex items-center gap-2.5 w-full bg-[#128C7E] hover:bg-[#0d7a6e] text-white font-rajdhani font-bold text-sm tracking-wide px-4 py-3 rounded transition-colors">
                  <WAIcon /> Message Captain ({captain?.name})
                </a>
              ) : (
                <div className="font-rajdhani text-xs text-zinc-600 bg-ink-4 border border-ink-5 rounded px-3 py-2.5">
                  Assign a captain to enable WhatsApp notification
                </div>
              )}
              <p className="font-rajdhani text-[10px] text-zinc-600 italic">
                Messages open pre-filled in WhatsApp for your review before sending.
              </p>
            </div>
          </div>

          {/* Booking summary */}
          <div className="bg-ink-3 border border-ink-5 rounded p-4">
            <p className="font-cinzel text-xs text-gold mb-3">Booking Summary</p>
            <div className="font-rajdhani text-sm text-zinc-400 space-y-1.5">
              <p>📅 {booking.game_date}</p>
              <p>🕐 {slotTime}{format ? ` — ${format}` : ''}</p>
              {captain    && <p>👤 {captain.name}</p>}
              {tournament && <p>🏆 {tournament.name}</p>}
              {venue      && <p>📍 {venue}</p>}
              {opponentName && <p>⚔️ vs {opponentName}</p>}
              {matchId    && <p>🏏 Match ID: {matchId}</p>}
              {cricheroes && (
                <a href={cricheroes} target="_blank" rel="noopener noreferrer"
                  className="flex items-center gap-1 text-gold hover:underline">
                  🔗 View on CricHeroes
                </a>
              )}
              {isReservation && organiserName && <p>🤝 {organiserName}</p>}
              {isReservation && organiserPhone && <p>📱 {organiserPhone}</p>}
            </div>
          </div>

          {/* Status badge */}
          <div className={`rounded px-4 py-3 border font-rajdhani text-sm font-bold text-center
            ${isConfirmed ? 'bg-emerald-950 border-emerald-800 text-emerald-400' : 'bg-amber-950 border-amber-800 text-amber-400'}`}>
            {isConfirmed ? '✓ Confirmed' : '🟡 Reserved — Pending Confirmation'}
          </div>
        </div>
      </div>
    </div>
  )
}

function FormCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="bg-ink-3 border border-ink-5 rounded p-5">
      <div className="flex items-center gap-3 mb-4 pb-3 border-b border-ink-5">
        <h3 className="font-cinzel text-sm text-gold font-semibold">{title}</h3>
      </div>
      {children}
    </div>
  )
}

function WAIcon() {
  return (
    <svg width={16} height={16} viewBox="0 0 24 24" fill="currentColor">
      <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/>
    </svg>
  )
}
