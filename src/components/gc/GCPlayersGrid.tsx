// src/components/gc/GCPlayersGrid.tsx
'use client'
import { useState } from 'react'

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
  status: string   // 'active' | 'inactive' | 'expelled'
  active: boolean
}

type StatusFilter = 'active' | 'inactive' | 'expelled' | 'all'

function skillShort(s: string | null) {
  if (!s) return null
  const map: Record<string, string> = {
    'Opening Batsman':      'Opener',
    'Top Order Batsman':    'Top Order',
    'Middle Order Batsman': 'Mid Order',
    'Lower Order Batsman':  'Lower Order',
    'Wicket Keeping Batsman': 'WK Bat',
    'Fast Medium Bowler':   'FM Bowl',
    'Medium Pace Bowler':   'Med Pace',
    'Off Break Bowler':     'Off Break',
    'Leg Break Bowler':     'Leg Break',
  }
  for (const [k, v] of Object.entries(map)) {
    if (s.includes(k)) return v
  }
  return s.split(' ').slice(-2).join(' ')
}

const STATUS_OPTIONS: { value: StatusFilter; label: string }[] = [
  { value: 'active',   label: 'Active' },
  { value: 'inactive', label: 'Inactive' },
  { value: 'expelled', label: 'Expelled' },
  { value: 'all',      label: 'All' },
]

