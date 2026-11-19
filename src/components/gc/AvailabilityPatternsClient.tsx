'use client'

// Council "Availability Patterns" view. Filtering is client-side over the
// server-computed result; only the period is in the URL (it changes the
// fetch). Imports from availabilityPatternsCore only — never the server
// module. See .claude/rules/features/availability-patterns.md.

import { useMemo, useState } from 'react'
import Link from 'next/link'
import {
  DIMENSION_LABEL,
  FLAG_LABEL,
  describeFinding,
  pct,
  type PatternDimension,
  type PlayerPattern,
  type ReliabilityFlag,
} from '@/lib/availabilityPatternsCore'
import type { AvailabilityPatternsResult, PatternPeriod } from '@/lib/availabilityPatterns'

const PERIOD_LABEL: Record<PatternPeriod, string> = { '3': '3 months', '6': '6 months', '12': '12 months', all: 'All time' }
const PERIODS: PatternPeriod[] = ['3', '6', '12', 'all']
const DIMS: PatternDimension[] = ['captain', 'format', 'day', 'slot', 'ground']

type StatusFilter = 'active' | 'inactive' | 'all'
type TypeFilter = 'any' | PatternDimension | 'reliability' | 'everyone'

const pill = (on: boolean) =>
  `font-rajdhani text-xs font-semibold px-3 py-1 rounded-full border transition-colors ${
    on
      ? 'bg-[var(--fx-selected-bg)] text-[var(--fx-selected-text)] border-transparent'
      : 'bg-white dark:bg-ink-3 text-[#44403C] dark:text-zinc-400 border-[#D4C9B0] dark:border-ink-5 hover:text-amber-700 dark:hover:text-gold'
  }`

function formatDate(d: string | null) {
  if (!d) return ''
  return new Date(d + 'T00:00:00').toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })
}

export function AvailabilityPatternsClient({ result, period }: { result: AvailabilityPatternsResult; period: PatternPeriod }) {
  const [status, setStatus] = useState<StatusFilter>('active')
  const [type, setType] = useState<TypeFilter>('any')
  const [query, setQuery] = useState('')

  const byStatus = useMemo(
    () => result.players.filter(p => status === 'all' || p.status === status),
    [result.players, status],
  )

  const count = (t: TypeFilter) => byStatus.filter(p => matchesType(p, t)).length

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase()
    return byStatus
      .filter(p => matchesType(p, type))
      .filter(p => !q || p.name.toLowerCase().includes(q))
  }, [byStatus, type, query])

  return (
    <div>
      <div className="flex flex-wrap gap-1.5 mb-3">
        {PERIODS.map(p => (
          <Link key={p} replace scroll={false} href={p === '6' ? '/gc/availability-patterns' : `/gc/availability-patterns?period=${p}`} className={pill(p === period)}>
            {PERIOD_LABEL[p]}
          </Link>
        ))}
      </div>
      <p className="font-rajdhani text-xs text-[#78716C] dark:text-zinc-500 mb-4">
        {result.bookingCount} confirmed games{result.since ? ` from ${formatDate(result.since)}` : ''} to yesterday.
        Each player is measured only from their first response onward.
      </p>

      <div className="flex flex-wrap gap-1.5 mb-2">
        {(['active', 'inactive', 'all'] as StatusFilter[]).map(s => (
          <button key={s} onClick={() => setStatus(s)} className={pill(status === s)}>
            {s === 'all' ? 'All players' : s[0].toUpperCase() + s.slice(1)}
          </button>
        ))}
      </div>
      <div className="flex flex-wrap gap-1.5 mb-3">
        {(['any', 'captain', 'format', 'day', 'slot', 'ground', 'reliability', 'everyone'] as TypeFilter[]).map(t => (
          <button key={t} onClick={() => setType(t)} className={pill(type === t)}>
            {typeLabel(t)} <span className="opacity-70">{count(t)}</span>
          </button>
        ))}
      </div>
      <input
        value={query}
        onChange={e => setQuery(e.target.value)}
        placeholder="Search player"
        className="w-full sm:w-72 mb-4 px-3 py-2 rounded border font-rajdhani text-sm bg-white dark:bg-ink-3 border-[#D4C9B0] dark:border-ink-5 text-[#1C1917] dark:text-parchment"
      />

      {shown.length === 0
        ? <p className="font-rajdhani text-sm text-[#78716C] dark:text-zinc-500">No players match this filter.</p>
        : <div className="grid gap-3">{shown.map(p => <PlayerCard key={p.playerId} p={p} focus={type} />)}</div>}

      <details className="mt-8 font-rajdhani text-xs text-[#78716C] dark:text-zinc-500">
        <summary className="cursor-pointer font-semibold">How patterns are worked out</summary>
        <ul className="mt-2 space-y-1 list-disc pl-5">
          <li>Day is Sat, Sun, Weekdays (Mon–Fri) or Holidays (a weekday that is a Karnataka public holiday, or hosted a one-day tournament: two or more games of the same format in one tournament).</li>
          <li>A game counts as offered from the player&apos;s first response onward. Y, O and E count as available; no response counts as not available.</li>
          <li>&quot;Mostly&quot; or &quot;only&quot;: at least 6 available responses, 70% (or 90%) of them in one value, and at least 1.5× their rate elsewhere.</li>
          <li>&quot;Rarely&quot; or &quot;never&quot;: offered at least 6 times, available at half their usual rate or less, while available at least 30% of the time elsewhere.</li>
          <li>Captain and ground patterns are also checked against the player&apos;s day and format habits, so a captain who only leads weekday T30 games isn&apos;t blamed for a player who just doesn&apos;t play weekday T30s. A player&apos;s own games as captain are left out.</li>
          <li>Withdrawals are switches from Y/O/E to L by the player. Picked counts announced squads among the games they were available for.</li>
        </ul>
      </details>
    </div>
  )
}

