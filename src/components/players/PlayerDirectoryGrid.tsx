'use client'
// Player directory grid for /players — search, A–Z filter, and one card
// per player showing the career numbers that stand out for them
// (pickHighlights). Every card links to /players/[id]/stats.
// Themed with the shared --stats-* tokens (Light/Dark/System).
// See features/player-directory.md.

import { useMemo, useState } from 'react'
import Link from 'next/link'
import { PlayerAvatar } from '@/components/leaderboard/PlayerAvatar'
import { pickHighlights, type CareerHighlights } from '@/lib/playerHighlights'

export type DirectoryPlayer = {
  id: string
  name: string
  photo_url: string | null
  jersey_name: string | null
  jersey_number: number | null
  primary_skill: string | null
  secondary_skill: string | null
  is_captain: boolean
  last_played_on: string | null
  highlights: CareerHighlights | null
}

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

function formatLastPlayed(d: string | null) {
  if (!d) return null
  return new Date(d + 'T00:00:00').toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })
}

const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('')

export function PlayerDirectoryGrid({ players }: { players: DirectoryPlayer[] }) {
  const [query, setQuery] = useState('')
  const [letter, setLetter] = useState<string | null>(null)

  const q = query.trim().toLowerCase()
  const searched = useMemo(
    () => (q ? players.filter(p => p.name.toLowerCase().includes(q) || (p.jersey_name ?? '').toLowerCase().includes(q)) : players),
    [players, q],
  )
  const availableLetters = useMemo(
    () => new Set(searched.map(p => p.name[0]?.toUpperCase()).filter(Boolean)),
    [searched],
  )
  const filtered = letter ? searched.filter(p => p.name[0]?.toUpperCase() === letter) : searched

  return (
    <div>
      {/* Search */}
      <input
        type="search"
        value={query}
        onChange={e => { setQuery(e.target.value); setLetter(null) }}
        placeholder="Search by name or jersey name…"
        className="w-full md:max-w-sm font-rajdhani text-sm px-3 py-2 rounded-lg border
                   bg-[var(--stats-card-bg)] dark:bg-ink-3 border-[var(--stats-card-border)] dark:border-ink-5
                   text-[var(--stats-text)] dark:text-parchment placeholder:text-[var(--stats-text-faint)]
                   focus:outline-none focus:border-[var(--stats-accent)]"
      />

      {/* A–Z */}
      <div className="flex flex-wrap gap-1 py-3 mb-4 border-b border-[var(--stats-divider)] dark:border-ink-4">
        <button
          onClick={() => setLetter(null)}
          className={`font-rajdhani text-xs font-bold w-8 h-7 rounded transition-colors ${
            letter === null ? 'bg-[var(--stats-accent)] text-white dark:text-ink' : 'text-[var(--stats-text-muted)] hover:text-[var(--stats-accent)]'
          }`}
        >
          All
        </button>
        {ALPHABET.map(l => {
          const has = availableLetters.has(l)
          const on = letter === l
          return (
            <button
              key={l}
              onClick={() => has && setLetter(on ? null : l)}
              disabled={!has}
              className={`font-rajdhani text-xs font-bold w-7 h-7 rounded transition-colors ${
                on ? 'bg-[var(--stats-accent)] text-white dark:text-ink'
                  : has ? 'text-[var(--stats-text-2)] hover:text-[var(--stats-accent)]'
                  : 'text-[var(--stats-text-faint)] opacity-40 cursor-default'
              }`}
            >
              {l}
            </button>
          )
        })}
      </div>

      <p className="font-rajdhani text-xs font-bold tracking-widest uppercase text-[var(--stats-text-muted)] dark:text-zinc-500 mb-4">
        {filtered.length} player{filtered.length !== 1 ? 's' : ''}
      </p>

      {filtered.length > 0 ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {filtered.map(p => <PlayerCard key={p.id} p={p} />)}
        </div>
      ) : (
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <span className="text-4xl mb-3 opacity-30">🏏</span>
          <p className="font-rajdhani text-sm text-[var(--stats-text-muted)]">No players match that search</p>
        </div>
      )}
    </div>
  )
}

