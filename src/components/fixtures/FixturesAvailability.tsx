'use client'
// FixturesAvailability.tsx — Sprint 2
// Colours matched to Spartans Hub spreadsheet. N removed — blank = no response.
// Weekend-aware validation: O locks the whole weekend to O, E locks same-day to E.

import { useState } from 'react'
import { signIn } from 'next-auth/react'

type AvailKey  = 'Y' | 'O' | 'E' | 'L'
type AvailCode = AvailKey | null

const BUTTONS: {
  code: AvailCode
  label: string
  activeBackground: string
  activeColor: string
  activeBorder: string
  hint: string
}[] = [
  {
    code: 'Y',
    label: 'Y',
    activeBackground: '#1a4731',
    activeColor:      '#4ade80',
    activeBorder:     '#166534',
    hint: 'Available',
  },
  {
    code: 'E',
    label: 'E',
    activeBackground: '#1e3a5f',
    activeColor:      '#60a5fa',
    activeBorder:     '#1d4ed8',
    hint: 'Either game today — one only',
  },
  {
    code: 'O',
    label: 'O',
    activeBackground: '#3d2e00',
    activeColor:      '#fbbf24',
    activeBorder:     '#d97706',
    hint: 'One game this weekend only',
  },
  {
    code: 'L',
    label: 'L',
    activeBackground: '#2e1a47',
    activeColor:      '#c084fc',
    activeBorder:     '#7e22ce',
    hint: 'On leave this weekend',
  },
]

interface WeekendBooking {
  id:        string
  game_date: string
  slot_time: string
}

interface Props {
  bookingId:        string
  slotDate:         string   // game_date of this specific booking e.g. "2026-03-21"
  isPlayer:         boolean
  isCaptain:        boolean
  initialResponse:  string | null
  // All responses this player has given across the same weekend { bookingId → code }
  weekendResponses: Record<string, string>
  // All bookings in the same weekend [{ id, game_date, slot_time }]
  weekendBookings:  WeekendBooking[]
}

// ── Validation logic ──────────────────────────────────────────────
// Returns the reason a button is blocked, or null if it's allowed.
function getBlockReason(
  candidate: AvailCode,
  thisBookingId: string,
  thisDate: string,
  weekendBookings: WeekendBooking[],
  weekendResponses: Record<string, string>   // live state passed in
): string | null {
  if (!candidate) return null
  // Y and L never blocked
  if (candidate === 'Y' || candidate === 'L') return null

  // Collect other bookings this weekend (excluding this card)
  const others = weekendBookings.filter(b => b.id !== thisBookingId)

  if (candidate === 'O') {
    // O is blocked if any OTHER game this weekend already has E or Y
    // (can't promise one game while having committed more elsewhere)
    for (const b of others) {
      const r = weekendResponses[b.id] as AvailCode
      if (r === 'E') return `You marked E on another game this weekend — change that to O first`
      if (r === 'Y') return `You marked Y on another game this weekend — change that to O first`
    }
    return null
  }

  if (candidate === 'E') {
    // E is blocked if any game this weekend (same day or other day) has O
    for (const b of others) {
      const r = weekendResponses[b.id] as AvailCode
      if (r === 'O') return `You marked O on another game this weekend — E would conflict`
    }
    // E is also blocked if any OTHER game on the SAME day has Y or O
    const sameDayOthers = others.filter(b => b.game_date === thisDate)
    for (const b of sameDayOthers) {
      const r = weekendResponses[b.id] as AvailCode
      if (r === 'Y') return `You marked Y for another game on the same day — change that to E first`
    }
    return null
  }

  return null
}

