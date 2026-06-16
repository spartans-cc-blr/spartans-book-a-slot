'use client'
// src/components/gc/GCPlayersGrid.tsx
// Theme: Slate & Teal
// Security: no write paths. wallet_balance, status are read-only display only.

import { useState, useMemo } from 'react'
import { PlayerNameLink } from '@/lib/playerLink'

type Player = {
  id: string
  name: string
  photo_url: string | null
  jersey_name: string | null
  jersey_number: number | null
  primary_skill: string | null
  secondary_skill: string | null
  cricheroes_url: string | null
  wallet_balance: number
  inducted_on: string | null
  is_captain: boolean
  status: string
  active: boolean
}

type StatusFilter = 'active' | 'inactive' | 'expelled' | 'all'

const SKILL_SHORT: Record<string, string> = {
  'Opening Batsman':        'Opener',
  'Top Order Batsman':      'Top Order',
  'Middle Order Batsman':   'Mid Order',
  'Lower Order Batsman':    'Lower Order',
  'Wicket Keeping Batsman': 'WK Bat',
  'Fast Medium Bowler':     'FM Bowl',
  'Medium Pace Bowler':     'Med Pace',
  'Off Break Bowler':       'Off Break',
  'Leg Break Bowler':       'Leg Break',
}

function skillShort(s: string | null) {
  if (!s) return null
  for (const [k, v] of Object.entries(SKILL_SHORT)) {
    if (s.includes(k)) return v
  }
  return s.split(' ').slice(-2).join(' ')
}

function inductedYear(d: string | null) {
  return d ? String(new Date(d).getFullYear()) : null
}

function initials(name: string) {
  return name.split(' ').filter(Boolean).slice(0, 2).map(w => w[0]).join('').toUpperCase()
}

function isActivePlayer(p: Player)   { return p.status === 'active'   }
function isInactivePlayer(p: Player) { return p.status === 'inactive' }
function isExpelledPlayer(p: Player) { return p.status === 'expelled' }

const STATUS_OPTIONS: { value: StatusFilter; label: string }[] = [
  { value: 'active',   label: 'Active'   },
  { value: 'inactive', label: 'Inactive' },
  { value: 'expelled', label: 'Expelled' },
  { value: 'all',      label: 'All'      },
]

const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('')

