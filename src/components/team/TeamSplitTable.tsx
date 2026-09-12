'use client'
// One table shape for every Team Record split — see features/team-stats.md §3.
// Each row is a group (a tournament, a ground, an opponent, ...) with
// P/W/L/win%/last-5 form; tapping a row expands the actual matches behind
// the number, each linking to its scorecard on /matches/history/[bookingId].
// "Every possible thing that can be sliced and diced" is the whole point —
// no summary here is ever more than one tap from the matches that produced it.

import { Fragment, useState } from 'react'
import Link from 'next/link'
import type { SplitRow, TeamMatch, FormLetter } from '@/lib/teamStatsCore'
import { scoreString, winMargin, summarize, recentForm, sortNewestFirst } from '@/lib/teamStatsCore'

export function FormPills({ form, size = 'sm' }: { form: FormLetter[]; size?: 'sm' | 'lg' }) {
  if (form.length === 0) return <span className="text-[var(--stats-text-faint)] dark:text-zinc-600">—</span>
  const box = size === 'lg' ? 'w-8 h-8 text-sm' : 'w-5 h-5 text-[10px]'
  return (
    <span className="inline-flex gap-1" title="Most recent first">
      {form.map((f, i) => (
        <span key={i} className={`${box} rounded inline-flex items-center justify-center font-rajdhani font-bold ${pillColour(f)}`}>
          {f === 'NR' ? '–' : f}
        </span>
      ))}
    </span>
  )
}

function pillColour(f: FormLetter): string {
  switch (f) {
    case 'W':  return 'bg-emerald-600 text-white'
    case 'L':  return 'bg-red-600 text-white'
    case 'T':  return 'bg-amber-500 text-white'
    default:   return 'bg-[var(--stats-row-bg)] dark:bg-ink-4 text-[var(--stats-text-faint)] dark:text-zinc-500 border border-[var(--stats-card-border)] dark:border-ink-5'
  }
}

function fmtDate(d: string): string {
  const [y, m, day] = d.split('-').map(Number)
  return new Date(Date.UTC(y, m - 1, day)).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' })
}

function resultBadge(m: TeamMatch) {
  const cls = m.result === 'won' ? 'text-emerald-600 dark:text-emerald-400'
    : m.result === 'lost' ? 'text-red-600 dark:text-red-400'
    : m.result === 'tied' ? 'text-amber-600 dark:text-amber-400'
    : 'text-[var(--stats-text-faint)] dark:text-zinc-500'
  const label = m.result === 'won' ? 'WON' : m.result === 'lost' ? 'LOST' : m.result === 'tied' ? 'TIED' : 'NR'
  const margin = winMargin(m)
  return (
    <span className={`font-rajdhani text-xs font-bold tracking-wide ${cls}`}>
      {label}{margin ? <span className="font-normal text-[var(--stats-text-muted)] dark:text-zinc-500"> by {margin.value} {margin.kind}</span> : null}
    </span>
  )
}

export function MatchList({ matches, showOpponent = true }: { matches: TeamMatch[]; showOpponent?: boolean }) {
  return (
    <ul className="divide-y divide-[var(--stats-divider)] dark:divide-ink-4">
      {matches.map(m => (
        <li key={m.bookingId}>
          <Link href={`/matches/history/${m.bookingId}`}
            className="flex flex-wrap items-center gap-x-3 gap-y-1 px-3 py-2 hover:bg-[var(--stats-row-hover)] transition-colors">
            <span className="font-rajdhani text-xs text-[var(--stats-text-muted)] dark:text-zinc-500 w-24 flex-none">{fmtDate(m.gameDate)}</span>
            <span className="font-rajdhani text-sm font-semibold text-[var(--stats-text)] dark:text-parchment flex-1 min-w-[10rem] truncate">
              {showOpponent ? `vs ${m.opponentLabel}` : (m.tournamentName ?? '—')}
              {m.stageType === 'knockout' && <span className="ml-1.5 text-[10px] font-bold tracking-wide uppercase text-[var(--stats-accent)] dark:text-gold">KO</span>}
              {m.isPractice && <span className="ml-1.5 text-[10px] font-bold tracking-wide uppercase text-[var(--stats-text-faint)] dark:text-zinc-600">practice</span>}
            </span>
            <span className="font-rajdhani text-xs text-[var(--stats-text-2)] dark:text-zinc-400 tabular-nums">
              {scoreString(m.teamTotal, m.teamWickets, m.teamOvers)}
              <span className="text-[var(--stats-text-faint)] dark:text-zinc-600"> v </span>
              {scoreString(m.oppTotal, m.oppWickets, m.oppOvers)}
            </span>
            <span className="font-rajdhani text-[10px] text-[var(--stats-text-faint)] dark:text-zinc-600 uppercase tracking-wide">
              {m.format ?? ''}{m.battedFirst === null ? '' : m.battedFirst ? ' · bat 1st' : ' · chased'}
            </span>
            {resultBadge(m)}
          </Link>
        </li>
      ))}
    </ul>
  )
}