export function FixturesAvailability({
  bookingId,
  slotDate,
  isPlayer,
  isCaptain,
  initialResponse,
  weekendResponses: initialWeekendResponses,
  weekendBookings,
}: Props) {
  const [response, setResponse] = useState<AvailCode>(
    (initialResponse === 'N' ? null : initialResponse) as AvailCode ?? null
  )
  // Keep a live copy of weekend responses so validation updates instantly
  // as this player changes their responses across cards on the page
  const [weekendResponses, setWeekendResponses] = useState<Record<string, string>>(
    initialWeekendResponses
  )
  const [saving,  setSaving]  = useState(false)
  const [error,   setError]   = useState<string | null>(null)

  async function handleSelect(code: AvailCode) {
    if (!isPlayer || saving) return
    setError(null)

    const newResponse: AvailCode = response === code ? null : code

    // ── Client-side validation before saving ──────────────────
    if (newResponse !== null) {
      const blockReason = getBlockReason(
        newResponse, bookingId, slotDate, weekendBookings, weekendResponses
      )
      if (blockReason) {
        setError(blockReason)
        return
      }
    }

    setSaving(true)

    try {
      if (newResponse === null) {
        const res = await fetch('/api/player-availability', {
          method: 'DELETE',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ booking_id: bookingId }),
        })
        if (res.ok) {
          setResponse(null)
          setWeekendResponses(prev => {
            const n = { ...prev }; delete n[bookingId]; return n
          })
        } else {
          const d = await res.json().catch(() => ({}))
          setError(d.error ?? `Save failed (${res.status})`)
        }
      } else {
        const res = await fetch('/api/player-availability', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ booking_id: bookingId, response: newResponse }),
        })
        if (res.ok) {
          setResponse(newResponse)
          setWeekendResponses(prev => ({ ...prev, [bookingId]: newResponse }))
        } else {
          const d = await res.json().catch(() => ({}))
          setError(d.error ?? `Save failed (${res.status})`)
        }
      }
    } catch {
      setError('Network error — check connection')
    } finally {
      setSaving(false)
    }
  }

  // ── Not a player — sign-in prompt ────────────────────────────
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

  const activeBtn = BUTTONS.find(b => b.code === response)

  // Pre-compute which buttons are blocked so we can dim them
  const blockedReasons: Partial<Record<AvailKey, string>> = {}
  for (const btn of BUTTONS) {
    if (btn.code === response) continue // never block the currently active button
    const reason = getBlockReason(btn.code, bookingId, slotDate, weekendBookings, weekendResponses)
    if (reason && btn.code) blockedReasons[btn.code as AvailKey] = reason
  }

  // ── Player availability row ───────────────────────────────────
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
          fontSize: '10px',
          color: '#4B5563',
          fontFamily: "'DM Sans', sans-serif",
          flexShrink: 0,
          minWidth: '56px',
        }}>
          {saving ? 'Saving…' : 'Available?'}
        </span>

        <div style={{ display: 'flex', gap: '5px', flex: 1 }}>
          {BUTTONS.map(btn => {
            const isActive  = response === btn.code
            const isBlocked = !isActive && !!(btn.code && blockedReasons[btn.code as AvailKey])

            return (
              <button
                key={btn.code}
                onClick={() => handleSelect(btn.code)}
                disabled={saving}
                title={isBlocked ? btn.code ? blockedReasons[btn.code as AvailKey] : undefined : btn.hint}
                style={{
                  flex: 1,
                  padding: '7px 4px',
                  borderRadius: '6px',
                  border: `1px solid ${
                    isActive  ? btn.activeBorder :
                    isBlocked ? '#1f2937'        :
                    '#374151'
                  }`,
                  background: isActive ? btn.activeBackground : '#1F2937',
                  color: isActive ? btn.activeColor : isBlocked ? '#1f2937' : '#4B5563',
                  fontSize: '12px',
                  fontWeight: 700,
                  cursor: saving ? 'wait' : isBlocked ? 'not-allowed' : 'pointer',
                  transition: 'all 0.15s',
                  fontFamily: "'DM Sans', sans-serif",
                  outline: 'none',
                  opacity: saving ? 0.5 : isBlocked ? 0.25 : 1,
                  boxShadow: isActive ? `0 0 0 1px ${btn.activeBorder}40` : 'none',
                }}>
                {btn.label}
              </button>
            )
          })}
        </div>
      </div>

      {/* Hint for the active response */}
      {activeBtn && !error && !saving && (
        <p style={{
          fontSize: '10px',
          color: activeBtn.activeColor,
          opacity: 0.7,
          marginTop: '6px',
          fontFamily: "'DM Sans', sans-serif",
          lineHeight: 1.4,
        }}>
          {activeBtn.hint}
        </p>
      )}

      {/* Validation block message or API error */}
      {error && (
        <p style={{
          fontSize: '10px',
          color: '#fb923c',
          marginTop: '6px',
          fontFamily: "'DM Sans', sans-serif",
          lineHeight: 1.4,
        }}>
          ⚠ {error}
        </p>
      )}
    </div>
  )
}
