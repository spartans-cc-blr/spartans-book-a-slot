'use client'

import { useState, useEffect, useCallback } from 'react'
import { useRouter, useParams } from 'next/navigation'
import type { Booking, GameFormat, SlotTime, RuleCheckItem } from '@/types'
import { SLOT_TIMES, SLOT_FORMATS } from '@/types'
import { ScorecardTables } from '@/components/matches/ScorecardTables'
import { RuleCheckStrip, ruleChecksAllPassed } from '@/components/admin/RuleCheckStrip'

type ScorecardUploadStatus = 'pending_parse' | 'parsed' | 'synced' | 'fees_applied'

const UPLOAD_STATUS_CONFIG: Record<ScorecardUploadStatus, { label: string; className: string }> = {
  pending_parse: { label: 'Pending Parse',       className: 'bg-ink-4 border-ink-5 text-zinc-400' },
  parsed:        { label: 'Parsed',              className: 'bg-amber-950/40 border-amber-800 text-amber-400' },
  synced:        { label: 'Synced ✓',            className: 'bg-emerald-950/40 border-emerald-800 text-emerald-400' },
  fees_applied:  { label: 'Fees Applied ✓',      className: 'bg-emerald-950/40 border-emerald-800 text-emerald-400' },
}

interface PostMatchUpload {
  status:           ScorecardUploadStatus
  uploaded_at:      string | null
  uploaded_by_name: string | null
  error_message:    string | null
  fees_applied_at:  string | null
}

interface PostMatchStats {
  match_result:     string | null
  team_total:       number | null
  team_wickets:     number | null
  team_overs:       number | null
  opponent_total:   number | null
  opponent_wickets: number | null
  opponent_overs:   number | null
}

interface PostMatchData {
  upload: PostMatchUpload | null
  stats:  PostMatchStats | null
}

interface FeePreview {
  base_fee:         number
  non_exempt_count: number
  fee_per_player:   number
  total_squad:      number
}

type TournamentWithCaptain = {
  id: string
  name: string
  organiser_name: string | null
  active: boolean
  captain_id: string | null
  captains: {
    id: string
    name: string
    players: { cricheroes_url: string | null; whatsapp: string | null } | null
  } | null
}

const RULES = [
  { rule: 'R1', label: 'Weekend capacity (max 3)' },
  { rule: 'R2', label: 'Captain leading another tournament this weekend' },
  { rule: 'R3', label: 'Tournament monthly limit' },
  { rule: 'R4', label: 'Slot not already taken' },
  { rule: 'R5', label: 'Format/time clash' },
  { rule: 'R6', label: '12:30 overlap' },
]

function defaultMatchTime(slot: SlotTime): string {
  return slot
}