export function TeamSplitTable({ rows, showOpponentInMatches = true, emptyText = 'No matches for this filter.', showTotal = true, hideMarqueeBadge = false }: {
  rows: SplitRow[]
  showOpponentInMatches?: boolean
  emptyText?: string
  // Aggregate footer row across everything listed above it. Computed from
  // the *distinct* matches behind the rows, not by summing the rows — the
  // Toss split puts a toss-winning match in two buckets, and that must
  // not count twice in the total.
  showTotal?: boolean
  // The Marquee opponents highlight table (page.tsx, opponent split only)
  // is entirely marquee rows by construction, so the "Marquee" pill on
  // every row would just repeat the section's own heading. The full
  // opponent table below it still shows the pill, to distinguish marquee
  // from non-marquee rows there.
  hideMarqueeBadge?: boolean
}) {
  const [open, setOpen] = useState<string | null>(null)

  if (rows.length === 0) {
    return <p className="font-rajdhani text-sm text-[var(--stats-text-muted)] dark:text-zinc-500 py-6 text-center">{emptyText}</p>
  }

  const distinct = new Map<string, TeamMatch>()
  for (const r of rows) for (const m of r.matches) distinct.set(m.bookingId, m)
  const allMatches = Array.from(distinct.values())
  const total = summarize(allMatches)
  const totalForm = recentForm(allMatches, 5)
  const lastPlayed = allMatches.reduce<string | null>((acc, m) => (acc === null || m.gameDate > acc ? m.gameDate : acc), null)

  return (
    <div className="bg-[var(--stats-card-bg)] dark:bg-ink-3 border border-[var(--stats-card-border)] dark:border-ink-5 rounded-lg overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-left">
          <thead>
            <tr className="font-rajdhani text-[10px] font-bold tracking-widest uppercase text-[var(--stats-text-muted)] dark:text-zinc-500 border-b border-[var(--stats-card-border)] dark:border-ink-5">
              <th className="px-3 py-2.5 min-w-[11rem]">&nbsp;</th>
              <th className="px-2 py-2.5 text-right">P</th>
              <th className="px-2 py-2.5 text-right">W</th>
              <th className="px-2 py-2.5 text-right">L</th>
              <th className="px-2 py-2.5 text-right hidden sm:table-cell">T/NR</th>
              <th className="px-2 py-2.5 text-right">Win %</th>
              <th className="px-3 py-2.5 hidden md:table-cell">Form</th>
              <th className="px-3 py-2.5 text-right hidden md:table-cell">Last</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(r => {
              const isOpen = open === r.key
              return (
                <RowGroup key={r.key} row={r} isOpen={isOpen} onToggle={() => setOpen(isOpen ? null : r.key)} showOpponent={showOpponentInMatches} hideMarqueeBadge={hideMarqueeBadge} />
              )
            })}
          </tbody>
          {showTotal && rows.length > 1 && (
            <tfoot>
              <tr className="border-t-2 border-[var(--stats-card-border)] dark:border-ink-5 bg-[var(--stats-row-bg)] dark:bg-ink-4/60">
                <td className="px-3 py-2.5">
                  <span className="font-rajdhani text-xs font-bold tracking-[3px] uppercase text-[var(--stats-text-muted)] dark:text-zinc-500">
                    Total <span className="font-normal tracking-normal normal-case">· {rows.length} {rows.length === 1 ? 'group' : 'groups'}</span>
                  </span>
                </td>
                <td className="px-2 py-2.5 text-right font-rajdhani text-sm font-bold text-[var(--stats-text)] dark:text-parchment tabular-nums">{total.played}</td>
                <td className="px-2 py-2.5 text-right font-rajdhani text-sm font-bold text-emerald-700 dark:text-emerald-400 tabular-nums">{total.won}</td>
                <td className="px-2 py-2.5 text-right font-rajdhani text-sm font-bold text-red-700 dark:text-red-400 tabular-nums">{total.lost}</td>
                <td className="px-2 py-2.5 text-right font-rajdhani text-sm text-[var(--stats-text-muted)] dark:text-zinc-500 tabular-nums hidden sm:table-cell">{total.tied + total.nr || '–'}</td>
                <td className="px-2 py-2.5 text-right font-rajdhani text-base font-bold text-[var(--stats-accent)] dark:text-gold tabular-nums">{total.winPct === null ? '–' : `${total.winPct}%`}</td>
                <td className="px-3 py-2.5 hidden md:table-cell"><FormPills form={totalForm} /></td>
                <td className="px-3 py-2.5 text-right font-rajdhani text-xs text-[var(--stats-text-muted)] dark:text-zinc-500 hidden md:table-cell">{lastPlayed ? fmtDate(lastPlayed) : '–'}</td>
              </tr>
            </tfoot>
          )}
        </table>
      </div>
    </div>
  )
}

