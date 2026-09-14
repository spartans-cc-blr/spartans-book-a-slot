// SelectedMatchCard.tsx
// Spartans Hub — Home dashboard "You're Selected to Play" card
//
// Replicates FixturesCard.tsx's squad-announced content almost field for
// field (date/slot/format, tournament + opponent + ground + match_stage,
// the ball/jersey/CricHeroes/ground/hospital icon row, the collapsible
// announced-squad section with its match-fee row and wallet-after-this-
// match projection, and the squad grid with C/VC/WK badges) — but re-themed
// to this dashboard's own Warm Light palette in light mode, instead of
// FixturesCard's original hardcoded dark gradient (see navigation.md §3.1),
// since this is a distinct, dashboard-native component, not that same
// component reskinned in place. In dark mode, this card's tokens are
// aligned to FixturesCard's own DARK tokens instead (see the LIGHT/DARK
// definitions below) — so "You're Selected to Play" and the "Upcoming
// Fixtures" list right below it (which renders real FixturesCard instances)
// read as one consistent dark theme rather than two different ones.
//
// Deliberately excluded: the "⚠ Slot underfilled" availability nudge —
// that's about whether a slot still needs more Y responses, which is moot
// here (the squad is already announced by the time this card renders, so
// there's nothing left for the viewer to mark).

'use client'

import { useState } from 'react'
import { JerseyIcon } from '@/components/ui/JerseyIcon'
import {
  BallIcon, CricHeroesIcon, MapPinIcon, HospitalIcon,
  jerseyColour, jerseyLabel, stageIcon, slotLabel, formatDate,
} from '@/components/fixtures/FixturesCard'
import { useTheme } from '@/components/ui/ThemeProvider'

// Light/Dark tokens — see ui-theme.md "Light/Dark/System". Light is this
// card's original Warm Light palette, unchanged. Dark is aligned to
// FixturesCard.tsx's own DARK tokens byte-for-byte wherever the two cards
// share a concept (fixed September 2026 — dark previously reused the app's
// generic ink tokens instead, so this card's dark-mode card background,
// borders, and accents visibly diverged from FixturesCard's own dark
// theme sitting right below it in the "Upcoming Fixtures" list on this same
// page). `squadOwn` (highlighting the viewer's own row) has no FixturesCard
// equivalent — set to FixturesCard's own dark gold accent so it still
// reads as "gold" the same way the rest of this card's dark accents do. A
// plain client-side lookup (not the CSS-variable approach page.tsx uses)
// since this is already a 'use client' component and can read useTheme()
// directly.
const LIGHT = {
  cardBg: '#FFFFFF', cardBorder: '#F5D9A8',
  dateText: '#B45309', accentGradient: 'linear-gradient(90deg, #D97706, #F59E0B, #D97706)',
  headingText: '#1C1917', accentUnderline: '#D97706',
  subtitleText: '#57534E', opponentText: '#44403C',
  groundText: '#78716C', divider: '#E7E0D3', faintText: '#A8A29E',
  stageBg: '#FEF3C7', stageText: '#B45309', stageBorder: '#F5D9A8',
  squadHeading: '#059669',
  feeText: '#78716C', feeBorder: '#F1EBDD', feeAmount: '#B45309',
  walletPositive: '#059669', walletNegative: '#D97706',
  squadOwn: '#B45309', squadOther: '#44403C', squadUnderline: '#D4C9B0',
  cBadgeBg: '#FEF3C7', cBadgeText: '#B45309', cBadgeBorder: '#F5D9A8',
}
const DARK = {
  cardBg: 'linear-gradient(135deg, #1C2333 0%, #111827 100%)', cardBorder: '#2D3748',
  dateText: '#C9A84C', accentGradient: 'linear-gradient(90deg, #C9A84C, #F5D78E, #C9A84C)',
  headingText: '#F5F5F5', accentUnderline: '#C9A84C',
  subtitleText: '#9CA3AF', opponentText: '#D1D5DB',
  groundText: '#6B7280', divider: '#2D3748', faintText: '#6B7280',
  stageBg: '#2d1f00', stageText: '#f59e0b', stageBorder: '#d97706',
  squadHeading: '#4ade80',
  feeText: '#9CA3AF', feeBorder: '#1F2937', feeAmount: '#F5D78E',
  walletPositive: '#4ADE80', walletNegative: '#F59E0B',
  squadOwn: '#C9A84C', squadOther: '#D1D5DB', squadUnderline: '#C9A84C55',
  cBadgeBg: '#2d2400', cBadgeText: '#C9A84C', cBadgeBorder: '#C9A84C',
}

type SquadPlayer = {
  id: string
  name: string
  cricheroes_url: string | null
  is_match_captain: boolean
  is_vc: boolean
  is_wk: boolean
}

