'use client'
// src/components/gc/GCPlayersGrid.tsx
// Read-only player card grid for GC members.
// Theme: Slate & Teal  — #F0F4F5 bg · #0F3D42 headings · #1D9E75 teal accent
// Security: no write paths. wallet_balance, status are read-only display only.

import { useState, useMemo } from 'react'
import { PlayerNameLink } from '@/lib/playerLink'

// ── Types ─────────────────────────────────────────────────────────────────────

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

// ── Helpers ───────────────────────────────────────────────────────────────────

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

function skillShort(s: string | null): string | null {
  if (!s) return null
  for (const [k, v] of Object.entries(SKILL_SHORT)) {
    if (s.includes(k)) return v
  }
  return s.split(' ').slice(-2).join(' ')
}

function inductedYear(inducted_on: string | null): string | null {
  if (!inducted_on) return null
  return String(new Date(inducted_on).getFullYear())
}

// ── Status filter config ───────────────────────────────────────────────────────

const STATUS_OPTIONS: { value: StatusFilter; label: string }[] = [
  { value: 'active',   label: 'Active'   },
  { value: 'inactive', label: 'Inactive' },
  { value: 'expelled', label: 'Expelled' },
  { value: 'all',      label: 'All'      },
]

// ── Avatar initials ────────────────────────────────────────────────────────────

function initials(name: string): string {
  return name
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map(w => w[0])
    .join('')
    .toUpperCase()
}

// ── Main component ─────────────────────────────────────────────────────────────