export function GCPlayersGrid({ players }: { players: Player[] }) {
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('active')
  const [letterFilter, setLetterFilter] = useState<string | null>(null)
  const [duesOnly,     setDuesOnly]     = useState(false)

  // Mirror admin page status logic exactly
  const counts = useMemo(() => ({
    active:   players.filter(isActivePlayer).length,
    inactive: players.filter(isInactivePlayer).length,
    expelled: players.filter(isExpelledPlayer).length,
    all:      players.length,
  }), [players])

  // Which letters have players in the current status filter
  const availableLetters = useMemo(() => {
    const statusFiltered = players.filter(p => {
      if (statusFilter === 'active')   return isActivePlayer(p)
      if (statusFilter === 'inactive') return isInactivePlayer(p)
      if (statusFilter === 'expelled') return isExpelledPlayer(p)
      return true
    })
    const duesFiltered = duesOnly ? statusFiltered.filter(p => p.wallet_balance < 0) : statusFiltered
    return new Set(duesFiltered.map(p => p.name[0]?.toUpperCase()).filter(Boolean))

  }, [players, statusFilter])

  const filtered = useMemo(() => players.filter(p => {
    const matchesStatus =
      statusFilter === 'all'      ? true :
      statusFilter === 'active'   ? isActivePlayer(p) :
      statusFilter === 'inactive' ? isInactivePlayer(p) :
      isExpelledPlayer(p)

    const matchesLetter = !letterFilter
      || p.name[0]?.toUpperCase() === letterFilter

    const matchesDues   = !duesOnly || p.wallet_balance < 0
  
    return matchesStatus && matchesLetter && matchesDues
  }), [players, statusFilter, letterFilter, duesOnly])

  // Reset letter when status changes if that letter has no players in new filter
  function handleStatusChange(val: StatusFilter) {
    setStatusFilter(val)
    setLetterFilter(null)
  }

  function handleDuesToggle() {
    setDuesOnly(v => !v)
    setLetterFilter(null)
  }

  return (
    <div>

      {/* ── Status radio pills ─────────────────────────────────────────── */}
      <div className="flex flex-wrap items-center gap-3 pb-4 mb-0 border-b border-[#CBD5DC]">
        {/* dues count for context */}
        {STATUS_OPTIONS.map(opt => {
          const isActive = statusFilter === opt.value
          return (
            <label key={opt.value} className="flex items-center gap-1.5 cursor-pointer select-none">
              <input
                type="radio"
                name="gcPlayerStatus"
                value={opt.value}
                checked={isActive}
                onChange={() => handleStatusChange(opt.value)}
                className="accent-[#1D9E75] w-3.5 h-3.5"
              />
              <span className={`font-rajdhani text-sm font-semibold transition-colors ${
                isActive ? 'text-[#0F6E56]' : 'text-slate-500 hover:text-slate-700'
              }`}>
                {opt.label}
                <span className={`ml-1 font-normal text-xs ${
                  isActive ? 'text-[#1D9E75]' : 'text-slate-400'
                }`}>
                  ({counts[opt.value]})
                </span>
              </span>
            </label>
          )
        })}
        {/* Dues toggle — right side of the same row */}
        <button
          onClick={handleDuesToggle}
          className={`ml-auto flex items-center gap-2 px-3 py-1.5 rounded-lg border
                      font-rajdhani text-xs font-semibold transition-colors ${
                        duesOnly
                          ? 'bg-amber-50 border-amber-400 text-amber-700'
                          : 'bg-white border-[#CBD5DC] text-slate-500 hover:border-amber-300 hover:text-amber-600'
          }`}
          aria-pressed={duesOnly}
        >
          <span className={`w-2 h-2 rounded-full flex-shrink-0 ${duesOnly ? 'bg-amber-500' : 'bg-slate-300'}`} />
          Dues outstanding
          {duesOnly && (
            <span className="ml-1 font-normal text-amber-500">
              ({filtered.length})
            </span>
          )}
        </button>
      </div>

      {/* ── A–Z alphabet bar ───────────────────────────────────────────── */}
      <div className="flex flex-wrap gap-1 py-3 mb-4 border-b border-[#CBD5DC]">
        {/* All pill */}
        <button
          onClick={() => setLetterFilter(null)}
          className={`font-rajdhani text-xs font-bold w-8 h-7 rounded transition-colors ${
            letterFilter === null
              ? 'bg-[#1D9E75] text-white'
              : 'text-slate-500 hover:text-[#0F6E56] hover:bg-[#E1F5EE]'
          }`}
        >
          All
        </button>

        {ALPHABET.map(letter => {
          const hasPlayers = availableLetters.has(letter)
          const isSelected = letterFilter === letter
          return (
            <button
              key={letter}
              onClick={() => hasPlayers ? setLetterFilter(isSelected ? null : letter) : undefined}
              disabled={!hasPlayers}
              className={`font-rajdhani text-xs font-bold w-7 h-7 rounded transition-colors ${
                isSelected
                  ? 'bg-[#1D9E75] text-white'
                  : hasPlayers
                    ? 'text-[#0F6E56] hover:bg-[#E1F5EE]'
                    : 'text-slate-300 cursor-default'
              }`}
            >
              {letter}
            </button>
          )
        })}
      </div>

      {/* ── Result count eyebrow ───────────────────────────────────────── */}
      <p className="font-rajdhani text-xs font-bold tracking-widest uppercase text-slate-400 mb-4">
        {filtered.length} player{filtered.length !== 1 ? 's' : ''}
        {duesOnly && <span className="normal-case font-normal tracking-normal ml-1 text-amber-500">with dues outstanding</span>}
        {letterFilter && <span className="normal-case font-normal tracking-normal ml-1">starting with &ldquo;{letterFilter}&rdquo;</span>}
      </p>

      {/* ── Cards grid ─────────────────────────────────────────────────── */}
      {filtered.length > 0 ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {filtered.map(p => {
            const hasDues    = p.wallet_balance < 0
            const expelled   = isExpelledPlayer(p)
            const inactive   = isInactivePlayer(p)
            const year       = inductedYear(p.inducted_on)

            return (
              <div
                key={p.id}
                className={[
                  'bg-white rounded-xl border-l-[3px] border-[#CBD5DC] p-4',
                  'flex flex-col gap-3 transition-all hover:border-l-[#1D9E75] hover:shadow-sm',
                  expelled ? 'opacity-60' : '',
                  inactive && !expelled ? 'opacity-75' : '',
                ].filter(Boolean).join(' ')}
              >
                {/* Avatar + name */}
                <div className="flex items-center gap-3">
                  {p.photo_url ? (
                    <img
                      src={p.photo_url}
                      alt={p.name}
                      className="w-10 h-10 rounded-full object-cover border border-[#CBD5DC] flex-shrink-0"
                    />
                  ) : (
                    <div className="w-10 h-10 rounded-full bg-[#E1F5EE] border border-[#5DCAA5]
                                    flex items-center justify-center flex-shrink-0">
                      <span className="font-rajdhani text-sm font-bold text-[#0F6E56]">
                        {initials(p.name)}
                      </span>
                    </div>
                  )}
                  <div className="min-w-0 flex-1">
                    <PlayerNameLink
                      name={p.name}
                      cricHeroesUrl={p.cricheroes_url}
                      className="font-rajdhani text-sm font-semibold text-[#0F6E56] block truncate leading-tight"
                    />
                    {(p.jersey_name || p.jersey_number != null) && (
                      <p className="font-rajdhani text-xs text-slate-500 leading-tight mt-0.5 truncate">
                        {p.jersey_number != null && `#${p.jersey_number}`}
                        {p.jersey_number != null && p.jersey_name && ' · '}
                        {p.jersey_name}
                      </p>
                    )}
                  </div>
                </div>

                {/* Pills */}
                <div className="flex flex-wrap gap-1.5">
                  {p.primary_skill && (
                    <span className="font-rajdhani text-xs font-semibold bg-[#E1F5EE] border border-[#5DCAA5] text-[#085041] px-2 py-0.5 rounded-full">
                      {skillShort(p.primary_skill)}
                    </span>
                  )}
                  {p.secondary_skill && p.secondary_skill !== p.primary_skill && (
                    <span className="font-rajdhani text-xs font-semibold bg-slate-100 border border-slate-300 text-slate-600 px-2 py-0.5 rounded-full">
                      {skillShort(p.secondary_skill)}
                    </span>
                  )}
                  {p.is_captain && (
                    <span className="font-rajdhani text-xs font-bold bg-red-50 border border-red-300 text-red-700 px-2 py-0.5 rounded-full">
                      Captain
                    </span>
                  )}
                  {expelled && (
                    <span className="font-rajdhani text-xs font-bold bg-red-100 border border-red-400 text-red-800 px-2 py-0.5 rounded-full">
                      Expelled
                    </span>
                  )}
                  {inactive && !expelled && (
                    <span className="font-rajdhani text-xs font-semibold bg-slate-100 border border-slate-400 text-slate-600 px-2 py-0.5 rounded-full">
                      Inactive
                    </span>
                  )}
                </div>

                {/* Wallet + inducted */}
                <div className="flex items-center justify-between mt-auto pt-2.5 border-t border-[#E2EAF0]">
                  <span className={`font-rajdhani text-sm font-semibold ${hasDues ? 'text-amber-600' : 'text-emerald-600'}`}>
                    ₹{p.wallet_balance.toLocaleString('en-IN')}
                    {hasDues && <span className="ml-1 text-xs font-normal text-amber-500">⚠ dues</span>}
                  </span>
                  {year && <span className="font-rajdhani text-xs text-slate-400">Since {year}</span>}
                </div>
              </div>
            )
          })}
        </div>
      ) : (
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <span className="text-4xl mb-3 opacity-30">🏏</span>
          <p className="font-rajdhani text-sm text-slate-500">
            No {statusFilter === 'all' ? '' : statusFilter + ' '}players
            {duesOnly ? ' with dues outstanding' : ''}
            {letterFilter && ` starting with "${letterFilter}"`}
          </p>
          {letterFilter && (
            <button onClick={() => setLetterFilter(null)}
              className="mt-3 font-rajdhani text-xs text-[#1D9E75] hover:underline">
              Show all {statusFilter} players
            </button>
          )}
        </div>
      )}
    </div>
  )
}