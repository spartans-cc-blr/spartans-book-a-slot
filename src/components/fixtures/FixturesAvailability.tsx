'use client'
// FixturesAvailability.tsx
// Colours matched to Spartans Hub spreadsheet. N removed.
// Receives weekendResponses as a prop (owned by parent FixturesWeekendGroup).
// Blocked buttons are visibly disabled — grey with strikethrough cursor — not invisible.

import { signIn } from 'next-auth/react'
import { FixtureShareButton } from './FixturesCard'
import { useTheme } from '@/components/ui/ThemeProvider'

type AvailKey  = 'Y' | 'O' | 'E' | 'L'
type AvailCode = AvailKey | null

// Light/Dark tokens — see ui-theme.md and FixturesCard.tsx's own note. DARK
// preserves this panel's original always-dark palette byte-for-byte (this
// row used to render dark regardless of page theme — see
// player-availability.md's theme-awareness note, that decision is reversed
// here). The Y/O/E/L response-button colours themselves (BUTTONS below) are
// left untouched in both themes — they're semantic response codes, matched
// to the same legend colours used on /fixtures itself, not chrome.
const LIGHT = {
  panelBg: '#FFFFFF', panelBorder: '#D4C9B0', panelBorderTop: '#E7E0D3',
  notPlayerText: '#78716C', signInColor: '#B45309',
  labelText: '#78716C',
  idleBg: '#F0EAD8', idleBorder: '#D4C9B0', idleText: '#78716C',
  blockedText: '#A8A29E',
  frozenText: '#78716C',
}
const DARK = {
  panelBg: '#111827', panelBorder: '#2D3748', panelBorderTop: '#1F2937',
  notPlayerText: '#6B7280', signInColor: '#C9A84C',
  labelText: '#4B5563',
  idleBg: '#1F2937', idleBorder: '#374151', idleText: '#6B7280',
  blockedText: '#9CA3AF',
  frozenText: '#6B7280',
}

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
  // New props added to FixturesAvailabilityProps:
  hasDues?: boolean          // wallet_balance < 0 AND no dues_override
  slotLocked?: boolean       // bookings.availability_locked === true
  squadAnnounced?: boolean
  // Captains, GC, and admins bypass the freeze on the server (see
  // checkFreeze() in /api/player-availability) — these mirror that so the
  // UI doesn't disable buttons the API would happily accept.
  isGC?: boolean
  isAdmin?: boolean
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
  isCaptain,
  response,
  saving,
  error,
  weekendResponses,
  weekendBookings,
  onSelect,
  hasDues,
  slotLocked,
  squadAnnounced,
  isGC,
  isAdmin,
}: Props) {
  const { resolvedTheme } = useTheme()
  const t = resolvedTheme === 'dark' ? DARK : LIGHT

  // Mirrors the server-side bypass in checkFreeze() — captains, GC, and
  // admins manage the pool directly and are never blocked by the freeze
  // when updating their own response. Wallet dues still apply to everyone.
  const bypassesFreeze = isCaptain || isGC || isAdmin

  // ── Not a player — sign-in prompt ────────────────────────────
  if (!isPlayer) {
    return (
      <div style={{
        marginTop: '-6px', padding: '10px 16px',
        background: t.panelBg, border: `1px solid ${t.panelBorder}`,
        borderTop: 'none', borderRadius: '0 0 12px 12px',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px',
      }}>
        <span style={{ fontSize: '11px', color: t.notPlayerText, fontFamily: "'DM Sans', sans-serif" }}>
          Sign in to submit your availability
        </span>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexShrink: 0 }}>
          <button onClick={() => signIn('google')} style={{
            fontSize: '11px', fontWeight: 700, color: t.signInColor,
            border: `1px solid ${t.signInColor}`, borderRadius: '6px',
            padding: '4px 10px', background: 'transparent', cursor: 'pointer',
            fontFamily: "'DM Sans', sans-serif",
          }}>
            Sign in
          </button>
          <FixtureShareButton bookingId={bookingId} />
        </div>
      </div>
    )
  }

  // ── Upstream guards (apply to ALL buttons) ────────────────────
 
   const upstreamBlock =
    hasDues                        ? 'Your account has outstanding dues — please clear your balance to update availability' :
    slotLocked && !bypassesFreeze  ? 'Availability locked — Squad selection in progress' :
    null
 
   const blockedReasons: Partial<Record<AvailKey, string>> = {}
   for (const btn of BUTTONS) {
    if (btn.code === response) continue
    const reason = upstreamBlock ?? getBlockReason(btn.code, bookingId, slotDate, weekendBookings, weekendResponses)
    if (reason) blockedReasons[btn.code] = reason
  }

  const activeBtn = BUTTONS.find(b => b.code === response)

  return (
    <div style={{
      marginTop: '-6px', padding: '10px 16px 12px',
      background: t.panelBg, border: `1px solid ${t.panelBorder}`,
      borderTop: `1px solid ${t.panelBorderTop}`, borderRadius: '0 0 12px 12px',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
        <span style={{
          fontSize: '10px', color: t.labelText,
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
                    : `1px solid ${t.idleBorder}`,
                  background: isActive ? btn.activeBackground : t.idleBg,
                  // Active: bright colour. Blocked: visible mid-grey + strikethrough. Idle: softer grey.
                  color: isActive ? btn.activeColor : isBlocked ? t.blockedText : t.idleText,
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

      {/* Hint for active code — share icon lives on this row, bottom right */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '6px', gap: '8px' }}>
        {activeBtn && !error && !saving ? (
          <p style={{
            fontSize: '10px', color: activeBtn.activeColor, opacity: 0.7,
            fontFamily: "'DM Sans', sans-serif", lineHeight: 1.4,
          }}>
            {activeBtn.hint}
          </p>
        ) : <span />}
        <FixtureShareButton bookingId={bookingId} />
      </div>

      {/* Frozen slot notice */}
{slotLocked && !squadAnnounced && !bypassesFreeze && (
    <p style={{ fontSize: '10px', color: t.frozenText, marginTop: '6px',
      fontFamily: "'DM Sans', sans-serif", lineHeight: 1.4 }}>
      🔒 Availability locked — Squad selection in progress
      {response === 'L' ? ' (you can still withdraw your L)' : ''}
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