export function GCPlayersGrid({ players }: { players: Player[] }) {
  const [search,       setSearch]       = useState('')
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('active')

  const counts = useMemo(() => ({
    active:   players.filter(p => p.status === 'active').length,
    inactive: players.filter(p => p.status === 'inactive').length,
    expelled: players.filter(p => p.status === 'expelled').length,
    all:      players.length,
  }), [players])

  const filtered = useMemo(() => players.filter(p => {
    const matchesStatus = statusFilter === 'all' || p.status === statusFilter
    const q = search.toLowerCase()
    const matchesSearch = !q
      || p.name.toLowerCase().includes(q)
      || (p.jersey_name ?? '').toLowerCase().includes(q)
      || String(p.jersey_number ?? '').includes(q)
    return matchesStatus && matchesSearch
  }), [players, statusFilter, search])

  return (
    <div>

      {/* ── Filter bar ─────────────────────────────────────────────────── */}
      <div className="flex flex-wrap items-center gap-3 mb-5 pb-4 border-b border-[#CBD5DC]">

        {/* Status radio pills */}
        <div className="flex items-center gap-2 flex-wrap">
          {STATUS_OPTIONS.map(opt => {
            const isActive = statusFilter === opt.value
            return (
              <label key={opt.value} className="flex items-center gap-1.5 cursor-pointer select-none">
                <input
                  type="radio"
                  name="gcPlayerStatus"
                  value={opt.value}
                  checked={isActive}
                  onChange={() => setStatusFilter(opt.value)}
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
        </div>

        {/* Search input — right-aligned */}
        <div className="ml-auto relative">
          <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none text-sm">
            🔍
          </span>
          <input
            type="text"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Name, jersey name or number…"
            className="pl-8 pr-3 py-1.5 w-60 rounded-lg border border-[#CBD5DC]
                       bg-[#E4ECF0] font-rajdhani text-sm text-slate-800
                       placeholder-slate-400
                       focus:outline-none focus:ring-2 focus:ring-[#1D9E75]/30
                       focus:border-[#1D9E75] transition-colors"
          />
          {search && (
            <button
              onClick={() => setSearch('')}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400
                         hover:text-slate-600 transition-colors text-xs"
              aria-label="Clear search"
            >
              ✕
            </button>
          )}
        </div>
      </div>

      {/* ── Result count eyebrow ───────────────────────────────────────── */}
      <p className="font-rajdhani text-xs font-bold tracking-widest uppercase text-slate-400 mb-4">
        {filtered.length} player{filtered.length !== 1 ? 's' : ''}
        {search && (
          <span className="normal-case font-normal tracking-normal ml-1">
            matching &ldquo;{search}&rdquo;
          </span>
        )}
      </p>

      {/* ── Cards grid ─────────────────────────────────────────────────── */}
      {filtered.length > 0 ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {filtered.map(p => {
            const hasDues    = p.wallet_balance < 0
            const isExpelled = p.status === 'expelled'
            const isInactive = p.status === 'inactive'
            const year       = inductedYear(p.inducted_on)

            return (
              <div
                key={p.id}
                className={[
                  'bg-white rounded-xl border-l-[3px] border-[#CBD5DC] p-4',
                  'flex flex-col gap-3 transition-all hover:border-l-[#1D9E75]',
                  'hover:shadow-sm',
                  isExpelled ? 'opacity-60' : '',
                  isInactive ? 'opacity-75' : '',
                ].filter(Boolean).join(' ')}
              >

                {/* Avatar + name ─────────────────────────────────────── */}
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
                    {/* PlayerNameLink — CricHeroes hyperlink per U-1 pattern */}
                    <PlayerNameLink
                      name={p.name}
                      cricHeroesUrl={p.cricheroes_url}
                      className="font-rajdhani text-sm font-semibold text-[#0F6E56]
                                 block truncate leading-tight"
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

                {/* Skill + role pills ─────────────────────────────────── */}
                <div className="flex flex-wrap gap-1.5">
                  {p.primary_skill && (
                    <span className="font-rajdhani text-xs font-semibold
                                     bg-[#E1F5EE] border border-[#5DCAA5] text-[#085041]
                                     px-2 py-0.5 rounded-full">
                      {skillShort(p.primary_skill)}
                    </span>
                  )}
                  {p.secondary_skill && p.secondary_skill !== p.primary_skill && (
                    <span className="font-rajdhani text-xs font-semibold
                                     bg-slate-100 border border-slate-300 text-slate-600
                                     px-2 py-0.5 rounded-full">
                      {skillShort(p.secondary_skill)}
                    </span>
                  )}
                  {p.is_captain && (
                    <span className="font-rajdhani text-xs font-bold
                                     bg-red-50 border border-red-300 text-red-700
                                     px-2 py-0.5 rounded-full">
                      Captain
                    </span>
                  )}
                  {isExpelled && (
                    <span className="font-rajdhani text-xs font-bold
                                     bg-red-100 border border-red-400 text-red-800
                                     px-2 py-0.5 rounded-full">
                      Expelled
                    </span>
                  )}
                  {isInactive && (
                    <span className="font-rajdhani text-xs font-semibold
                                     bg-slate-100 border border-slate-400 text-slate-600
                                     px-2 py-0.5 rounded-full">
                      Inactive
                    </span>
                  )}
                </div>

                {/* Wallet + inducted ──────────────────────────────────── */}
                <div className="flex items-center justify-between mt-auto pt-2.5
                                border-t border-[#E2EAF0]">
                  <span className={`font-rajdhani text-sm font-semibold ${
                    hasDues ? 'text-amber-600' : 'text-emerald-600'
                  }`}>
                    ₹{p.wallet_balance.toLocaleString('en-IN')}
                    {hasDues && (
                      <span className="ml-1 text-xs font-normal text-amber-500">
                        ⚠ dues
                      </span>
                    )}
                  </span>
                  {year && (
                    <span className="font-rajdhani text-xs text-slate-400">
                      Since {year}
                    </span>
                  )}
                </div>

              </div>
            )
          })}
        </div>
      ) : (
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <span className="text-4xl mb-3 opacity-30">🏏</span>
          <p className="font-rajdhani text-sm text-slate-500">
            {search
              ? `No ${statusFilter === 'all' ? '' : statusFilter + ' '}players match "${search}"`
              : `No ${statusFilter} players`}
          </p>
          {search && (
            <button
              onClick={() => setSearch('')}
              className="mt-3 font-rajdhani text-xs text-[#1D9E75] hover:underline"
            >
              Clear search
            </button>
          )}
        </div>
      )}

    </div>
  )
}
