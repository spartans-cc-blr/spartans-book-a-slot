'use client'
// FixturesAvailability.tsx
// Colours matched to Spartans Hub spreadsheet. N removed.
// Receives weekendResponses as a prop (owned by parent FixturesWeekendGroup).
// Blocked buttons are visibly disabled — grey with strikethrough cursor — not invisible.

import { signIn } from 'next-auth/react'

type AvailKey  = 'Y' | 'O' | 'E' | 'L'
type AvailCode = AvailKey | null

const BUTTONS: {
  code:             AvailKey
  label:            string
  activeBackground: string
  activeColor:      string
  activeBorder:     string
  hint:             string
}[] = [
  { code: 'Y', label: 'Y', activeBackground: '#1a4731', activeColor: '#4ade80', activeBorder: '#166534', hint: 'Available' },
  { code: 'E', label: 'E', activeBackground: '#1e3a5f', activeColor: '#60a5fa', activeBorder: '#1d4ed8', hint: 'Either game today — one only' },
  { code: 'O', label: 'O', activeBackground: '#3d2e00', activeColor: '#fbbf24', activeBorder: '#d97706', hint: 'One game this weekend only' },
  { code: 'L', label: 'L', activeBackground: '#2e1a47', activeColor: '#c084fc', activeBorder: '#7e22ce', hint: 'On leave this weekend' },
]

interface WeekendBooking {
  id:        string
  game_date: string
  slot_time: string
}

interface Props {
  bookingId:        string
  slotDate:         string
  isPlayer:         boolean
  isCaptain:        boolean
  response:         AvailCode           // controlled by parent
  saving:           boolean
  error:            string | null
  weekendResponses: Record<string, string>
  weekendBookings:  WeekendBooking[]
  onSelect:         (bookingId: string, code: AvailKey | null) => void
}

// ── Validation ────────────────────────────────────────────────────
// Returns a block reason string if `candidate` is not allowed given
// what the player has already marked on other games this weekend.
function getBlockReason(
  candidate: AvailKey,
  thisBookingId: string,
  thisDate: string,
  weekendBookings: WeekendBooking[],
  weekendResponses: Record<string, string>
): string | null {
  // L is never blocked
  if (candidate === 'L') return null

  const others        = weekendBookings.filter(b => b.id !== thisBookingId)
  const sameDayOthers = others.filter(b => b.game_date === thisDate)

  if (candidate === 'Y') {
    // Y blocked if any same-day game already has E
    for (const b of sameDayOthers) {
      const r = weekendResponses[b.id] as AvailCode
      if (r === 'E') return `You marked E on another game today — undo that first, or mark E here too`
    }
    // Y blocked if any game this weekend has O
    for (const b of others) {
      const r = weekendResponses[b.id] as AvailCode
      if (r === 'O') return `You marked O on another game this weekend — undo that first`
    }
  }

  if (candidate === 'O') {
    // O blocked if any other game this weekend has Y or E
    for (const b of others) {
      const r = weekendResponses[b.id] as AvailCode
      if (r === 'Y') return `You marked Y on another game this weekend — undo that first`
      if (r === 'E') return `You marked E on another game this weekend — undo that first`
    }
  }

  if (candidate === 'E') {
    // E blocked if any game this weekend has O
    for (const b of others) {
      const r = weekendResponses[b.id] as AvailCode
      if (r === 'O') return `You marked O on another game this weekend — undo that first`
    }
    // E blocked if another game on the SAME day has Y
    for (const b of sameDayOthers) {
      const r = weekendResponses[b.id] as AvailCode
      if (r === 'Y') return `You marked Y for another game today — undo that first`
    }
  }

  return null
}

export function FixturesAvailability({
  bookingId,
  slotDate,
  isPlayer,
  response,
  saving,
  error,
  weekendResponses,
  weekendBookings,
  onSelect,
}: Props) {

  // ── Not a player — sign-in prompt ────────────────────────────
  if (!isPlayer) {
    return (
      <div style={{
        marginTop: '-6px', padding: '10px 16px',
        background: '#111827', border: '1px solid #2D3748',
        borderTop: 'none', borderRadius: '0 0 12px 12px',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px',
      }}>
        <span style={{ fontSize: '11px', color: '#6B7280', fontFamily: "'DM Sans', sans-serif" }}>
          Sign in to submit your availability
        </span>
        <button onClick={() => signIn('google')} style={{
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

  // Pre-compute block reasons for each button
  const blockedReasons: Partial<Record<AvailKey, string>> = {}
  for (const btn of BUTTONS) {
    if (btn.code === response) continue // active button is never blocked
    const reason = getBlockReason(btn.code, bookingId, slotDate, weekendBookings, weekendResponses)
    if (reason) blockedReasons[btn.code] = reason
  }

  const activeBtn = BUTTONS.find(b => b.code === response)

  return (
    <div style={{
      marginTop: '-6px', padding: '10px 16px 12px',
      background: '#111827', border: '1px solid #2D3748',
      borderTop: '1px solid #1F2937', borderRadius: '0 0 12px 12px',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
        <span style={{
          fontSize: '10px', color: '#4B5563',
          fontFamily: "'DM Sans', sans-serif", flexShrink: 0, minWidth: '56px',
        }}>
          {saving ? 'Saving…' : 'Available?'}
        </span>

        <div style={{ display: 'flex', gap: '5px', flex: 1 }}>
          {BUTTONS.map(btn => {
            const isActive  = response === btn.code
            const blockMsg  = blockedReasons[btn.code]
            const isBlocked = !isActive && !!blockMsg

            return (
              <button
                key={btn.code}
                onClick={() => !isBlocked && onSelect(bookingId, btn.code)}
                disabled={saving || isBlocked}
                title={isBlocked ? blockMsg : btn.hint}
                style={{
                  flex: 1, padding: '7px 4px', borderRadius: '6px',
                  fontFamily: "'DM Sans', sans-serif", fontSize: '12px', fontWeight: 700,
                  outline: 'none', transition: 'all 0.15s',
                  border: isActive
                    ? `1px solid ${btn.activeBorder}`
                    : '1px solid #374151',
                  background: isActive ? btn.activeBackground : '#1F2937',
                  // Active: bright colour. Blocked: visible mid-grey + strikethrough. Idle: softer grey.
                  color: isActive ? btn.activeColor : isBlocked ? '#9CA3AF' : '#6B7280',
                  cursor: saving ? 'wait' : isBlocked ? 'not-allowed' : 'pointer',
                  opacity: saving ? 0.5 : 1,
                  boxShadow: isActive ? `0 0 0 1px ${btn.activeBorder}40` : 'none',
                  textDecoration: isBlocked ? 'line-through' : 'none',
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
          fontSize: '10px', color: activeBtn.activeColor, opacity: 0.7,
          marginTop: '6px', fontFamily: "'DM Sans', sans-serif", lineHeight: 1.4,
        }}>
          {activeBtn.hint}
        </p>
      )}

      {/* Error / validation message */}
      {error && (
        <p style={{
          fontSize: '10px', color: '#fb923c',
          marginTop: '6px', fontFamily: "'DM Sans', sans-serif", lineHeight: 1.4,
        }}>
          ⚠ {error}
        </p>
      )}
    </div>
  )
}