type Ground = { name: string; maps_url: string | null; hospital_url: string | null } | null

export type SelectedMatch = {
  id: string
  game_date: string
  slot_time: string
  match_time?: string | null
  format: string
  match_stage?: string | null
  opponent_name?: string | null
  cricheroes_url?: string | null
  tournament?: {
    name: string
    ball_type?: 'red' | 'white' | 'pink' | null
    cricheroes_points_table_url?: string | null
    ground?: Ground
  } | null
  ground?: Ground
  squad: SquadPlayer[]
  feePerPlayer: number | null
  isLoggedInPlayerExempt: boolean
  loggedInWalletBalance: number | null
}

export function SelectedMatchCard({ match, viewerPlayerId }: { match: SelectedMatch; viewerPlayerId: string }) {
  const [squadOpen, setSquadOpen] = useState(false)
  const { resolvedTheme } = useTheme()
  const t = resolvedTheme === 'dark' ? DARK : LIGHT
  const ground = match.ground ?? match.tournament?.ground ?? null
  const ballType = (match.tournament?.ball_type || 'red') as 'red' | 'white' | 'pink'
  const jColour = jerseyColour(ballType)
  const jLabel = jerseyLabel(ballType)
  const hasGround = !!ground?.maps_url
  const hasHosp = !!ground?.hospital_url

  return (
    <div className="rounded-xl p-4 mb-3 relative overflow-hidden flex flex-col gap-2.5"
      style={{ background: t.cardBg, border: `1px solid ${t.cardBorder}` }}>
      <div className="absolute top-0 left-0 right-0 h-[3px]" style={{ background: t.accentGradient }} />

      {/* Date + slot + format row */}
      <div className="flex items-center justify-between gap-2">
        <span className="font-rajdhani text-xs font-semibold" style={{ color: t.dateText }}>
          {formatDate(match.game_date)} · {match.match_time
            ? match.match_time.slice(0, 5).replace(/^0/, '') + ' ' + (parseInt(match.match_time, 10) < 12 ? 'AM' : 'PM')
            : slotLabel(match.slot_time)}
        </span>
        <div className="flex items-center gap-1.5 flex-shrink-0">
          <span className="font-rajdhani text-[10px] font-bold px-2 py-0.5 rounded-full uppercase tracking-wide"
            style={{ background: '#DBEAFE', color: '#1D4ED8' }}>
            {match.format}
          </span>
        </div>
      </div>

      {/* Tournament + opponent + ground + match_stage */}
      <div>
        <p className="font-cinzel text-base font-bold leading-snug" style={{ color: t.headingText }}>
          {match.tournament?.cricheroes_points_table_url ? (
            <a href={match.tournament.cricheroes_points_table_url} target="_blank" rel="noopener noreferrer"
              style={{ color: t.headingText, textDecoration: 'underline', textDecorationColor: t.accentUnderline, textUnderlineOffset: '3px' }}>
              {match.tournament?.name}
            </a>
          ) : (
            match.tournament?.name ?? 'Match'
          )}
        </p>
        <p className="font-rajdhani text-sm mt-0.5" style={{ color: t.subtitleText }}>
          vs <span style={{ color: t.opponentText, fontWeight: 500 }}>{match.opponent_name ?? 'TBD'}</span>
        </p>
        {(ground?.name || match.match_stage) && (
          <div className="flex items-center justify-between mt-1 gap-2">
            <p className="font-rajdhani text-xs" style={{ color: t.groundText }}>
              {ground?.name && (
                <>
                  {'@ '}
                  {ground.maps_url ? (
                    <a href={ground.maps_url} target="_blank" rel="noopener noreferrer" style={{ color: '#34A853', textDecoration: 'none' }}>
                      {ground.name}
                    </a>
                  ) : ground.name}
                </>
              )}
            </p>
            {match.match_stage && (
              <span className="font-rajdhani text-[10px] font-bold px-2 py-0.5 rounded-full uppercase tracking-wide flex-shrink-0"
                style={{ background: t.stageBg, color: t.stageText, border: `1px solid ${t.stageBorder}` }}>
                {stageIcon(match.match_stage)} {match.match_stage}
              </span>
            )}
          </div>
        )}
      </div>

      <div className="h-px" style={{ background: t.divider }} />

      {/* Icon row — ball, jersey, CricHeroes, ground, hospital */}
      <div className="flex items-center gap-3.5">
        <div className="flex flex-col items-center gap-0.5">
          <BallIcon type={ballType} size={20} />
          <span className="font-rajdhani text-[9px] capitalize" style={{ color: t.faintText }}>{ballType} ball</span>
        </div>
        <div className="flex flex-col items-center gap-0.5">
          <JerseyIcon colour={jColour} size={20} />
          <span className="font-rajdhani text-[9px]" style={{ color: t.faintText }}>{jLabel}</span>
        </div>
        <div className="flex-1" />
        {match.cricheroes_url && (
          <a href={match.cricheroes_url} target="_blank" rel="noopener noreferrer" title="Open in CricHeroes"
            className="flex flex-col items-center gap-0.5" style={{ textDecoration: 'none' }}>
            <CricHeroesIcon size={20} />
            <span className="font-rajdhani text-[9px]" style={{ color: t.faintText }}>CricHeroes</span>
          </a>
        )}
        {hasGround && (
          <a href={ground!.maps_url!} target="_blank" rel="noopener noreferrer" title="Open ground in Google Maps"
            className="flex flex-col items-center gap-0.5" style={{ textDecoration: 'none' }}>
            <MapPinIcon size={18} />
            <span className="font-rajdhani text-[9px]" style={{ color: t.faintText }}>Ground</span>
          </a>
        )}
        {hasHosp && (
          <a href={ground!.hospital_url!} target="_blank" rel="noopener noreferrer" title="Nearest hospital"
            className="flex flex-col items-center gap-0.5" style={{ textDecoration: 'none' }}>
            <HospitalIcon size={18} />
            <span className="font-rajdhani text-[9px]" style={{ color: t.faintText }}>Hospital</span>
          </a>
        )}
      </div>

      {/* Announced squad — collapsible, same as FixturesCard */}
      <div>
        <div className="h-px mb-1.5" style={{ background: t.divider }} />
        <button
          onClick={() => setSquadOpen(v => !v)}
          className="w-full flex items-center justify-between py-1"
          style={{ background: 'none', border: 'none', cursor: 'pointer' }}
        >
          <span className="font-rajdhani text-[11px] font-bold uppercase tracking-wide" style={{ color: t.squadHeading }}>
            ✅ Squad Announced · {match.squad.length} players
          </span>
          <span className="text-sm" style={{ color: t.faintText }}>{squadOpen ? '▲' : '▼'}</span>
        </button>

        {match.feePerPlayer != null && (
          <div className="font-rajdhani text-xs pt-1.5 mt-0.5" style={{ color: t.feeText, borderTop: `1px solid ${t.feeBorder}` }}>
            💰 Match fee: <span style={{ color: t.feeAmount, fontWeight: 700 }}>₹{match.feePerPlayer}</span> per player
            {match.isLoggedInPlayerExempt && (
              <span style={{ color: t.faintText, marginLeft: '6px' }}>· You are exempt</span>
            )}
          </div>
        )}

        {match.feePerPlayer != null && !match.isLoggedInPlayerExempt && match.loggedInWalletBalance != null && (
          <div className="font-rajdhani text-xs mt-1" style={{ color: t.feeText }}>
            Your wallet after this match:{' '}
            <span style={{
              fontWeight: 700,
              color: (match.loggedInWalletBalance - match.feePerPlayer) < 0 ? t.walletNegative : t.walletPositive,
            }}>
              ₹{match.loggedInWalletBalance - match.feePerPlayer}
            </span>
            <span style={{ color: t.faintText, marginLeft: '4px' }}>
              (currently ₹{match.loggedInWalletBalance} · −₹{match.feePerPlayer})
            </span>
          </div>
        )}

        {squadOpen && (
          <div className="grid grid-cols-2 gap-x-3 gap-y-1.5 pb-1 pt-2">
            {match.squad.map(p => (
              <div key={p.id} className="font-rajdhani text-xs" style={{ color: p.id === viewerPlayerId ? t.squadOwn : t.squadOther }}>
                {p.id ? (
                  <a href={`/players/${p.id}/stats`} style={{ color: 'inherit', textDecoration: 'underline', textDecorationColor: t.squadUnderline }}>
                    {p.name}
                  </a>
                ) : p.cricheroes_url ? (
                  <a href={p.cricheroes_url} target="_blank" rel="noopener noreferrer"
                    style={{ color: 'inherit', textDecoration: 'underline', textDecorationColor: t.squadUnderline }}>
                    {p.name}
                  </a>
                ) : (
                  p.name
                )}
                {p.is_match_captain && (
                  <span className="ml-1 font-bold px-1 rounded" style={{ fontSize: '9px', color: t.cBadgeText, background: t.cBadgeBg, border: `1px solid ${t.cBadgeBorder}` }}>C</span>
                )}
                {p.is_vc && (
                  <span className="ml-1 font-bold px-1 rounded" style={{ fontSize: '9px', color: t.cBadgeText, background: t.cBadgeBg, border: `1px solid ${t.cBadgeBorder}`, opacity: 0.8 }}>VC</span>
                )}
                {p.is_wk && (
                  <span className="ml-1 font-bold px-1 rounded" style={{ fontSize: '9px', color: '#1D4ED8', background: '#DBEAFE', border: '1px solid #93C5FD' }}>WK</span>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
