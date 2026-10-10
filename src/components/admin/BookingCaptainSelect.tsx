'use client'

import { useEffect, useState } from 'react'
import { CAPTAIN_PLAYER_PREFIX } from '@/lib/bookingCaptainShared'

export type CaptainChoice = { id: string; name: string; active: boolean; player_id?: string | null }
type PlayerChoice = { id: string; name: string; status?: string }

function todayISTString(): string {
  return new Date(Date.now() + 5.5 * 60 * 60 * 1000).toISOString().split('T')[0]
}

/**
 * Captain picker for the admin booking forms. For an upcoming game it lists
 * active captains only (plus whoever is already selected). For a past game
 * it lists every captain, inactive ones included, plus any other player —
 * the person who led an already-played match may have since gone inactive,
 * or may have stood in without ever being a captain. A player pick has the
 * value `player:<id>`; the API turns it into a captain record.
 */
export default function BookingCaptainSelect({
  captains, value, onChange, gameDate, disabled,
}: {
  captains: CaptainChoice[]
  value: string
  onChange: (v: string) => void
  gameDate: string
  disabled?: boolean
}) {
  const isPast = !!gameDate && gameDate < todayISTString()
  const [players, setPlayers] = useState<PlayerChoice[]>([])

  useEffect(() => {
    if (!isPast || players.length > 0) return
    fetch('/api/players').then(r => r.json()).then(d => setPlayers(d.players ?? [])).catch(() => {})
  }, [isPast, players.length])

  const captainPlayerIds = new Set(captains.map(c => c.player_id).filter(Boolean) as string[])
  const otherPlayers = players.filter(p => p.status !== 'expelled' && !captainPlayerIds.has(p.id))
  const visibleCaptains = isPast ? captains : captains.filter(c => c.active || c.id === value)

  return (
    <div>
      <select
        value={value}
        onChange={e => onChange(e.target.value)}
        disabled={disabled}
        className="form-input disabled:opacity-50 disabled:cursor-not-allowed"
      >
        <option value="">No captain</option>
        <optgroup label="Captains">
          {visibleCaptains.map(c => (
            <option key={c.id} value={c.id}>{c.name}{!c.active ? ' (inactive)' : ''}</option>
          ))}
        </optgroup>
        {isPast && otherPlayers.length > 0 && (
          <optgroup label="Other players">
            {otherPlayers.map(p => (
              <option key={p.id} value={`${CAPTAIN_PLAYER_PREFIX}${p.id}`}>{p.name}</option>
            ))}
          </optgroup>
        )}
      </select>
      {isPast && (
        <p className="font-rajdhani text-xs text-stone-500 dark:text-zinc-500 mt-1">
          Past match — any captain (including inactive) or any player can be chosen.
        </p>
      )}
    </div>
  )
}
