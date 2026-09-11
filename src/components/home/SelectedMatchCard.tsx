// SelectedMatchCard.tsx
// Spartans Hub — Home dashboard "You're Selected to Play" card
//
// Replicates FixturesCard.tsx's squad-announced content almost field for
// field (date/slot/format, tournament + opponent + ground + match_stage,
// the ball/jersey/CricHeroes/ground/hospital icon row, the collapsible
// announced-squad section with its match-fee row and wallet-after-this-
// match projection, and the squad grid with C/VC/WK badges) — but
// re-themed to this dashboard's Warm Light palette instead of
// FixturesCard's hardcoded dark gradient (see navigation.md §3.1), since
// this is a distinct, dashboard-native component, not that same component
// reskinned in place.
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
  const ground = match.ground ?? match.tournament?.ground ?? null
  const ballType = (match.tournament?.ball_type || 'red') as 'red' | 'white' | 'pink'
  const jColour = jerseyColour(ballType)
  const jLabel = jerseyLabel(ballType)
  const hasGround = !!ground?.maps_url
  const hasHosp = !!ground?.hospital_url

  return (
    <div className="rounded-xl p-4 mb-3 relative overflow-hidden flex flex-col gap-2.5"
      style={{ background: '#FFFFFF', border: '1px solid #F5D9A8' }}>
      <div className="absolute top-0 left-0 right-0 h-[3px]"
        style={{ background: 'linear-gradient(90deg, #D97706, #F59E0B, #D97706)' }} />

      {/* Date + slot + format row */}
      <div className="flex items-center justify-between gap-2">
        <span className="font-rajdhani text-xs font-semibold" style={{ color: '#B45309' }}>
          {formatDate(match.game_date)} · {match.match_time
            ? match.match_time.slice(0, 5).replace(/^0/, '') + ' ' + (parseInt(match.match_time, 10) < 12 ? 'AM' : 'PM')
            : slotLabel(match.slot_time)}
        </span>
        <div className="flex items-center gap-1.5 flex-shrink-0">
          <span className="font-rajdhani text-[10px] font-bold px-2 py-0.5 rounded-full uppercase tracking-wide"
            style={{ background: '#D1FAE5', color: '#059669' }}>
            ✓ Selected
          </span>
          <span className="font-rajdhani text-[10px] font-bold px-2 py-0.5 rounded-full uppercase tracking-wide"
            style={{ background: '#DBEAFE', color: '#1D4ED8' }}>
            {match.format}
          </span>
        </div>
      </div>

      {/* Tournament + opponent + ground + match_stage */}
      <div>
        <p className="font-cinzel text-base font-bold leading-snug" style={{ color: '#1C1917' }}>
          {match.tournament?.cricheroes_points_table_url ? (
            <a href={match.tournament.cricheroes_points_table_url} target="_blank" rel="noopener noreferrer"
              style={{ color: '#1C1917', textDecoration: 'underline', textDecorationColor: '#D97706', textUnderlineOffset: '3px' }}>
              {match.tournament?.name}
            </a>
          ) : (
            match.tournament?.name ?? 'Match'
          )}
        </p>
        <p className="font-rajdhani text-sm mt-0.5" style={{ color: '#57534E' }}>
          vs <span style={{ color: '#44403C', fontWeight: 500 }}>{match.opponent_name ?? 'TBD'}</span>
        </p>
        {(ground?.name || match.match_stage) && (
          <div className="flex items-center justify-between mt-1 gap-2">
            <p className="font-rajdhani text-xs" style={{ color: '#78716C' }}>
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
                style={{ background: '#FEF3C7', color: '#B45309', border: '1px solid #F5D9A8' }}>
                {stageIcon(match.match_stage)} {match.match_stage}
              </span>
            )}
          </div>
        )}
      </div>

      <div className="h-px" style={{ background: '#E7E0D3' }} />

      {/* Icon row — ball, jersey, CricHeroes, ground, hospital */}
      <div className="flex items-center gap-3.5">
        <div className="flex flex-col items-center gap-0.5">
          <BallIcon type={ballType} size={20} />
          <span className="font-rajdhani text-[9px] capitalize" style={{ color: '#A8A29E' }}>{ballType} ball</span>
        </div>
        <div className="flex flex-col items-center gap-0.5">
          <JerseyIcon colour={jColour} size={20} />
          <span className="font-rajdhani text-[9px]" style={{ color: '#A8A29E' }}>{jLabel}</span>
        </div>
        <div className="flex-1" />
        {match.cricheroes_url && (
          <a href={match.cricheroes_url} target="_blank" rel="noopener noreferrer" title="Open in CricHeroes"
            className="flex flex-col items-center gap-0.5" style={{ textDecoration: 'none' }}>
            <CricHeroesIcon size={20} />
            <span className="font-rajdhani text-[9px]" style={{ color: '#A8A29E' }}>CricHeroes</span>
          </a>
        )}
        {hasGround && (
          <a href={ground!.maps_url!} target="_blank" rel="noopener noreferrer" title="Open ground in Google Maps"
            className="flex flex-col items-center gap-0.5" style={{ textDecoration: 'none' }}>
            <MapPinIcon size={18} />
            <span className="font-rajdhani text-[9px]" style={{ color: '#A8A29E' }}>Ground</span>
          </a>
        )}
        {hasHosp && (
          <a href={ground!.hospital_url!} target="_blank" rel="noopener noreferrer" title="Nearest hospital"
            className="flex flex-col items-center gap-0.5" style={{ textDecoration: 'none' }}>
            <HospitalIcon size={18} />
            <span className="font-rajdhani text-[9px]" style={{ color: '#A8A29E' }}>Hospital</span>
          </a>
        )}
      </div>

      {/* Announced squad — collapsible, same as FixturesCard */}
      <div>
        <div className="h-px mb-1.5" style={{ background: '#E7E0D3' }} />
        <button
          onClick={() => setSquadOpen(v => !v)}
          className="w-full flex items-center justify-between py-1"
          style={{ background: 'none', border: 'none', cursor: 'pointer' }}
        >
          <span className="font-rajdhani text-[11px] font-bold uppercase tracking-wide" style={{ color: '#059669' }}>
            ✅ Squad Announced · {match.squad.length} players
          </span>
          <span className="text-sm" style={{ color: '#A8A29E' }}>{squadOpen ? '▲' : '▼'}</span>
        </button>

        {match.feePerPlayer != null && (
          <div className="font-rajdhani text-xs pt-1.5 mt-0.5" style={{ color: '#78716C', borderTop: '1px solid #F1EBDD' }}>
            💰 Match fee: <span style={{ color: '#B45309', fontWeight: 700 }}>₹{match.feePerPlayer}</span> per player
            {match.isLoggedInPlayerExempt && (
              <span style={{ color: '#A8A29E', marginLeft: '6px' }}>· You are exempt</span>
            )}
          </div>
        )}

        {match.feePerPlayer != null && !match.isLoggedInPlayerExempt && match.loggedInWalletBalance != null && (
          <div className="font-rajdhani text-xs mt-1" style={{ color: '#78716C' }}>
            Your wallet after this match:{' '}
            <span style={{
              fontWeight: 700,
              color: (match.loggedInWalletBalance - match.feePerPlayer) < 0 ? '#D97706' : '#059669',
            }}>
              ₹{match.loggedInWalletBalance - match.feePerPlayer}
            </span>
            <span style={{ color: '#A8A29E', marginLeft: '4px' }}>
              (currently ₹{match.loggedInWalletBalance} · −₹{match.feePerPlayer})
            </span>
          </div>
        )}

        {squadOpen && (
          <div className="grid grid-cols-2 gap-x-3 gap-y-1.5 pb-1 pt-2">
            {match.squad.map(p => (
              <div key={p.id} className="font-rajdhani text-xs" style={{ color: p.id === viewerPlayerId ? '#B45309' : '#44403C' }}>
                {p.id ? (
                  <a href={`/players/${p.id}/stats`} style={{ color: 'inherit', textDecoration: 'underline', textDecorationColor: '#D4C9B0' }}>
                    {p.name}
                  </a>
                ) : p.cricheroes_url ? (
                  <a href={p.cricheroes_url} target="_blank" rel="noopener noreferrer"
                    style={{ color: 'inherit', textDecoration: 'underline', textDecorationColor: '#D4C9B0' }}>
                    {p.name}
                  </a>
                ) : (
                  p.name
                )}
                {p.is_match_captain && (
                  <span className="ml-1 font-bold px-1 rounded" style={{ fontSize: '9px', color: '#B45309', background: '#FEF3C7', border: '1px solid #F5D9A8' }}>C</span>
                )}
                {p.is_vc && (
                  <span className="ml-1 font-bold px-1 rounded" style={{ fontSize: '9px', color: '#B45309', background: '#FEF3C7', border: '1px solid #F5D9A8', opacity: 0.8 }}>VC</span>
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