function RowGroup({ row: r, isOpen, onToggle, showOpponent, hideMarqueeBadge = false }: { row: SplitRow; isOpen: boolean; onToggle: () => void; showOpponent: boolean; hideMarqueeBadge?: boolean }) {
  // Second-level breakdown ("then by", §3.2). Sub-rows expand to their own
  // matches, so no summary is ever more than two taps from the matches
  // behind it — the same rule the top level follows.
  const [openSub, setOpenSub] = useState<string | null>(null)
  const subs = withUncovered(r)

  return (
    <>
      <tr onClick={onToggle}
        className={`cursor-pointer border-b border-[var(--stats-divider)] dark:border-ink-4 hover:bg-[var(--stats-row-hover)] transition-colors ${isOpen ? 'bg-[var(--stats-row-bg)] dark:bg-ink-4/60' : ''}`}>
        <td className="px-3 py-2.5">
          <span className="font-rajdhani text-sm font-semibold text-[var(--stats-text)] dark:text-parchment flex items-center gap-2">
            <span className="text-[10px] text-[var(--stats-text-faint)] dark:text-zinc-600">{isOpen ? '▾' : '▸'}</span>
            <span className="truncate">{r.label}</span>
            {r.meta?.isMarquee && !hideMarqueeBadge && (
              <span className="text-[9px] font-bold tracking-widest uppercase px-1.5 py-0.5 rounded border bg-[var(--stats-badge-bg)] dark:bg-gold/15 border-[var(--stats-badge-border)] dark:border-gold-dim text-[var(--stats-badge-text)] dark:text-gold">
                Marquee
              </span>
            )}
            {r.meta && 'reconciled' in r.meta && r.meta.reconciled === false && (
              <span title="Not yet linked to the opponent master list" className="text-[9px] font-bold tracking-widest uppercase text-[var(--stats-text-faint)] dark:text-zinc-600">unlinked</span>
            )}
          </span>
        </td>
        <td className="px-2 py-2.5 text-right font-rajdhani text-sm text-[var(--stats-text-2)] dark:text-zinc-300 tabular-nums">{r.played}</td>
        <td className="px-2 py-2.5 text-right font-rajdhani text-sm text-emerald-700 dark:text-emerald-400 tabular-nums">{r.won}</td>
        <td className="px-2 py-2.5 text-right font-rajdhani text-sm text-red-700 dark:text-red-400 tabular-nums">{r.lost}</td>
        <td className="px-2 py-2.5 text-right font-rajdhani text-sm text-[var(--stats-text-muted)] dark:text-zinc-500 tabular-nums hidden sm:table-cell">{r.tied + r.nr || '–'}</td>
        <td className="px-2 py-2.5 text-right font-rajdhani text-sm font-bold text-[var(--stats-accent)] dark:text-gold tabular-nums">{r.winPct === null ? '–' : `${r.winPct}%`}</td>
        <td className="px-3 py-2.5 hidden md:table-cell"><FormPills form={r.form} /></td>
        <td className="px-3 py-2.5 text-right font-rajdhani text-xs text-[var(--stats-text-muted)] dark:text-zinc-500 hidden md:table-cell">{r.lastPlayed ? fmtDate(r.lastPlayed) : '–'}</td>
      </tr>
      {isOpen && subs.length === 0 && (
        <tr className="border-b border-[var(--stats-divider)] dark:border-ink-4">
          <td colSpan={8} className="p-0 bg-[var(--stats-row-bg)] dark:bg-ink-2">
            <div className="md:hidden px-3 pt-2"><FormPills form={r.form} /></div>
            <MatchList matches={r.matches} showOpponent={showOpponent} />
          </td>
        </tr>
      )}
      {isOpen && subs.map(sr => {
        const subKey = `${r.key}::${sr.key}`
        const subOpen = openSub === subKey
        return (
          <Fragment key={subKey}>
            <tr onClick={() => setOpenSub(subOpen ? null : subKey)}
              className={`cursor-pointer border-b border-[var(--stats-divider)] dark:border-ink-4 bg-[var(--stats-row-bg)] dark:bg-ink-2 hover:bg-[var(--stats-row-hover)] transition-colors`}>
              <td className="py-2 pr-3 pl-7">
                <span className="font-rajdhani text-[13px] text-[var(--stats-text-2)] dark:text-zinc-300 flex items-center gap-2 border-l-2 border-[var(--stats-card-border)] dark:border-ink-5 pl-3">
                  <span className="text-[9px] text-[var(--stats-text-faint)] dark:text-zinc-600">{subOpen ? '▾' : '▸'}</span>
                  <span className="truncate">{sr.label}</span>
                </span>
              </td>
              <td className="px-2 py-2 text-right font-rajdhani text-[13px] text-[var(--stats-text-2)] dark:text-zinc-400 tabular-nums">{sr.played}</td>
              <td className="px-2 py-2 text-right font-rajdhani text-[13px] text-emerald-700 dark:text-emerald-400 tabular-nums">{sr.won}</td>
              <td className="px-2 py-2 text-right font-rajdhani text-[13px] text-red-700 dark:text-red-400 tabular-nums">{sr.lost}</td>
              <td className="px-2 py-2 text-right font-rajdhani text-[13px] text-[var(--stats-text-muted)] dark:text-zinc-500 tabular-nums hidden sm:table-cell">{sr.tied + sr.nr || '–'}</td>
              <td className="px-2 py-2 text-right font-rajdhani text-[13px] font-bold text-[var(--stats-accent)] dark:text-gold tabular-nums">{sr.winPct === null ? '–' : `${sr.winPct}%`}</td>
              <td className="px-3 py-2 hidden md:table-cell"><FormPills form={sr.form} /></td>
              <td className="px-3 py-2 text-right font-rajdhani text-[11px] text-[var(--stats-text-muted)] dark:text-zinc-500 hidden md:table-cell">{sr.lastPlayed ? fmtDate(sr.lastPlayed) : '–'}</td>
            </tr>
            {subOpen && (
              <tr className="border-b border-[var(--stats-divider)] dark:border-ink-4">
                <td colSpan={8} className="p-0 bg-[var(--stats-card-bg)] dark:bg-ink-3">
                  <MatchList matches={sr.matches} showOpponent={showOpponent} />
                </td>
              </tr>
            )}
          </Fragment>
        )
      })}
    </>
  )
}

// A sub-split can leave matches in no group at all — the Toss and
// Defending/Chasing dimensions give a match with no toss data nothing to
// belong to. Those matches would otherwise become unreachable once a
// "then by" is chosen (the parent row no longer lists them directly), so
// they get a trailing "Not recorded" sub-row of their own.
function withUncovered(r: SplitRow): SplitRow[] {
  if (!r.sub || r.sub.length === 0) return []
  const covered = new Set<string>()
  for (const sr of r.sub) for (const m of sr.matches) covered.add(m.bookingId)
  const rest = r.matches.filter(m => !covered.has(m.bookingId))
  if (rest.length === 0) return r.sub
  const sorted = sortNewestFirst(rest)
  return [...r.sub, {
    key: '__uncovered', label: 'Not recorded',
    ...summarize(sorted),
    form: recentForm(sorted, 5),
    lastPlayed: sorted[0]?.gameDate ?? null,
    matches: sorted,
  }]
}