function matchesType(p: PlayerPattern, t: TypeFilter): boolean {
  if (t === 'everyone') return true
  if (t === 'any') return p.findings.length > 0
  if (t === 'reliability') return p.flags.length > 0
  return p.findings.some(f => f.dim === t)
}

function typeLabel(t: TypeFilter): string {
  if (t === 'any') return 'Any habit'
  if (t === 'reliability') return 'Reliability'
  if (t === 'everyone') return 'Everyone'
  return DIMENSION_LABEL[t]
}

function PlayerCard({ p, focus }: { p: PlayerPattern; focus: TypeFilter }) {
  return (
    <div className="bg-white dark:bg-ink-3 border border-[#D4C9B0] dark:border-ink-5 rounded-lg p-4">
      <div className="flex items-baseline justify-between gap-2 flex-wrap">
        <Link href={`/players/${p.playerId}/stats`} className="font-rajdhani text-base font-bold text-[#1C1917] dark:text-parchment hover:text-amber-700 dark:hover:text-gold">
          {p.name}
        </Link>
        {p.status === 'inactive' && (
          <span className="font-rajdhani text-[11px] font-semibold uppercase tracking-wide text-[#78716C] dark:text-zinc-500">Inactive</span>
        )}
      </div>
      <p className="font-rajdhani text-xs text-[#78716C] dark:text-zinc-500 mt-0.5">
        Answered {p.answered} of {p.offered} games · available {p.yes} · leave {p.leave}
        {p.yes > 0 && ` · picked ${p.picked} of ${p.yes}`}
        {p.withdrawals > 0 && ` · withdrew ${p.withdrawals}`}
      </p>

      {(p.findings.length > 0 || p.flags.length > 0) && (
        <div className="flex flex-wrap gap-1.5 mt-2.5">
          {p.findings.map(f => (
            <span
              key={`${f.dim}-${f.key}-${f.kind}`}
              title={`${f.yes} of ${f.offered} (${pct(f.rate)}) here vs ${pct(f.otherRate)} elsewhere`}
              className={`font-rajdhani text-xs font-semibold px-2 py-0.5 rounded border ${
                f.kind === 'prefers'
                  ? 'bg-emerald-50 dark:bg-emerald-950/40 border-emerald-300 dark:border-emerald-800 text-emerald-700 dark:text-emerald-400'
                  : 'bg-red-50 dark:bg-red-950/40 border-red-300 dark:border-red-800 text-red-700 dark:text-red-400'
              } ${focus !== 'any' && focus !== 'everyone' && focus !== 'reliability' && f.dim !== focus ? 'opacity-50' : ''}`}
            >
              {describeFinding(f)} <span className="font-normal opacity-80">({f.yes}/{f.offered} vs {pct(f.otherRate)})</span>
            </span>
          ))}
          {p.flags.map((fl: ReliabilityFlag) => (
            <span key={fl} className="font-rajdhani text-xs font-semibold px-2 py-0.5 rounded border bg-amber-50 dark:bg-amber-950/40 border-amber-300 dark:border-amber-800 text-amber-700 dark:text-amber-400">
              {FLAG_LABEL[fl]}
            </span>
          ))}
        </div>
      )}

      <details className="mt-2.5">
        <summary className="cursor-pointer font-rajdhani text-xs font-semibold text-amber-700 dark:text-gold">Breakdown</summary>
        <div className="mt-2 grid gap-3 sm:grid-cols-2">
          {DIMS.map(dim => p.breakdown[dim]?.length ? (
            <div key={dim}>
              <p className="font-rajdhani text-[11px] font-bold uppercase tracking-wider text-[#78716C] dark:text-zinc-500 mb-1">{DIMENSION_LABEL[dim]}</p>
              <table className="w-full font-rajdhani text-xs">
                <tbody>
                  {p.breakdown[dim].map(v => (
                    <tr key={v.key} className="border-t border-[#EEEAE2] dark:border-ink-5">
                      <td className="py-0.5 pr-2 text-[#44403C] dark:text-zinc-300 truncate max-w-[10rem]">{v.label}</td>
                      <td className="py-0.5 text-right tabular-nums text-[#78716C] dark:text-zinc-500">{v.yes}/{v.offered}</td>
                      <td className="py-0.5 pl-2 w-20">
                        <div className="h-1.5 rounded bg-[#EEEAE2] dark:bg-ink-5">
                          <div className="h-1.5 rounded bg-amber-600 dark:bg-gold" style={{ width: `${Math.round(v.rate * 100)}%` }} />
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : null)}
        </div>
      </details>
    </div>
  )
}