export default function BookingDetailPage() {
  const router = useRouter()
  const { id } = useParams<{ id: string }>()

  const [booking,      setBooking]      = useState<Booking | null>(null)
  const [loading,      setLoading]      = useState(true)
  const [saving,       setSaving]       = useState(false)
  const [saveError,    setSaveError]    = useState('')
  const [saveSuccess,  setSaveSuccess]  = useState(false)

  const [ruleChecks, setRuleChecks] = useState<RuleCheckItem[]>(
    RULES.map(r => ({ ...r, status: 'pending', message: 'Waiting for input...' }))
  )
  // Admin-only: rule -> reason. Presence of a key = admin has overridden that rule.
  const [overrides, setOverrides] = useState<Record<string, string>>({})
  // Snapshot of the most recent reason already logged per rule (from
  // booking_rule_overrides, fetched on load). Used only to avoid re-logging
  // an identical override on every unrelated "Save Changes" click.
  const [loggedOverrides, setLoggedOverrides] = useState<Record<string, string>>({})

  // Editable fields
  const [tournamentId,  setTournamentId]  = useState('')
  const [format,        setFormat]        = useState<GameFormat | ''>('')
  const [slotTime,      setSlotTime]      = useState<SlotTime | ''>('')
  const [venue,         setVenue]         = useState('')
  const [matchId,       setMatchId]       = useState('')
  const [matchTime,     setMatchTime]     = useState('')
  const [matchTimeTouched, setMatchTimeTouched] = useState(false)
  const [opponentName,  setOpponentName]  = useState('')
  const [cricheroes,    setCricheroes]    = useState('')
  const [notes,         setNotes]         = useState('')
  const [organiserName, setOrganiserName] = useState('')
  const [organiserPhone,setOrganiserPhone]= useState('')

  const [tournaments,  setTournaments]  = useState<TournamentWithCaptain[]>([])

  const [matchStage,        setMatchStage]        = useState('')
  const [gameDate,          setGameDate]           = useState('')
  const [matchFeeOverride,  setMatchFeeOverride]   = useState<string>('')

  // ── Post-match: scorecard upload status, stats sync, fee application ──
  const [postMatch,        setPostMatch]        = useState<PostMatchData | null>(null)
  const [postMatchLoading, setPostMatchLoading] = useState(false)
  const [syncLoading,      setSyncLoading]       = useState(false)
  const [syncError,        setSyncError]         = useState('')
  const [feePreview,       setFeePreview]        = useState<FeePreview | null>(null)
  const [feeLoading,       setFeeLoading]        = useState(false)
  const [feeError,         setFeeError]          = useState('')
  const [feeConfirming,    setFeeConfirming]     = useState(false)
  const [scorecardOpen,    setScorecardOpen]     = useState(false)
  const [scorecard,        setScorecard]         = useState<{ batting: any[]; bowling: any[]; team_list?: any[] } | null>(null)
  const [scorecardSquad,   setScorecardSquad]    = useState<{ player_id: string; player_name: string; cricheroes_url: string | null }[] | undefined>(undefined)
  const [scorecardLoading, setScorecardLoading]  = useState(false)
  const [scorecardError,   setScorecardError]    = useState('')
  const [resetLoading,     setResetLoading]      = useState(false)
  const [resetError,       setResetError]        = useState('')

  useEffect(() => {
    fetch('/api/tournaments').then(r => r.json()).then(d => setTournaments(d.tournaments ?? []))
    fetch(`/api/bookings/${id}`)
      .then(r => r.json())
      .then(d => {
        const b: Booking = d.booking
        setBooking(b)
        setTournamentId(b.tournament_id ?? '')
        setFormat((b.format as GameFormat) ?? '')
        setSlotTime(b.slot_time)
        setVenue(b.venue ?? '')
        setMatchId(b.match_id ?? '')
        setMatchTime(b.match_time ?? defaultMatchTime(b.slot_time))
        setMatchTimeTouched(b.match_time != null)
        setOpponentName(b.opponent_name ?? '')
        setCricheroes(b.cricheroes_url ?? '')
        setNotes(b.notes ?? '')
        setOrganiserName(b.organiser_name ?? '')
        setOrganiserPhone(b.organiser_phone ?? '')
        setGameDate(b.game_date ?? '')
        setMatchStage(b.match_stage ?? '')
        setMatchFeeOverride((b as any).match_fee_override != null ? String((b as any).match_fee_override) : '')
        // Pre-fill any previously-logged override reason (booking_rule_overrides).
        // The rule-check effect below prunes any entry that isn't actually
        // failing anymore, so a resolved conflict won't leave a stale reason box.
        setOverrides(d.overrides ?? {})
        setLoggedOverrides(d.overrides ?? {})
        setLoading(false)
      })
  }, [id])

  useEffect(() => {
    if (slotTime && !matchTimeTouched) {
      setMatchTime(defaultMatchTime(slotTime))
    }
  }, [slotTime, matchTimeTouched])

  const today = new Date().toISOString().split('T')[0]
  const isPostMatchEligible = !!booking && booking.status === 'confirmed' && booking.game_date < today

  function refreshPostMatch() {
    setPostMatchLoading(true)
    return fetch(`/api/admin/matches/${id}/post-match`)
      .then(r => r.json())
      .then(d => { if (!d.error) setPostMatch(d); return d })
      .finally(() => setPostMatchLoading(false))
  }

  useEffect(() => {
    if (!isPostMatchEligible) return
    refreshPostMatch()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isPostMatchEligible, id])

  useEffect(() => {
    if (!postMatch?.upload || !['synced', 'fees_applied'].includes(postMatch.upload.status)) return
    setFeeLoading(true)
    setFeeError('')
    fetch('/api/fees/apply', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ booking_id: id, confirm: false }),
    })
      .then(res => res.json().then(data => ({ ok: res.ok, data })))
      .then(({ ok, data }) => {
        if (!ok) { setFeeError(data.error ?? 'Could not compute fee preview'); return }
        setFeePreview(data)
      })
      .catch(() => setFeeError('Network error'))
      .finally(() => setFeeLoading(false))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [postMatch?.upload?.status, id])

  useEffect(() => {
    if (!scorecardOpen || scorecard || scorecardLoading) return
    setScorecardLoading(true)
    setScorecardError('')
    Promise.all([
      fetch(`/api/matches/history/${id}/scorecard`).then(res => res.json().then(data => ({ ok: res.ok, data }))),
      fetch(`/api/matches/history/${id}`).then(res => res.json()).catch(() => null),
    ])
      .then(([sc, hist]) => {
        if (!sc.ok) { setScorecardError(sc.data.error ?? 'Failed to load scorecard'); return }
        setScorecard(sc.data)
        setScorecardSquad(hist?.squad ?? undefined)
      })
      .catch(() => setScorecardError('Network error'))
      .finally(() => setScorecardLoading(false))
  }, [scorecardOpen, scorecard, scorecardLoading, id])

  async function handleSyncStats() {
    setSyncLoading(true)
    setSyncError('')
    try {
      const res = await fetch('/api/admin/sync-match-stats', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ booking_id: id }),
      })
      const data = await res.json()
      if (!res.ok) { setSyncError(data.error ?? 'Sync failed'); return }
      await refreshPostMatch()
    } catch {
      setSyncError('Network error')
    } finally {
      setSyncLoading(false)
    }
  }

  async function handleApplyFees() {
    if (!feePreview) return
    if (!confirm(`This will debit ₹${feePreview.fee_per_player} from ${feePreview.non_exempt_count} wallets. Continue?`)) return
    setFeeConfirming(true)
    setFeeError('')
    try {
      const res = await fetch('/api/fees/apply', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ booking_id: id, confirm: true }),
      })
      const data = await res.json()
      if (!res.ok) { setFeeError(data.error ?? 'Failed to apply fees'); return }
      await refreshPostMatch()
    } catch {
      setFeeError('Network error')
    } finally {
      setFeeConfirming(false)
    }
  }

  async function handleResetUpload() {
    if (!postMatch?.upload) return
    const feesWarning = postMatch.upload.status === 'fees_applied'
      ? '\n\n⚠ Fees have already been applied for this match — resetting the upload does NOT reverse any wallet debits.'
      : ''
    if (!confirm(`This clears the scorecard upload record for this booking so it can be re-uploaded from scratch.${feesWarning}\n\nContinue?`)) return
    setResetLoading(true)
    setResetError('')
    try {
      const res = await fetch(`/api/admin/matches/${id}/post-match`, { method: 'DELETE' })
      const data = await res.json()
      if (!res.ok) { setResetError(data.error ?? 'Reset failed'); return }
      setFeePreview(null)
      setScorecard(null)
      setScorecardOpen(false)
      await refreshPostMatch()
    } catch {
      setResetError('Network error')
    } finally {
      setResetLoading(false)
    }
  }

  useEffect(() => {
    if (!cricheroes) return
    try {
      const url  = new URL(cricheroes)
      const parts = url.pathname.split('/').filter(Boolean)

      const scoreIdx = parts.indexOf('scorecard')
      if (scoreIdx !== -1 && parts[scoreIdx + 1]) {
        setMatchId(parts[scoreIdx + 1])
      } else {
        const numeric = parts.filter(p => /^\d+$/.test(p))
        if (numeric.length) setMatchId(numeric[numeric.length - 1])
      }

      const slug = parts[parts.length - 1] ?? ''
      if (slug.includes('-vs-')) {
        const [teamA, teamB] = slug.split('-vs-')
        const opponent = teamA.toLowerCase().includes('spartan') ? teamB : teamA
        const formatted = opponent.split('-')
          .map(w => w.charAt(0).toUpperCase() + w.slice(1))
          .join(' ')
        setOpponentName(formatted)
      }
    } catch { /* invalid URL — ignore */ }
  }, [cricheroes])

  const validate = useCallback(async () => {
    if (!gameDate || !format || !slotTime || !tournamentId) {
      setRuleChecks(RULES.map(r => ({ ...r, status: 'pending' as const, message: 'Fill all fields to check.' })))
      return
    }
    const res = await fetch('/api/validate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        game_date:     gameDate,
        format,
        slot_time:     slotTime,
        tournament_id: tournamentId,
        exclude_id:    id,
      }),
    })
    const result = await res.json()
    const errorMap   = Object.fromEntries(result.errors?.map((e: any) => [e.rule, e.message]) ?? [])
    const warningMap = Object.fromEntries(result.warnings?.map((e: any) => [e.rule, e.message]) ?? [])
    const next: RuleCheckItem[] = RULES.map(r => ({
      ...r,
      status:  (errorMap[r.rule] ? 'fail' : warningMap[r.rule] ? 'warn' : 'pass') as RuleCheckItem['status'],
      message: errorMap[r.rule] ?? warningMap[r.rule] ?? '✓ Passed',
    }))
    setRuleChecks(next)
    // Drop any override reason for a rule that's no longer actually failing.
    const stillFailing = new Set(next.filter(r => r.status === 'fail').map(r => r.rule))
    setOverrides(prev => Object.fromEntries(Object.entries(prev).filter(([rule]) => stillFailing.has(rule))))
  }, [gameDate, format, slotTime, tournamentId, id])

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

  const allPassed = ruleChecksAllPassed(ruleChecks, overrides)

  async function handleSave(extraFields?: Record<string, any>) {
    setSaving(true)
    setSaveError('')
    setSaveSuccess(false)
    // Only log a rule as overridden if it's new or the reason actually
    // changed since last logged — otherwise every unrelated "Save Changes"
    // click would re-log an identical row for a rule the admin already
    // explained on a previous save.
    const overridesToLog = Object.entries(overrides).filter(([rule, reason]) => loggedOverrides[rule] !== reason)
    const res = await fetch(`/api/bookings/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        game_date:       gameDate,
        tournament_id:   tournamentId || null,
        format:          format || null,
        slot_time:       slotTime,
        venue:           venue || null,
        match_id:        tournamentId ? (matchId || null) : null,
        match_stage:     matchStage || null,
        match_time:      matchTime || null,
        opponent_name:   tournamentId ? (opponentName || null) : null,
        cricheroes_url:  tournamentId ? (cricheroes || null) : null,
        notes:           notes || null,
        organiser_name:  organiserName || null,
        organiser_phone: organiserPhone || null,
        match_fee_override: matchFeeOverride ? parseInt(matchFeeOverride) : null,
        overrides: overridesToLog.map(([rule, reason]) => ({
          rule,
          reason,
          message: ruleChecks.find(r => r.rule === rule)?.message,
        })),
        ...extraFields,
      }),
    })
    if (res.ok) {
      if (overridesToLog.length > 0) {
        setLoggedOverrides(prev => ({ ...prev, ...Object.fromEntries(overridesToLog) }))
      }
      setSaveSuccess(true)
      setTimeout(() => router.push('/admin?saved=1'), 1500)
    } else {
      const d = await res.json()
      setSaveError(d.error ?? 'Something went wrong.')
    }
    setSaving(false)
  }

  async function handleConfirm() {
    if (!tournamentId || !format) {
      setSaveError('Tournament and format are required to confirm a booking.')
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
    if (!booking || !selectedTournament?.captains) return ''
    const captain = selectedTournament.captains
    const phone = captain.players?.whatsapp?.replace(/\D/g, '') ?? ''
    const date = booking.game_date
    const slot = booking.slot_time
    const opponent = opponentName || 'TBD'
    const venue_str = venue || 'TBD'
    const msg = encodeURIComponent(
      `Hi ${captain.name}! You have been assigned as captain for a game on *${date} at ${slot}*.\n\nOpponent: ${opponent}\nVenue: ${venue_str}${cricheroes ? `\nCricHeroes: ${cricheroes}` : ''}\n\nPlease confirm your availability.`
    )
    return phone ? `https://wa.me/${phone}?text=${msg}` : `https://wa.me/?text=${msg}`
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
  const selectedTournament = tournaments.find(t => t.id === tournamentId)
  const organiserWA   = buildOrganiserWhatsApp()
  const captainWA     = buildCaptainWhatsApp()
  const captainName   = selectedTournament?.captains?.name

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
                <input type="date" value={gameDate} onChange={e => setGameDate(e.target.value)} className="form-input" />
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

          {/* Tournament (captain read-only from tournament) */}
          <FormCard title={isReservation ? 'Tournament (required to confirm)' : 'Tournament'}>
            <select value={tournamentId} onChange={e => setTournamentId(e.target.value)} className="form-input">
              <option value="">Select tournament...</option>
              {tournaments.filter(t => t.active).map(t => (
                <option key={t.id} value={t.id}>{t.name}{t.organiser_name ? ` — ${t.organiser_name}` : ''}</option>
              ))}
            </select>

            {/* Captain — read-only, derived from tournament */}
            {tournamentId && (() => {
              const captainUrl = selectedTournament?.captains?.players?.cricheroes_url
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
          </FormCard>

          {/* Venue & Notes */}
          <FormCard title="Venue & Notes">
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

          {/* Match Details — only visible when a tournament is selected */}
          {tournamentId && (
            <FormCard title="Match Details">
              <div className="space-y-3">
                <div>
                  <label className="form-label">Opponent Name</label>
                  <input type="text" value={opponentName} onChange={e => setOpponentName(e.target.value)}
                    placeholder="e.g. Challengers CC" className="form-input" />
                </div>
                <div>
                  <label className="form-label">CricHeroes Match ID</label>
                  <input type="text" value={matchId} onChange={e => setMatchId(e.target.value)}
                    placeholder="e.g. 12345678" className="form-input" />
                  <p className="font-rajdhani text-xs text-zinc-600 mt-1">Enter after organiser creates match in CricHeroes</p>
                </div>
                <div>
                  <label className="form-label">Match Stage <span className="text-zinc-600">(optional)</span></label>
                  <input type="text" value={matchStage} onChange={e => setMatchStage(e.target.value)}
                    placeholder="e.g. Quarter Final, Semi Final, Final, Knockout" className="form-input" />
                </div>
                <div>
                  <label className="form-label">CricHeroes URL</label>
                  <input type="text" value={cricheroes} onChange={e => setCricheroes(e.target.value)}
                    placeholder="e.g. https://cricheroes.in/match/12345678" className="form-input" />
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
                <div>
                  <label className="form-label">Fee Override (₹ total)</label>
                  <input
                    type="number" min="0"
                    value={matchFeeOverride}
                    onChange={e => setMatchFeeOverride(e.target.value)}
                    placeholder="Leave blank to use tournament default"
                    className="form-input w-32"
                  />
                  <p className="font-rajdhani text-xs text-zinc-600 mt-1">
                    {matchFeeOverride
                      ? `Override active: ₹${matchFeeOverride}`
                      : (booking.tournament as any)?.match_fee
                        ? `Using tournament default: ₹${(booking.tournament as any).match_fee}`
                        : 'No fee configured on tournament'}
                  </p>
                </div>
              </div>
            </FormCard>
          )}

          {/* Post-match — scorecard upload status, stats sync, fee application */}
          {isPostMatchEligible && (
            <FormCard title="Post-Match">
              <div className="space-y-4">
                {postMatchLoading && !postMatch && (
                  <p className="font-rajdhani text-xs text-zinc-600">Loading…</p>
                )}

                {postMatch?.upload ? (
                  <div className="space-y-2">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className={`font-rajdhani text-[11px] font-bold tracking-wide px-2.5 py-1 rounded border ${UPLOAD_STATUS_CONFIG[postMatch.upload.status].className}`}>
                        {UPLOAD_STATUS_CONFIG[postMatch.upload.status].label}
                      </span>
                      {postMatch.upload.uploaded_by_name && (
                        <span className="font-rajdhani text-xs text-zinc-500">
                          uploaded by {postMatch.upload.uploaded_by_name}
                          {postMatch.upload.uploaded_at && ` · ${new Date(postMatch.upload.uploaded_at).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit', hour12: true })}`}
                        </span>
                      )}
                    </div>
                    {postMatch.upload.error_message && (
                      <p className="font-rajdhani text-xs text-red-400">⚠ {postMatch.upload.error_message}</p>
                    )}
                    {postMatch.upload.status === 'parsed' && (
                      <button onClick={handleSyncStats} disabled={syncLoading}
                        className="font-rajdhani text-xs font-bold tracking-wide bg-gold/10 border border-gold-dim text-gold hover:bg-gold/20 disabled:opacity-40 px-3 py-1.5 rounded transition-colors">
                        {syncLoading ? 'Syncing…' : 'Sync Stats from Analytics DB'}
                      </button>
                    )}
                    {/* Re-sync an already-synced booking — e.g. to pick up a
                        player_name reconciled (player-identity-resolution.md)
                        after the first sync, whose cached batting/bowling rows
                        are still missing player_id. Not offered once fees are
                        applied; matchStatsSync.ts also refuses to regress that
                        status, so this stays a no-op risk-free action. */}
                    {postMatch.upload.status === 'synced' && (
                      <button onClick={handleSyncStats} disabled={syncLoading}
                        className="font-rajdhani text-xs font-semibold text-zinc-500 hover:text-gold disabled:opacity-40 underline underline-offset-2 transition-colors">
                        {syncLoading ? 'Re-syncing…' : 'Re-sync Stats from Analytics DB'}
                      </button>
                    )}
                    {syncError && <p className="font-rajdhani text-xs text-red-400">{syncError}</p>}

                    {/* Admin override — clears a stuck/wrong upload so it can be
                        re-uploaded from scratch. Never reverses fee debits. */}
                    <button onClick={handleResetUpload} disabled={resetLoading}
                      className="font-rajdhani text-xs font-bold tracking-wide border border-red-900 text-red-500 hover:bg-red-950 disabled:opacity-40 px-3 py-1.5 rounded transition-colors">
                      {resetLoading ? 'Resetting…' : 'Reset Upload'}
                    </button>
                    {resetError && <p className="font-rajdhani text-xs text-red-400">{resetError}</p>}
                  </div>
                ) : (
                  !postMatchLoading && (
                    <p className="font-rajdhani text-xs text-zinc-600">No scorecard uploaded yet.</p>
                  )
                )}

                {postMatch?.stats && (
                  <div className="border-t border-ink-5 pt-3 space-y-2">
                    <p className="font-rajdhani text-xs font-bold tracking-widest uppercase text-zinc-500">Stats Preview</p>
                    <p className="font-rajdhani text-sm text-parchment">
                      {postMatch.stats.match_result ?? 'Result pending'}
                    </p>
                    <p className="font-rajdhani text-xs text-zinc-400">
                      {postMatch.stats.team_total ?? '—'}/{postMatch.stats.team_wickets ?? '—'} ({postMatch.stats.team_overs ?? '—'} ov)
                      {' vs '}
                      {postMatch.stats.opponent_total ?? '—'}/{postMatch.stats.opponent_wickets ?? '—'} ({postMatch.stats.opponent_overs ?? '—'} ov)
                    </p>

                    <button onClick={() => setScorecardOpen(v => !v)}
                      className="font-rajdhani text-xs font-bold text-gold hover:underline">
                      {scorecardOpen ? '▲ Hide full scorecard' : '▼ View full scorecard'}
                    </button>
                    {scorecardOpen && (
                      <div className="pt-2">
                        {scorecardLoading && <p className="font-rajdhani text-xs text-zinc-600">Loading…</p>}
                        {scorecardError && <p className="font-rajdhani text-xs text-red-400">{scorecardError}</p>}
                        {scorecard && (
                          <ScorecardTables batting={scorecard.batting} bowling={scorecard.bowling} teamList={scorecard.team_list} squad={scorecardSquad} />
                        )}
                      </div>
                    )}
                  </div>
                )}

                {postMatch?.upload && ['synced', 'fees_applied'].includes(postMatch.upload.status) && (
                  <div className="border-t border-ink-5 pt-3 space-y-2">
                    <p className="font-rajdhani text-xs font-bold tracking-widest uppercase text-zinc-500">Match Fees</p>
                    {feeLoading && <p className="font-rajdhani text-xs text-zinc-600">Calculating…</p>}
                    {feeError && <p className="font-rajdhani text-xs text-red-400">{feeError}</p>}
                    {feePreview && (
                      <>
                        <p className="font-rajdhani text-xs text-zinc-400">
                          ₹{feePreview.fee_per_player} per player · {feePreview.non_exempt_count} of {feePreview.total_squad} players
                        </p>
                        {postMatch.upload.status === 'fees_applied' ? (
                          <p className="font-rajdhani text-xs text-emerald-400">
                            ✓ Fees already applied
                            {postMatch.upload.fees_applied_at && ` · ${new Date(postMatch.upload.fees_applied_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}`}
                          </p>
                        ) : (
                          <button onClick={handleApplyFees} disabled={feeConfirming}
                            className="font-rajdhani text-sm font-bold tracking-wide bg-crimson hover:bg-crimson-dark disabled:opacity-40 text-white px-4 py-2 rounded transition-colors">
                            {feeConfirming ? 'Applying…' : `Apply Match Fees — ₹${feePreview.fee_per_player} · ${feePreview.non_exempt_count} players`}
                          </button>
                        )}
                      </>
                    )}
                  </div>
                )}
              </div>
            </FormCard>
          )}

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

          {/* Live Rule Check — horizontal, directly above the save/confirm buttons */}
          <RuleCheckStrip checks={ruleChecks} overrides={overrides} onToggle={handleOverrideToggle} onReasonChange={handleOverrideReasonChange} />

          <div className="flex gap-3 justify-between">
            <button onClick={handleCancel}
              className="font-rajdhani text-xs font-bold tracking-wide border border-red-900 text-red-500 hover:bg-red-950 px-4 py-2.5 rounded transition-colors">
              Cancel Booking
            </button>
            <div className="flex gap-3">
              <button onClick={() => handleSave()} disabled={saving || !allPassed}
                className="font-rajdhani text-sm font-bold tracking-widest uppercase border border-gold-dim text-gold hover:bg-gold/10 disabled:opacity-40 px-5 py-2.5 rounded transition-colors">
                {saving ? 'Saving...' : 'Save Changes'}
              </button>
              {isReservation && (
                <button onClick={handleConfirm} disabled={saving || !tournamentId || !format || !allPassed}
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
              {captainName ? (
                <a href={captainWA} target="_blank" rel="noopener noreferrer"
                  className="flex items-center gap-2.5 w-full bg-[#128C7E] hover:bg-[#0d7a6e] text-white font-rajdhani font-bold text-sm tracking-wide px-4 py-3 rounded transition-colors">
                  <WAIcon /> Message Captain ({captainName})
                </a>
              ) : (
                <div className="font-rajdhani text-xs text-zinc-600 bg-ink-4 border border-ink-5 rounded px-3 py-2.5">
                  {tournamentId ? 'No captain set on this tournament' : 'Select a tournament to enable captain notification'}
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
              {captainName        && <p>👤 {captainName}</p>}
              {selectedTournament && <p>🏆 {selectedTournament.name}</p>}
              {venue              && <p>📍 {venue}</p>}
              {opponentName       && <p>⚔️ vs {opponentName}</p>}
              {matchId            && <p>🏏 Match ID: {matchId}</p>}
              {cricheroes && (
                <a href={cricheroes} target="_blank" rel="noopener noreferrer"
                  className="flex items-center gap-1 text-gold hover:underline">
                  🔗 View on CricHeroes
                </a>
              )}
              {isReservation && organiserName  && <p>🤝 {organiserName}</p>}
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
