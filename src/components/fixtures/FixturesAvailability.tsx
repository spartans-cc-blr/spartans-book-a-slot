'use client'

import { useState } from 'react'
import { signIn } from 'next-auth/react'

type AvailCode = 'Y' | 'N' | 'O' | 'E' | 'L' | null

// ── Weekend context passed down from the fixtures page ─────────
// weekendResponses: all this player's responses for the same weekend
// { bookingId: response }
// slotDate: the game_date of this booking (to group same-day)

interface AvailButton {
  code: AvailCode
  label: string
  activeColor: string
  activeText: string
  borderColor: string
}

const BUTTONS: AvailButton[] = [
  { code: 'Y', label: 'Y', activeColor: '#14532d', activeText: '#4ade80', borderColor: '#166534' },
  { code: 'N', label: 'N', activeColor: '#450a0a', activeText: '#f87171', borderColor: '#7f1d1d' },
  { code: 'O', label: 'O', activeColor: '#431407', activeText: '#fb923c', borderColor: '#9a3412' },
  { code: 'E', label: 'E', activeColor: '#422006', activeText: '#fbbf24', borderColor: '#92400e' },
  { code: 'L', label: 'L', activeColor: '#18181b', activeText: '#71717a', borderColor: '#3f3f46' },
]

const CODE_LABELS: Record<string, string> = {
  Y: 'Yes',
  N: 'No',
  O: 'One game this weekend',
  E: 'Either game today, one only',
  L: 'On leave',
}

interface Props {
  bookingId:        string
  slotDate:         string          // game_date for this booking e.g. "2026-04-05"
  isPlayer:         boolean
  isCaptain:        boolean
  initialResponse:  string | null
  // All responses for the same weekend { bookingId → response }
  weekendResponses: Record<string, string>
  // All bookings for the same weekend [{ id, game_date, slot_time }]
  weekendBookings:  { id: string; game_date: string; slot_time: string }[]
}

