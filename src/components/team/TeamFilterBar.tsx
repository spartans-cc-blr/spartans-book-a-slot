'use client'
// Filter bar for /team-stats ("Team Record") — see features/team-stats.md §3.
//
// Same URL-driven convention as LeaderboardFilters.tsx: the Server
// Component (src/app/team-stats/page.tsx) owns the data, this just pushes
// new searchParams on change so every view is a shareable link. Every
// filter is optional; an absent/invalid param means "no restriction".

import { useRouter } from 'next/navigation'
import type { FormatFilter, InningsFilter, StageFilter, SplitDimension } from '@/lib/teamStatsCore'
import { SPLIT_LABEL } from '@/lib/teamStatsCore'

export interface TeamFilterState {
  year:         string       // 'all' | 'YYYY'
  format:       FormatFilter
  tournament:   string       // 'all' | id
  ground:       string       // 'all' | id
  opponent:     string       // 'all' | opponentKey
  innings:      InningsFilter
  stage:        StageFilter
  practice:     boolean
  by:           SplitDimension
}

interface Props extends TeamFilterState {
  years:       string[]
  tournaments: { id: string; name: string }[]
  grounds:     { id: string; name: string }[]
  opponents:   { id: string; name: string }[]
}

const SELECT = 'form-input font-rajdhani text-xs py-1.5 truncate min-w-0 bg-[var(--stats-card-bg)] dark:bg-zinc-900 border-[var(--stats-card-border)] dark:border-zinc-700 text-[var(--stats-text)] dark:text-zinc-100'

const DIMENSIONS: SplitDimension[] = ['tournament', 'ground', 'opponent', 'format', 'stage', 'innings', 'toss', 'captain', 'year', 'month', 'slot']

function pillClass(active: boolean): string {
  return `font-rajdhani text-xs font-bold tracking-widest uppercase px-3 py-1.5 rounded border transition-colors whitespace-nowrap
    ${active
      ? 'bg-[var(--stats-badge-bg)] dark:bg-gold/20 border-[var(--stats-accent-dim)] dark:border-gold-dim text-[var(--stats-accent)] dark:text-gold'
      : 'border-[var(--stats-card-border)] dark:border-ink-5 text-[var(--stats-text-muted)] dark:text-zinc-500 hover:text-[var(--stats-text-2)] dark:hover:text-zinc-300'}`
}

export function TeamFilterBar(p: Props) {
  const router = useRouter()

  function navigate(next: Partial<Record<keyof TeamFilterState, string>>) {
    const current: Record<string, string> = {
      year: p.year, format: p.format, tournament: p.tournament, ground: p.ground,
      opponent: p.opponent, innings: p.innings, stage: p.stage,
      practice: p.practice ? '1' : '', by: p.by,
    }
    const merged = { ...current, ...next }
    const params = new URLSearchParams()
    for (const [k, v] of Object.entries(merged)) {
      if (!v || v === 'all') continue
      params.set(k, v)
    }
    const qs = params.toString()
    router.push(qs ? `/team-stats?${qs}` : '/team-stats')
  }

  const anyFilter = p.year !== 'all' || p.format !== 'all' || p.tournament !== 'all' || p.ground !== 'all'
    || p.opponent !== 'all' || p.innings !== 'all' || p.stage !== 'all' || p.practice

  return (
    <div className="flex flex-col gap-2 mb-5">
      {/* Row 1 — scope selects */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
        <select value={p.year} onChange={e => navigate({ year: e.target.value })} className={SELECT}>
          <option value="all">All time</option>
          {p.years.map(y => <option key={y} value={y}>{y}</option>)}
        </select>
        <select value={p.tournament} onChange={e => navigate({ tournament: e.target.value })} className={SELECT}>
          <option value="all">All tournaments</option>
          {p.tournaments.map(t => <option key={t.id} value={t.id} title={t.name}>{t.name}</option>)}
        </select>
        <select value={p.ground} onChange={e => navigate({ ground: e.target.value })} className={SELECT}>
          <option value="all">All grounds</option>
          {p.grounds.map(g => <option key={g.id} value={g.id} title={g.name}>{g.name}</option>)}
        </select>
        <select value={p.opponent} onChange={e => navigate({ opponent: e.target.value })} className={SELECT}>
          <option value="all">All opponents</option>
          {p.opponents.map(o => <option key={o.id} value={o.id} title={o.name}>{o.name}</option>)}
        </select>
      </div>

      {/* Row 2 — format / innings / stage / practice */}
      <div className="flex items-center gap-2 flex-wrap">
        <select value={p.format} onChange={e => navigate({ format: e.target.value })} className={`${SELECT} w-auto`}>
          <option value="all">All formats</option>
          <option value="T20">T20</option>
          <option value="T30">T30</option>
          <option value="other">Other (T10/T25)</option>
        </select>
        <select value={p.innings} onChange={e => navigate({ innings: e.target.value })} className={`${SELECT} w-auto`}>
          <option value="all">Defending + Chasing</option>
          <option value="defending">Defending only</option>
          <option value="chasing">Chasing only</option>
        </select>
        <select value={p.stage} onChange={e => navigate({ stage: e.target.value })} className={`${SELECT} w-auto`}>
          <option value="all">League + Knockout</option>
          <option value="league">League only</option>
          <option value="knockout">Knockout only</option>
        </select>
        <label className={`flex items-center gap-1.5 font-rajdhani text-xs font-bold tracking-widest uppercase cursor-pointer select-none
          ${p.practice ? 'text-[var(--stats-accent)] dark:text-gold' : 'text-[var(--stats-text-muted)] dark:text-zinc-500'}`}>
          <input type="checkbox" checked={p.practice} onChange={() => navigate({ practice: p.practice ? '' : '1' })} className="accent-[var(--stats-accent)] dark:accent-gold" />
          Include practice
        </label>
        {anyFilter && (
          <button onClick={() => router.push(p.by === 'tournament' ? '/team-stats' : `/team-stats?by=${p.by}`)}
            className="font-rajdhani text-xs font-bold tracking-widest uppercase text-[var(--stats-text-muted)] dark:text-zinc-500 hover:text-[var(--stats-accent)] dark:hover:text-gold ml-auto">
            Clear filters ✕
          </button>
        )}
      </div>

      {/* Row 3 — split dimension */}
      <div className="flex items-center gap-2 flex-wrap pt-1">
        <span className="font-rajdhani text-[10px] font-bold tracking-[3px] uppercase text-[var(--stats-text-faint)] dark:text-zinc-600 mr-1">Split by</span>
        {DIMENSIONS.map(d => (
          <button key={d} onClick={() => navigate({ by: d })} className={pillClass(p.by === d)}>{SPLIT_LABEL[d]}</button>
        ))}
      </div>
    </div>
  )
}
