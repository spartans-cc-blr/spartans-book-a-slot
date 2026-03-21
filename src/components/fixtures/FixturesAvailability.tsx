'use client'
// FixturesAvailability.tsx — Sprint 2
// Colours matched to Spartans Hub spreadsheet. N removed — blank = no response.

import { useState } from 'react'
import { signIn } from 'next-auth/react'

type AvailCode = 'Y' | 'O' | 'E' | 'L' | null

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

interface Props {
  bookingId:       string
  slotDate?:       string
  isPlayer:        boolean
  isCaptain:       boolean
  initialResponse: string | null
  weekendResponses?: Record<string, string>
  weekendBookings?:  { id: string; game_date: string; slot_time: string }[]
}

export function FixturesAvailability({
  bookingId,
  isPlayer,
  isCaptain,
  initialResponse,
}: Props) {
  const [response, setResponse] = useState<AvailCode>(
    // Treat any legacy N as null — blank
    (initialResponse === 'N' ? null : initialResponse) as AvailCode ?? null
  )
  const [saving, setSaving] = useState(false)
  const [error,  setError]  = useState<string | null>(null)

  async function handleSelect(code: AvailCode) {
    if (!isPlayer || saving) return
    setError(null)

    // Tapping the active button clears the response
    const newResponse: AvailCode = response === code ? null : code
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
            const isActive = response === btn.code
            return (
              <button
                key={btn.code}
                onClick={() => handleSelect(btn.code)}
                disabled={saving}
                title={btn.hint}
                style={{
                  flex: 1,
                  padding: '7px 4px',
                  borderRadius: '6px',
                  border: `1px solid ${isActive ? btn.activeBorder : '#374151'}`,
                  background: isActive ? btn.activeBackground : '#1F2937',
                  color: isActive ? btn.activeColor : '#4B5563',
                  fontSize: '12px',
                  fontWeight: 700,
                  cursor: saving ? 'wait' : 'pointer',
                  transition: 'all 0.15s',
                  fontFamily: "'DM Sans', sans-serif",
                  outline: 'none',
                  opacity: saving ? 0.5 : 1,
                  // Subtle glow on active
                  boxShadow: isActive ? `0 0 0 1px ${btn.activeBorder}40` : 'none',
                }}>
                {btn.label}
              </button>
            )
          })}
        </div>
      </div>

      {/* Hint for active code */}
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

      {/* Error */}
      {error && (
        <p style={{
          fontSize: '10px',
          color: '#f87171',
          marginTop: '6px',
          fontFamily: "'DM Sans', sans-serif",
          lineHeight: 1.4,
        }}>
          ✕ {error}
        </p>
      )}
    </div>
  )
}