function PlayerCard({ p }: { p: DirectoryPlayer }) {
  const [headline, ...rest] = pickHighlights(p.highlights)
  const lastPlayed = formatLastPlayed(p.last_played_on)
  const primary = skillShort(p.primary_skill)
  const secondary = p.secondary_skill && p.secondary_skill !== p.primary_skill ? skillShort(p.secondary_skill) : null

  return (
    <Link
      href={`/players/${p.id}/stats`}
      className="group bg-[var(--stats-card-bg)] dark:bg-ink-3 border border-[var(--stats-card-border)] dark:border-ink-5
                 rounded-xl p-4 flex flex-col gap-3 transition-colors hover:border-[var(--stats-accent)]"
    >
      {/* Avatar + name */}
      <div className="flex items-center gap-3">
        <PlayerAvatar photoUrl={p.photo_url} name={p.name} />
        <div className="min-w-0 flex-1">
          <p className="font-rajdhani text-sm font-semibold text-[var(--stats-text)] dark:text-parchment truncate leading-tight group-hover:text-[var(--stats-accent)]">
            {p.name}
          </p>
          {(p.jersey_name || p.jersey_number != null) && (
            <p className="font-rajdhani text-xs text-[var(--stats-text-muted)] dark:text-zinc-500 leading-tight mt-0.5 truncate">
              {p.jersey_number != null && `#${p.jersey_number}`}
              {p.jersey_number != null && p.jersey_name && ' · '}
              {p.jersey_name}
            </p>
          )}
        </div>
      </div>

      {/* Skill pills */}
      {(primary || secondary || p.is_captain) && (
        <div className="flex flex-wrap gap-1.5">
          {primary && (
            <span className="font-rajdhani text-xs font-semibold bg-[var(--stats-badge-bg)] border border-[var(--stats-badge-border)] text-[var(--stats-badge-text)] px-2 py-0.5 rounded-full">
              {primary}
            </span>
          )}
          {secondary && (
            <span className="font-rajdhani text-xs font-semibold bg-[var(--stats-row-bg)] border border-[var(--stats-card-border)] text-[var(--stats-text-2)] px-2 py-0.5 rounded-full">
              {secondary}
            </span>
          )}
          {p.is_captain && (
            <span className="font-rajdhani text-xs font-bold bg-red-50 border border-red-300 text-red-700 dark:bg-red-950/40 dark:border-red-800 dark:text-red-400 px-2 py-0.5 rounded-full">
              Captain
            </span>
          )}
        </div>
      )}

      {/* Highlights */}
      {headline ? (
        <div className="rounded-lg bg-[var(--stats-row-bg)] dark:bg-ink-4 px-3 py-2">
          <p className="font-rajdhani text-[10px] font-bold tracking-widest uppercase text-[var(--stats-text-muted)] dark:text-zinc-500">
            {headline.label}
          </p>
          <p className="font-cinzel text-xl font-bold text-[var(--stats-accent)] dark:text-gold leading-tight">
            {headline.value}
          </p>
          {rest.length > 0 && (
            <p className="font-rajdhani text-xs text-[var(--stats-text-2)] dark:text-zinc-400 mt-1">
              {rest.map(h => `${h.label} ${h.value}`).join(' · ')}
            </p>
          )}
        </div>
      ) : (
        <p className="font-rajdhani text-xs text-[var(--stats-text-faint)] dark:text-zinc-600 italic">No synced stats yet</p>
      )}

      {/* Footer */}
      <div className="flex items-center justify-between mt-auto pt-2.5 border-t border-[var(--stats-divider)] dark:border-ink-4">
        <span className="font-rajdhani text-xs text-[var(--stats-text-muted)] dark:text-zinc-500">
          {p.highlights ? `${p.highlights.matches} match${p.highlights.matches !== 1 ? 'es' : ''}` : ''}
        </span>
        <span className="font-rajdhani text-xs text-[var(--stats-text-faint)] dark:text-zinc-600">
          {lastPlayed ? `Last played ${lastPlayed}` : 'Never played'}
        </span>
      </div>
    </Link>
  )
}
