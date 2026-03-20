'use client'

import { useState } from 'react'
import { signIn } from 'next-auth/react'

type Response = 'Y' | 'N' | 'O' | 'E' | 'L' | null

const BUTTONS: { code: Response; label: string; hint?: string; activeColor: string; activeText: string }[] = [
  { code: 'Y', label: 'Y',  activeColor: '#14532d', activeText: '#4ade80' },
  { code: 'N', label: 'N',  activeColor: '#450a0a', activeText: '#f87171' },
  { code: 'O', label: 'O',  activeColor: '#451a03', activeText: '#fb923c', hint: 'Only this slot — one game this weekend' },
  { code: 'E', label: 'E',  activeColor: '#422006', activeText: '#fbbf24', hint: 'Either slot today — one game only' },
  { code: 'L', label: 'L',  activeColor: '#18181b', activeText: '#71717a' },
]

interface Props {
  bookingId:       string
  isPlayer:        boolean
  isCaptain:       boolean
  initialResponse: string | null
}

export function FixturesAvailability({ bookingId, isPlayer, isCaptain, initialResponse }: Props) {
  const [response, setResponse] = useState<Response>(initialResponse as Response ?? null)
  const [saving,   setSaving]   = useState(false)
  const [hint,     setHint]     = useState<string | null>(null)

  async function handleSelect(code: Response) {
    if (!isPlayer) return
    // Tap same button = clear
    const newResponse = response === code ? null : code
    setSaving(true)
    setHint(null)

    if (newResponse === null) {
      // Clear by sending a DELETE — for simplicity send Y then immediately send null
      // Actually upsert with a placeholder then delete
      await fetch('/api/player-availability', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ booking_id: bookingId }),
      })
      setResponse(null)
    } else {
      await fetch('/api/player-availability', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ booking_id: bookingId, response: newResponse }),
      })
      setResponse(newResponse)
      const btn = BUTTONS.find(b => b.code === newResponse)
      setHint(btn?.hint ?? null)
    }
    setSaving(false)
  }

  // Not logged in — show sign in prompt
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
        <button onClick={() => signIn('google')}
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

  // Logged in player — show availability buttons
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
        <span style={{ fontSize: '10px', color: '#6B7280', fontFamily: "'DM Sans', sans-serif", marginRight: '2px' }}>
          Available?
        </span>
        <div style={{ display: 'flex', gap: '5px', flex: 1 }}>
          {BUTTONS.map(btn => {
            const isActive = response === btn.code
            return (
              <button
                key={btn.code}
                onClick={() => handleSelect(btn.code)}
                disabled={saving}
                style={{
                  flex: 1, padding: '6px 4px',
                  borderRadius: '6px',
                  border: `1px solid ${isActive ? btn.activeColor : '#374151'}`,
                  background: isActive ? btn.activeColor : '#1F2937',
                  color: isActive ? btn.activeText : '#6B7280',
                  fontSize: '12px', fontWeight: 700,
                  cursor: saving ? 'wait' : 'pointer',
                  transition: 'all 0.15s',
                  fontFamily: "'DM Sans', sans-serif",
                }}>
                {btn.label}
              </button>
            )
          })}
        </div>
      </div>
      {hint && (
        <p style={{ fontSize: '10px', color: '#9CA3AF', marginTop: '6px', fontFamily: "'DM Sans', sans-serif" }}>
          ℹ {hint}
        </p>
      )}
    </div>
  )
}