export function GCPlayersGrid({ players }: { players: Player[] }) {
  const [search,       setSearch]       = useState('')
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('active')

  const counts = {
    active:   players.filter(p => p.status === 'active').length,
    inactive: players.filter(p => p.status === 'inactive').length,
    expelled: players.filter(p => p.status === 'expelled').length,
    all:      players.length,
  }

  const filtered = players.filter(p => {
    const matchesStatus = statusFilter === 'all' || p.status === statusFilter
    const matchesSearch =
      p.name.toLowerCase().includes(search.toLowerCase()) ||
      (p.jersey_name ?? '').toLowerCase().includes(search.toLowerCase())
    return matchesStatus && matchesSearch
  })

  return (
    <div>
      {/* Filter bar */}
      <div className="flex flex-wrap items-center gap-4 mb-6
                      pb-4 border-b border-stone-300">

        {/* Status radio pills */}
        <div className="flex items-center gap-2 flex-wrap">
          {STATUS_OPTIONS.map(opt => {
            const active = statusFilter === opt.value
            return (
              <label key={opt.value}
                className="flex items-center gap-1.5 cursor-pointer select-none">
                <input
                  type="radio"
                  name="statusFilter"
                  value={opt.value}
                  checked={active}
                  onChange={() => setStatusFilter(opt.value)}
                  className="accent-amber-600"
                />
                <span className={`font-rajdhani text-sm font-semibold transition-colors ${
                  active ? 'text-amber-700' : 'text-stone-500 hover:text-stone-700'
                }`}>
                  {opt.label}
                  <span className={`ml-1 font-normal ${
                    active ? 'text-amber-600' : 'text-stone-400'
                  }`}>
                    ({counts[opt.value]})
                  </span>
                </span>
              </label>
            )
          })}
        </div>

        {/* Search */}
        <input
          type="text"
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Search by name or jersey…"
          className="ml-auto w-full sm:w-56 bg-parchment-3 border border-stone-300 rounded
                     px-3 py-1.5 font-rajdhani text-sm text-stone-800
                     placeholder-stone-400 focus:outline-none focus:border-amber-500
                     focus:ring-1 focus:ring-amber-500/30"
        />
      </div>

      {/* Result count */}
      <p className="font-rajdhani text-xs font-bold tracking-widest uppercase
                    text-stone-400 mb-4">
        {filtered.length} player{filtered.length !== 1 ? 's' : ''}
        {search && ` matching "${search}"`}
      </p>

      {/* Cards grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
        {filtered.map(p => {
          const hasDues   = p.wallet_balance < 0
          const inducted  = p.inducted_on
            ? new Date(p.inducted_on).getFullYear()
            : null
          const isExpelled = p.status === 'expelled'
          const isInactive = p.status === 'inactive'

          return (
            <div key={p.id}
              className={`bg-parchment-2 border rounded-lg p-4 flex flex-col gap-3
                          transition-colors hover:border-amber-400
                          ${isExpelled ? 'border-red-300 opacity-75'
                            : isInactive ? 'border-stone-300 opacity-80'
                            : 'border-stone-300'}`}>

              {/* Avatar + name row */}
              <div className="flex items-center gap-3">
                <img
                  src={p.photo_url ?? '/default-avatar.png'}
                  alt={p.name}
                  className="w-10 h-10 rounded-full object-cover border border-stone-300 flex-shrink-0"
                />
                <div className="min-w-0 flex-1">
                  {/* Player name — CricHeroes hyperlink per U-1 pattern */}
                  {p.cricheroes_url ? (
                    <a href={p.cricheroes_url} target="_blank" rel="noopener noreferrer"
                       className="font-rajdhani text-sm font-bold text-amber-700
                                  hover:text-amber-800 hover:underline underline-offset-2
                                  truncate block leading-tight">
                      {p.name}
                    </a>
                  ) : (
                    <span className="font-rajdhani text-sm font-bold text-stone-800
                                     truncate block leading-tight">
                      {p.name}
                    </span>
                  )}
                  {/* Jersey */}
                  {(p.jersey_name || p.jersey_number != null) && (
                    <p className="font-rajdhani text-xs text-stone-500 leading-tight mt-0.5">
                      #{p.jersey_number ?? '—'} · {p.jersey_name ?? '—'}
                    </p>
                  )}
                </div>
              </div>

              {/* Skill + role pills */}
              <div className="flex flex-wrap gap-1.5">
                {p.primary_skill && (
                  <span className="font-rajdhani text-xs font-semibold tracking-wide
                                   bg-amber-50 border border-amber-300 text-amber-700
                                   px-2 py-0.5 rounded-full">
                    {skillShort(p.primary_skill)}
                  </span>
                )}
                {p.secondary_skill && p.secondary_skill !== p.primary_skill && (
                  <span className="font-rajdhani text-xs font-semibold tracking-wide
                                   bg-stone-100 border border-stone-300 text-stone-600
                                   px-2 py-0.5 rounded-full">
                    {skillShort(p.secondary_skill)}
                  </span>
                )}
                {p.is_captain && (
                  <span className="font-rajdhani text-xs font-bold tracking-wide
                                   bg-red-50 border border-red-300 text-red-700
                                   px-2 py-0.5 rounded-full">
                    CAPTAIN
                  </span>
                )}
                {isExpelled && (
                  <span className="font-rajdhani text-xs font-bold tracking-wide
                                   bg-red-100 border border-red-400 text-red-700
                                   px-2 py-0.5 rounded-full">
                    EXPELLED
                  </span>
                )}
                {isInactive && (
                  <span className="font-rajdhani text-xs font-bold tracking-wide
                                   bg-stone-100 border border-stone-400 text-stone-600
                                   px-2 py-0.5 rounded-full">
                    INACTIVE
                  </span>
                )}
              </div>

              {/* Wallet + inducted */}
              <div className="flex items-center justify-between mt-auto pt-2
                              border-t border-stone-200">
                <span className={`font-rajdhani text-sm font-semibold ${
                  hasDues ? 'text-amber-600' : 'text-emerald-600'
                }`}>
                  ₹{p.wallet_balance.toLocaleString('en-IN')}
                  {hasDues && <span className="ml-1 text-xs">⚠ dues</span>}
                </span>
                {inducted && (
                  <span className="font-rajdhani text-xs text-stone-400">
                    Since {inducted}
                  </span>
                )}
              </div>
            </div>
          )
        })}
      </div>

      {filtered.length === 0 && (
        <div className="text-center py-16">
          <p className="font-rajdhani text-sm text-stone-500">
            {search
              ? `No ${statusFilter === 'all' ? '' : statusFilter + ' '}players match "${search}"`
              : `No ${statusFilter} players`}
          </p>
        </div>
      )}
    </div>
  )
}