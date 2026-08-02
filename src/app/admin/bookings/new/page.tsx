'use client'

import { useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import type { Tournament, SlotTime, GameFormat, ValidationResult, RuleCheckItem } from '@/types'
import { RuleCheckStrip, ruleChecksAllPassed } from '@/components/admin/RuleCheckStrip'

type Ground = { id: string; name: string; maps_url: string; hospital_url: string }
type TournamentWithCaptain = Tournament & {
  captain_id: string | null
  captains: { id: string; name: string; players: { cricheroes_url: string | null } | null } | null
}
import { SLOT_TIMES, SLOT_FORMATS } from '@/types'

type BookingMode = 'confirmed' | 'reserved'

function defaultMatchTime(slot: SlotTime): string {
  return slot
}

const RULES: { rule: string; label: string }[] = [
  { rule: 'R1', label: 'Max 3 games per weekend' },
  { rule: 'R2', label: 'Captain leading another tournament this weekend' },
  { rule: 'R3', label: 'Max 2 games per tournament/month' },
  { rule: 'R4', label: 'Slot not already taken' },
  { rule: 'R5', label: 'No T20/T30 format clash' },
  { rule: 'R6', label: '12:30 game runs till evening' },
  { rule: 'R7', label: 'Knockout day priority' },
]

export default function NewBookingPage() {
  const router = useRouter()

  const [mode, setMode] = useState<BookingMode>('confirmed')

  // Shared fields
  const [gameDate,      setGameDate]      = useState('')
  const [slotTime,      setSlotTime]      = useState<SlotTime | ''>('')
  const [format,        setFormat]        = useState<GameFormat | ''>('')
  const [notes,         setNotes]         = useState('')

  // Confirmed-only fields
  const [tournamentId,  setTournamentId]  = useState('')
  const [venue,         setVenue]         = useState('')
  const [opponentName,  setOpponentName]  = useState('')
  const [matchId,       setMatchId]       = useState('')
  const [cricHeroesUrl, setCricHeroesUrl] = useState('')
  const [matchTime,     setMatchTime]     = useState('')
  const [matchTimeTouched, setMatchTimeTouched] = useState(false)

  // Reservation-only fields
  const [organiserName,  setOrganiserName]  = useState('')
  const [organiserPhone, setOrganiserPhone] = useState('')

  // Quick-add tournament
  const [showAddTournament,    setShowAddTournament]    = useState(false)
  const [newTournamentName,    setNewTournamentName]    = useState('')
  const [newTournamentOrg,     setNewTournamentOrg]     = useState('')
  const [newTournamentBall,    setNewTournamentBall]    = useState<'red' | 'white' | 'pink'>('red')
  const [newTournamentGround,  setNewTournamentGround]  = useState('')
  const [addingTournament,     setAddingTournament]     = useState(false)

  // Data
  const [tournaments,  setTournaments]  = useState<TournamentWithCaptain[]>([])
  const [grounds,      setGrounds]      = useState<Ground[]>([])

  // Validation
  const [ruleChecks,  setRuleChecks]  = useState<RuleCheckItem[]>(
    RULES.map(r => ({ ...r, status: 'pending', message: 'Waiting for input...' }))
  )
  // Admin-only: rule -> reason. Presence of a key = admin has overridden that rule.
  const [overrides,   setOverrides]   = useState<Record<string, string>>({})
  const [submitting,  setSubmitting]  = useState(false)
  const [submitError, setSubmitError] = useState('')

  const [matchStage, setMatchStage] = useState('')

  useEffect(() => {
    fetch('/api/tournaments').then(r => r.json()).then(d => setTournaments(d.tournaments ?? []))
    fetch('/api/grounds').then(r => r.json()).then(d => setGrounds(d.grounds ?? []))
  }, [])

  useEffect(() => {
    setGameDate(''); setSlotTime(''); setFormat(''); setNotes('')
    setTournamentId(''); setVenue('')
    setOpponentName(''); setMatchId(''); setCricHeroesUrl(''); setMatchTime(''); setMatchTimeTouched(false)
    setOrganiserName(''); setOrganiserPhone('')
    setShowAddTournament(false); setNewTournamentName(''); setNewTournamentOrg('')
    setNewTournamentBall('red'); setNewTournamentGround('')
    setSubmitError('')
    setRuleChecks(RULES.map(r => ({ ...r, status: 'pending', message: 'Waiting for input...' })))
    setOverrides({})
    setMatchStage('')
  }, [mode])

  useEffect(() => {
    if (!cricHeroesUrl) return
    try {
      const url = new URL(cricHeroesUrl)
      const parts = url.pathname.split('/').filter(Boolean)

      const idIndex = parts.indexOf('scorecard')
      if (idIndex !== -1 && parts[idIndex + 1]) {
        setMatchId(parts[idIndex + 1])
      }

      const matchSegment = parts[parts.length - 1]
      if (matchSegment?.includes('-vs-')) {
        const [teamA, teamB] = matchSegment.split('-vs-')
        const opponent = teamA.includes('spartans') ? teamB : teamA
        const formatted = opponent
          .split('-')
          .map(w => w.charAt(0).toUpperCase() + w.slice(1))
          .join(' ')
        setOpponentName(prev => prev || formatted)
      }

      const tournamentSlug = parts[2] ?? ''
      if (tournamentSlug) {
        const withoutParens = tournamentSlug.replace(/\([^)]*\)/g, '').trim().replace(/-+$/, '')
        const tournamentGuess = withoutParens
          .split('-')
          .map(w => w.charAt(0).toUpperCase() + w.slice(1))
          .join(' ')

        const lower = withoutParens.toLowerCase()
        const matched = tournaments.find(t =>
          t.name.toLowerCase().includes(lower.split('-').slice(0, 3).join(' ')) ||
          lower.includes(t.name.toLowerCase().replace(/\s+/g, '-'))
        )
        if (matched) {
          setTournamentId(prev => prev || matched.id)
        }
        if (!matched && tournamentGuess) {
          setNotes(prev => prev || `Tournament from URL: ${tournamentGuess}`)
        }
      }

      const tournamentSlugForFormat = parts[2] ?? ''
      const formatHint = tournamentSlugForFormat.match(/\((t20|t30)[^)]*\)/i)?.[1]?.toUpperCase()
      if (formatHint === 'T20' || formatHint === 'T30') {
        setFormat(prev => prev || formatHint)
      }
    } catch {
      // Invalid URL — ignore
    }
  }, [cricHeroesUrl, tournaments])

  const validate = useCallback(async () => {
    if (mode === 'reserved') {
      setRuleChecks(RULES.map(r => ({ ...r, status: 'pass', message: 'N/A for reservations' })))
      return
    }
    if (!gameDate || !format || !slotTime || !tournamentId) {
      setRuleChecks(RULES.map(r => ({ ...r, status: 'pending', message: 'Fill all fields to check.' })))
      return
    }
    const res = await fetch('/api/validate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ game_date: gameDate, format, slot_time: slotTime, tournament_id: tournamentId }),
    })
    const result: ValidationResult = await res.json()
    const errorMap   = Object.fromEntries(result.errors.map(e => [e.rule, e.message]))
    const warningMap = Object.fromEntries((result.warnings ?? []).map(e => [e.rule, e.message]))
    const next = RULES.map(r => ({
      ...r,
      status:  (errorMap[r.rule] ? 'fail' : warningMap[r.rule] ? 'warn' : 'pass') as RuleCheckItem['status'],
      message: errorMap[r.rule] ?? warningMap[r.rule] ?? '✓ Passed',
    }))
    setRuleChecks(next)
    // Drop any override reason for a rule that's no longer actually failing
    // (e.g. the admin fixed the date instead) — nothing to bypass anymore.
    const stillFailing = new Set(next.filter(r => r.status === 'fail').map(r => r.rule))
    setOverrides(prev => Object.fromEntries(Object.entries(prev).filter(([rule]) => stillFailing.has(rule))))
  }, [mode, gameDate, format, slotTime, tournamentId])

  useEffect(() => { validate() }, [validate])

  function handleOverrideToggle(rule: string) {
    setOverrides(prev => {
      if (rule in prev) {
        const { [rule]: _dropped, ...rest } = prev
        return rest
      }
      return { ...prev, [rule]: '' }
    })
  }

  function handleOverrideReasonChange(rule: string, reason: string) {
    setOverrides(prev => ({ ...prev, [rule]: reason }))
  }

  useEffect(() => {
    if (mode === 'confirmed' && slotTime && !matchTimeTouched) {
      setMatchTime(defaultMatchTime(slotTime))
    }
  }, [mode, slotTime, matchTimeTouched])

  const allPassed = ruleChecksAllPassed(ruleChecks, overrides)
  const availableSlots = format ? SLOT_TIMES.filter(t => SLOT_FORMATS[t].includes(format as GameFormat)) : SLOT_TIMES
  const reservationReady = mode === 'reserved' && gameDate && slotTime && organiserName.trim().length > 0

  async function handleAddTournament() {
    if (!newTournamentName.trim()) return
    setAddingTournament(true)
    const res = await fetch('/api/tournaments', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: newTournamentName.trim(),
        organiser_name: newTournamentOrg.trim() || null,
        ball_type: newTournamentBall,
        ground_id: newTournamentGround || null,
      }),
    })
    if (res.ok) {
      const d = await res.json()
      const created = d.tournament as TournamentWithCaptain
      setTournaments(prev => [...prev, created])
      setTournamentId(created.id)
      setShowAddTournament(false)
      setNewTournamentName('')
      setNewTournamentOrg('')
    }
    setAddingTournament(false)
  }

  async function handleSubmit() {
    if (mode === 'confirmed' && !allPassed) return
    if (mode === 'reserved' && !reservationReady) return

    setSubmitting(true)
    setSubmitError('')

    if (mode === 'confirmed') {
      const res = await fetch('/api/bookings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          game_date:      gameDate,
          format,
          slot_time:      slotTime,
          tournament_id:  tournamentId,
          venue:          venue || null,
          notes:          notes || null,
          opponent_name:  opponentName || null,
          match_id:       matchId || null,
          match_stage:    matchStage || null,
          cricheroes_url: cricHeroesUrl || null,
          match_time:     matchTime || null,
          overrides: Object.entries(overrides).map(([rule, reason]) => ({ rule, reason })),
        }),
      })
      if (res.ok) {
        router.push('/admin?booked=1')
      } else {
        const d = await res.json()
        setSubmitError(d.errors?.[0]?.message ?? d.error ?? 'Something went wrong.')
        setSubmitting(false)
      }
    } else {
      const reservedUntil = new Date(Date.now() + 48 * 60 * 60 * 1000).toISOString()
      const res = await fetch('/api/bookings/reserve', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          game_date:       gameDate,
          slot_time:       slotTime,
          organiser_name:  organiserName.trim(),
          organiser_phone: organiserPhone.trim() || null,
          reserved_until:  reservedUntil,
          notes:           notes || null,
        }),
      })
      if (res.ok) {
        router.push('/admin?reserved=1')
      } else {
        const d = await res.json()
        setSubmitError(d.error ?? 'Something went wrong.')
        setSubmitting(false)
      }
    }
  }

  const selectedTournament = tournaments.find(t => t.id === tournamentId)

  return (
    <div>
      <div className="mb-6">
        <h1 className="font-cinzel text-xl font-bold text-gold">New Booking</h1>
        <p className="font-rajdhani text-zinc-500 text-sm mt-1">Confirm a game or reserve a slot for an organiser.</p>
      </div>

      {/* Mode toggle */}
      <div className="flex border border-ink-5 rounded overflow-hidden mb-6 max-w-sm">
        {(['confirmed', 'reserved'] as BookingMode[]).map(m => (
          <button key={m} onClick={() => setMode(m)}
            className={`flex-1 py-2.5 font-cinzel text-sm font-semibold transition-colors
              ${mode === m ? 'bg-gold-dim text-gold-light' : 'bg-ink-4 text-zinc-500 hover:text-zinc-300'}`}>
            {m === 'confirmed' ? '✓ Confirm Booking' : '🟡 Reserve Slot'}
          </button>
        ))}
      </div>

      <div className="grid lg:grid-cols-[1fr_300px] gap-6">
        {/* Left: Form */}
        <div className="space-y-4">

          {/* Step 1: Date & Format */}
          <FormCard step={1} title={mode === 'reserved' ? 'Date & Slot' : 'Date & Format'}>
            <div className="grid sm:grid-cols-2 gap-4">
              <div>
                <label className="form-label">Game Date</label>
                <input type="date" value={gameDate} onChange={e => { setGameDate(e.target.value); setSlotTime('') }}
                  className="form-input" />
              </div>
              {mode === 'confirmed' && (
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
              )}
            </div>
          </FormCard>

          {/* Step 2: Slot */}
          <FormCard step={2} title="Time Slot">
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              {SLOT_TIMES.map(t => {
                const available = mode === 'reserved' ? true : availableSlots.includes(t)
                const disabled  = mode === 'confirmed' ? (!available || !format) : !gameDate
                return (
                  <button key={t} disabled={disabled} onClick={() => setSlotTime(t)}
                    className={`py-3 rounded border text-center transition-all
                      ${disabled ? 'opacity-30 cursor-not-allowed bg-ink-4 border-ink-5' :
                        slotTime === t ? 'border-gold bg-gold/10 text-gold' :
                        'bg-ink-4 border-ink-5 text-parchment hover:border-gold-dim'}`}>
                    <p className="font-cinzel text-sm font-semibold">{t}</p>
                    <p className="font-rajdhani text-[10px] text-zinc-600 mt-0.5">{SLOT_FORMATS[t].join('/')}</p>
                  </button>
                )
              })}
            </div>
            {mode === 'confirmed' && !format && (
              <p className="font-rajdhani text-xs text-zinc-600 mt-2 italic">Select a format first</p>
            )}
          </FormCard>

          {/* Reservation fields */}
          {mode === 'reserved' && (
            <FormCard step={3} title="Organiser Details">
              <div className="space-y-3">
                <div>
                  <label className="form-label">Organiser Name <span className="text-crimson">*</span></label>
                  <input type="text" value={organiserName} onChange={e => setOrganiserName(e.target.value)}
                    placeholder="e.g. Ravi Kumar" className="form-input" />
                </div>
                <div>
                  <label className="form-label">WhatsApp Number <span className="text-zinc-600">(optional)</span></label>
                  <input type="tel" value={organiserPhone} onChange={e => setOrganiserPhone(e.target.value)}
                    placeholder="e.g. 919876543210" className="form-input" />
                  <p className="font-rajdhani text-xs text-zinc-600 mt-1">Include country code. Used for 24hr expiry warning.</p>
                </div>
              </div>
            </FormCard>
          )}

          {/* Confirmed-only fields */}
          {mode === 'confirmed' && (
            <>
              {/* Step 3: Tournament (captain read-only from tournament) */}
              <FormCard step={3} title="Tournament">
                <select
                  value={tournamentId}
                  onChange={e => {
                    setTournamentId(e.target.value)
                    setShowAddTournament(false)
                  }}
                  className="form-input"
                >
                  <option value="">Select tournament...</option>
                  {tournaments.filter(t => t.active).map(t => (
                    <option key={t.id} value={t.id}>
                      {t.name}{t.organiser_name ? ` — ${t.organiser_name}` : ''}
                    </option>
                  ))}
                </select>

                {/* Captain — read-only, derived from tournament */}
                {tournamentId && (() => {
                  const t = selectedTournament
                  const captainName = t?.captains?.name
                  const captainUrl  = t?.captains?.players?.cricheroes_url
                  return (
                    <div className="mt-3 p-3 rounded bg-ink-4 border border-ink-5">
                      <p className="font-rajdhani text-[10px] font-bold tracking-[2px] uppercase text-zinc-600 mb-1">
                        Captain
                      </p>
                      {captainName ? (
                        captainUrl ? (
                          <a href={captainUrl} target="_blank" rel="noopener noreferrer"
                             className="font-rajdhani font-semibold text-sm text-parchment hover:text-gold underline underline-offset-2 transition-colors">
                            {captainName}
                          </a>
                        ) : (
                          <span className="font-rajdhani font-semibold text-sm text-parchment">{captainName}</span>
                        )
                      ) : (
                        <span className="font-rajdhani text-xs text-amber-400">
                          No captain set on this tournament — go to Tournaments to add one.
                        </span>
                      )}
                    </div>
                  )
                })()}

                <button onClick={() => setShowAddTournament(v => !v)}
                  className="mt-2 font-rajdhani text-xs text-gold-dim hover:text-gold transition-colors flex items-center gap-1">
                  {showAddTournament ? '✕ Cancel' : '＋ Add new tournament'}
                </button>
                {showAddTournament && (
                  <div className="mt-3 border border-ink-5 rounded p-3 space-y-2 bg-ink-4">
                    <div>
                      <label className="form-label">Tournament Name <span className="text-crimson">*</span></label>
                      <input type="text" value={newTournamentName} onChange={e => setNewTournamentName(e.target.value)}
                        placeholder="e.g. Lakeview RCG Edition 11" className="form-input" />
                    </div>
                    <div>
                      <label className="form-label">Organiser Name <span className="text-zinc-600">(optional)</span></label>
                      <input type="text" value={newTournamentOrg} onChange={e => setNewTournamentOrg(e.target.value)}
                        placeholder="e.g. Ravi Kumar" className="form-input" />
                    </div>
                    <div>
                      <label className="form-label">Ball Type</label>
                      <div className="flex gap-2">
                        {(['red', 'white', 'pink'] as const).map(b => (
                          <button key={b} onClick={() => setNewTournamentBall(b)}
                            className={`flex-1 py-2 rounded border font-rajdhani text-xs font-bold uppercase tracking-wide transition-colors
                              ${newTournamentBall === b ? 'border-gold bg-gold/10 text-gold' : 'border-ink-5 bg-ink-3 text-zinc-500 hover:border-gold-dim'}`}>
                            {b === 'red' ? '🔴' : b === 'white' ? '⚪' : '🩷'} {b}
                          </button>
                        ))}
                      </div>
                      <p className="font-rajdhani text-xs text-zinc-600 mt-1">
                        {newTournamentBall === 'white' ? 'White ball → Gold jersey' : 'Red/Pink ball → White jersey'}
                      </p>
                    </div>
                    <div>
                      <label className="form-label">Ground <span className="text-zinc-600">(optional)</span></label>
                      <select value={newTournamentGround} onChange={e => setNewTournamentGround(e.target.value)}
                        className="form-input">
                        <option value="">Select ground...</option>
                        {grounds.map(g => (
                          <option key={g.id} value={g.id}>{g.name}</option>
                        ))}
                      </select>
                    </div>
                    <p className="font-rajdhani text-xs text-zinc-500">
                      Captain can be assigned after creation via the Tournaments page.
                    </p>
                    <button onClick={handleAddTournament}
                      disabled={!newTournamentName.trim() || addingTournament}
                      className="font-rajdhani text-xs font-bold tracking-wide bg-crimson hover:bg-crimson-dark disabled:opacity-40 text-white px-4 py-2 rounded transition-colors">
                      {addingTournament ? 'Adding...' : '＋ Add Tournament'}
                    </button>
                  </div>
                )}
              </FormCard>

              <FormCard step={4} title="Venue & Notes (optional)">
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

              {tournamentId && (
                <FormCard step={5} title="Match Details (optional)">
                  <div className="space-y-3">
                    <div>
                      <label className="form-label">Opponent Name</label>
                      <input type="text" value={opponentName} onChange={e => setOpponentName(e.target.value)}
                        placeholder="e.g. Challengers CC" className="form-input" />
                    </div>
                    <div>
                      <label className="form-label">CricHeroes Match URL</label>
                      <input type="text" value={cricHeroesUrl} onChange={e => setCricHeroesUrl(e.target.value)}
                        placeholder="e.g. https://cricheroes.in/match/12345678" className="form-input" />
                    </div>
                    <div>
                      <label className="form-label">Match ID</label>
                      <input type="text" value={matchId} onChange={e => setMatchId(e.target.value)}
                        placeholder="e.g. 12345678" className="form-input" />
                      <p className="font-rajdhani text-xs text-zinc-600 mt-1">Can be added later once organiser creates the match in CricHeroes.</p>
                    </div>
                  </div>
                  <div>
                    <label className="form-label">Match Stage <span className="text-zinc-600">(optional)</span></label>
                    <input type="text" value={matchStage} onChange={e => setMatchStage(e.target.value)}
                      placeholder="e.g. Quarter Final, Semi Final, Final, Knockout" className="form-input" />
                  </div>
                  <div>
                    <label className="form-label">Match Start Time</label>
                    <input type="time" value={matchTime}
                      onChange={e => { setMatchTime(e.target.value); setMatchTimeTouched(true) }}
                      className="form-input" />
                    <p className="font-rajdhani text-xs text-zinc-600 mt-1">
                      Defaults to 15 min after slot time — edit if the organiser confirms a different start time.
                    </p>
                  </div>
                </FormCard>
              )}
            </>
          )}

          {mode === 'reserved' && (
            <FormCard step={4} title="Internal Notes (optional)">
              <textarea value={notes} onChange={e => setNotes(e.target.value)} rows={2}
                placeholder="Any notes for your reference..." className="form-input resize-none" />
            </FormCard>
          )}

          {mode === 'reserved' && (
            <div className="bg-amber-950/30 border border-amber-800/40 rounded p-4 font-rajdhani text-sm text-amber-300 space-y-1">
              <p className="font-bold">🟡 How reservations work</p>
              <p>The slot will be marked as Reserved on the public schedule with a countdown.</p>
              <p>A 24-hour warning will be sent to the organiser if a phone number is provided.</p>
              <p>If not confirmed within <strong>48 hours</strong>, the reservation is automatically released.</p>
            </div>
          )}

          {submitError && (
            <div className="bg-red-950 border border-red-800 text-red-400 font-rajdhani text-sm px-4 py-3 rounded">
              {submitError}
            </div>
          )}

          {/* Live Rule Check — horizontal, directly above the confirm button */}
          {mode === 'confirmed' ? (
            <RuleCheckStrip checks={ruleChecks} overrides={overrides} onToggle={handleOverrideToggle} onReasonChange={handleOverrideReasonChange} />
          ) : (
            <p className="font-rajdhani text-xs text-zinc-600">Rule checks are skipped for reservations. Only date and slot are required.</p>
          )}

          <div className="flex gap-3 justify-end">
            <button onClick={() => router.push('/admin')}
              className="font-rajdhani text-sm font-bold tracking-wide border border-ink-5 text-zinc-500 hover:text-zinc-300 px-5 py-2.5 rounded transition-colors">
              Cancel
            </button>
            <button onClick={handleSubmit}
              disabled={mode === 'confirmed' ? (!allPassed || submitting) : (!reservationReady || submitting)}
              className={`font-rajdhani text-sm font-bold tracking-widest uppercase disabled:opacity-40 disabled:cursor-not-allowed text-white px-6 py-2.5 rounded transition-colors
                ${mode === 'confirmed' ? 'bg-crimson hover:bg-crimson-dark' : 'bg-amber-700 hover:bg-amber-600'}`}>
              {submitting ? 'Saving...' : mode === 'confirmed' ? '✓ Confirm Booking' : '🟡 Reserve Slot'}
            </button>
          </div>
        </div>

        {/* Right: Summary panel */}
        <div>
          {gameDate && slotTime && (
            <div className="bg-ink-3 border border-ink-5 rounded p-4">
              <p className="font-cinzel text-xs text-gold mb-3">
                {mode === 'confirmed' ? 'Booking Summary' : 'Reservation Summary'}
              </p>
              <div className="font-rajdhani text-sm text-zinc-400 space-y-1.5 leading-relaxed">
                {gameDate      && <p>📅 {gameDate}</p>}
                {slotTime  && <p>🕐 Slot: {slotTime}{format ? ` — ${format}` : ''}</p>}
                {matchTime && <p>⏰ Match starts: {matchTime}</p>}
                {mode === 'confirmed' && selectedTournament?.captains?.name && <p>👤 {selectedTournament.captains.name}</p>}
                {mode === 'confirmed' && tournamentId && <p>🏆 {selectedTournament?.name}</p>}
                {mode === 'confirmed' && venue        && <p>📍 {venue}</p>}
                {mode === 'confirmed' && opponentName && <p>⚔️ vs {opponentName}</p>}
                {mode === 'confirmed' && cricHeroesUrl && (
                  <a href={cricHeroesUrl} target="_blank" rel="noopener noreferrer" className="text-gold hover:underline flex items-center gap-1">
                    🔗 CricHeroes
                  </a>
                )}
                {mode === 'reserved' && organiserName  && <p>🤝 {organiserName}</p>}
                {mode === 'reserved' && organiserPhone && <p>📱 {organiserPhone}</p>}
                {mode === 'reserved' && <p className="text-amber-400">⏱ Expires in 48 hours</p>}
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
