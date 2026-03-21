'use client'
// FixturesAvailability.tsx — Sprint 2 fix
// Bug fixed: previously called setResponse() before checking res.ok,
// so the button appeared saved even when the API returned an error.
// Now: only updates local state on confirmed success, shows the actual error.

import { useState } from 'react'
import { signIn } from 'next-auth/react'

type AvailCode = 'Y' | 'N' | 'O' | 'E' | 'L' | null

const BUTTONS: {
  code: AvailCode
  label: string
  activeColor: string
  activeText: string
  borderColor: string
  hint?: string
}[] = [
  { code: 'Y', label: 'Y', activeColor: '#14532d', activeText: '#4ade80', borderColor: '#166634' },
  { code: 'N', label: 'N', activeColor: '#450a0a', activeText: '#f87171', borderColor: '#7f1d1d' },
  { code: 'O', label: 'O', activeColor: '#431407', activeText: '#fb923c', borderColor: '#9a3412',
    hint: 'One game this weekend only' },
  { code: 'E', label: 'E', activeColor: '#422006', activeText: '#fbbf24', borderColor: '#92400e',
    hint: 'Either game today — one only' },
  { code: 'L', label: 'L', activeColor: '#18181b', activeText: '#71717a', borderColor: '#3f3f46',
    hint: 'On leave this weekend' },
]

interface Props {
  bookingId:        string
  slotDate?:        string
  isPlayer:         boolean
  isCaptain:        boolean
  initialResponse:  string | null
  weekendResponses?: Record<string, string>
  weekendBookings?:  { id: string; game_date: string; slot_time: string }[]
}

export function FixturesAvailability({
  bookingId,
  isPlayer,
  isCaptain,
  initialResponse,
}: Props) {
  const [response, setResponse] = useState<AvailCode>(initialResponse as AvailCode ?? null)
  const [saving,   setSaving]   = useState(false)
  const [error,    setError]    = useState<string | null>(null)

  async function handleSelect(code: AvailCode) {
    if (!isPlayer || saving) return
    setError(null)

    // Tapping the active button clears the response
    const newResponse: AvailCode = response === code ? null : code
    setSaving(true)

    try {
      if (newResponse === null) {
        // ── DELETE ───────────────────────────────────────────
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
        // ── POST / upsert ─────────────────────────────────────
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

  // ── Not a player — show sign-in prompt ────────────────────
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
          fontSize: '10px',
          color: saving ? '#4B5563' : '#6B7280',
          fontFamily: "'DM Sans', sans-serif",
          flexShrink: 0,
          marginRight: '2px',
          minWidth: '52px',
        }}>
          {saving ? 'Saving…' : 'Available?'}
        </span>

        <div style={{ display: 'flex', gap: '4px', flex: 1 }}>
          {BUTTONS.map(btn => {
            const isActive = response === btn.code
            return (
              <button
                key={btn.code}
                onClick={() => handleSelect(btn.code)}
                disabled={saving}
                title={btn.hint ?? btn.label!}
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
                  opacity: saving ? 0.5 : 1,
                }}>
                {btn.label}
              </button>
            )
          })}
        </div>
      </div>

      {/* Contextual hint for the selected code */}
      {activeBtn?.hint && !error && !saving && (
        <p style={{
          fontSize: '10px',
          color: '#9CA3AF',
          marginTop: '6px',
          fontFamily: "'DM Sans', sans-serif",
          lineHeight: 1.4,
        }}>
          ℹ {activeBtn.hint}
        </p>
      )}

      {/* Actual API / network error — visible to the player */}
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