export function FixturesAvailability({
  bookingId,
  slotDate,
  isPlayer,
  isCaptain,
  initialResponse,
  weekendResponses,
  weekendBookings,
}: Props) {
  const [response,         setResponse]         = useState<AvailCode>(initialResponse as AvailCode ?? null)
  const [localWeekendResp, setLocalWeekendResp] = useState<Record<string, string>>(weekendResponses)
  const [saving,           setSaving]           = useState(false)

  // ── Derive weekend-aware hint ──────────────────────────────
  function getHint(code: AvailCode): string | null {
    if (!code) return null
    if (code === 'Y') return null
    if (code === 'N') return null
    if (code === 'L') return 'You are marked on leave for this entire weekend'

    if (code === 'O') {
      // O means: I want only this game across the whole weekend
      const otherGames = weekendBookings.filter(b => b.id !== bookingId)
      if (otherGames.length === 0) return 'Only game this weekend — noted'
      return `Only this game this weekend — you'll be skipped for the other ${otherGames.length} game${otherGames.length > 1 ? 's' : ''}`
    }

    if (code === 'E') {
      // E means: either game on the same day, one only
      const sameDayGames = weekendBookings.filter(b => b.game_date === slotDate && b.id !== bookingId)
      if (sameDayGames.length === 0) return 'Only one game today — E treated as Y'
      return `Available for either game on this day — captain picks one`
    }

    return null
  }

  // ── Conflict warnings ──────────────────────────────────────
  // E.g. player already marked O on another game this weekend
  function getConflictWarning(code: AvailCode): string | null {
    if (!code) return null

    // If this player already has O on another game in the weekend
    const otherOBooking = weekendBookings.find(b =>
      b.id !== bookingId && localWeekendResp[b.id] === 'O'
    )
    if (otherOBooking && code === 'Y') {
      return `You marked O on another game this weekend — you'll be counted once`
    }

    // If marking O but already Y on another game
    if (code === 'O') {
      const alreadyY = weekendBookings.find(b =>
        b.id !== bookingId && localWeekendResp[b.id] === 'Y'
      )
      if (alreadyY) return `You're marked Y for another game this weekend — O will override that preference`
    }

    return null
  }

  async function handleSelect(code: AvailCode) {
    if (!isPlayer) return
    const newResponse: AvailCode = response === code ? null : code
    setSaving(true)

    if (newResponse === null) {
      await fetch('/api/player-availability', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ booking_id: bookingId }),
      })
      setResponse(null)
      setLocalWeekendResp(prev => { const n = { ...prev }; delete n[bookingId]; return n })
    } else {
      const res = await fetch('/api/player-availability', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ booking_id: bookingId, response: newResponse }),
      })
      if (res.ok) {
        setResponse(newResponse)
        setLocalWeekendResp(prev => ({ ...prev, [bookingId]: newResponse }))
      }
    }
    setSaving(false)
  }

  // ── Not a player — sign-in prompt ─────────────────────────
  if (!isPlayer) {
    return (
      <div style={{
        marginTop: '-6px',
        padding: '10px 16px',
        background: '#111827',
        border: '1px solid #2D3748',
        borderTop: 'none',
        borderRadius: '0 0 12px 12px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: '8px',
      }}>
        <span style={{ fontSize: '11px', color: '#6B7280', fontFamily: "'DM Sans', sans-serif" }}>
          Sign in to submit your availability
        </span>
        <button
          onClick={() => signIn('google')}
          style={{
            fontSize: '11px', fontWeight: 700, color: '#C9A84C',
            border: '1px solid #C9A84C', borderRadius: '6px',
            padding: '4px 10px', background: 'transparent', cursor: 'pointer',
            fontFamily: "'DM Sans', sans-serif",
          }}>
          Sign in
        </button>
      </div>
    )
  }

  const hint    = getHint(response)
  const warning = getConflictWarning(response)

  // ── Player availability row ────────────────────────────────
  return (
    <div style={{
      marginTop: '-6px',
      padding: '10px 16px 12px',
      background: '#111827',
      border: '1px solid #2D3748',
      borderTop: '1px solid #1F2937',
      borderRadius: '0 0 12px 12px',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
        <span style={{
          fontSize: '10px', color: '#6B7280',
          fontFamily: "'DM Sans', sans-serif",
          flexShrink: 0,
          marginRight: '2px',
        }}>
          Available?
        </span>

        <div style={{ display: 'flex', gap: '4px', flex: 1 }}>
          {BUTTONS.map(btn => {
            const isActive = response === btn.code
            return (
              <button
                key={btn.code}
                onClick={() => handleSelect(btn.code)}
                disabled={saving}
                title={CODE_LABELS[btn.code!]}
                style={{
                  flex: 1,
                  padding: '6px 4px',
                  borderRadius: '6px',
                  border: `1px solid ${isActive ? btn.borderColor : '#374151'}`,
                  background: isActive ? btn.activeColor : '#1F2937',
                  color: isActive ? btn.activeText : '#6B7280',
                  fontSize: '12px',
                  fontWeight: 700,
                  cursor: saving ? 'wait' : 'pointer',
                  transition: 'all 0.15s',
                  fontFamily: "'DM Sans', sans-serif",
                  outline: 'none',
                }}>
                {btn.label}
              </button>
            )
          })}
        </div>

        {/* Saving indicator */}
        {saving && (
          <span style={{ fontSize: '10px', color: '#4B5563', fontFamily: "'DM Sans', sans-serif", flexShrink: 0 }}>
            …
          </span>
        )}
      </div>

      {/* Hint */}
      {hint && !saving && (
        <p style={{
          fontSize: '10px', color: '#9CA3AF',
          marginTop: '6px',
          fontFamily: "'DM Sans', sans-serif",
          lineHeight: 1.4,
        }}>
          ℹ {hint}
        </p>
      )}

      {/* Conflict warning */}
      {warning && !saving && (
        <p style={{
          fontSize: '10px', color: '#F59E0B',
          marginTop: hint ? '3px' : '6px',
          fontFamily: "'DM Sans', sans-serif",
          lineHeight: 1.4,
        }}>
          ⚠ {warning}
        </p>
      )}
    </div>
  )
}
