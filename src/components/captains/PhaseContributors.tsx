// "Who drives each phase" — per-player batting and bowling in each phase compared with the
// rest of the team, plus a short pick list per phase. Server component (no state): the only
// interaction is native <details> and a link that toggles "everyone" in the URL.
// Maths lives in src/lib/phaseContribution.ts; see features/match-planning.md §16.

import Link from 'next/link'
import { PlayerNameLink } from '@/lib/playerLink'
import { PHASE_KEYS, PHASE_LABEL, type PhaseKey } from '@/lib/ballByBall'
import {
  MIN_CONTRIB_BALLS, type ContribCell, type ContribPick, type ContribRow, type PhaseContribution, type Verdict,
} from '@/lib/phaseContribution'

const muted = 'text-[var(--stats-text-muted)]'
const f1 = (n: number | null) => (n == null ? '—' : n.toFixed(1))
const signed = (n: number | null, d = 1) => (n == null ? '' : `${n >= 0 ? '+' : '−'}${Math.abs(n).toFixed(d)}`)

const VERDICT: Record<Verdict, { sym: string; label: string; cls: string }> = {
  above: { sym: '▲', label: 'Above par', cls: 'text-emerald-700 dark:text-emerald-400' },
  par: { sym: '●', label: 'On par', cls: 'text-[var(--stats-text-muted)]' },
  below: { sym: '▼', label: 'Below par', cls: 'text-red-700 dark:text-red-400' },
  small: { sym: '·', label: 'Small sample', cls: 'text-[var(--stats-text-faint)]' },
}

function Chip({ v }: { v: Verdict }) {
  const x = VERDICT[v]
  return <span className={`font-bold ${x.cls}`} title={x.label}>{x.sym} <span className="text-[11px] font-semibold">{x.label}</span></span>
}

function pickLine(picks: ContribPick[]) {
  return picks.map(p => `${p.name} (${signed(p.rpoDelta)} an over, ${p.balls} balls)`).join(', ')
}

function Recommendations({ data }: { data: PhaseContribution }) {
  const lines = PHASE_KEYS.map(p => ({ p, best: data.best[p], weak: data.weak[p] })).filter(x => x.best.length || x.weak.length)
  if (lines.length === 0) return <p className={`font-rajdhani text-sm ${muted}`}>No available player is clearly above or below the rest of the team in any phase, on the data we have.</p>
  return (
    <ul className="space-y-1">
      {lines.map(({ p, best, weak }) => (
        <li key={p} className="font-rajdhani text-sm text-[var(--stats-text)]">
          <b>{PHASE_LABEL[p]}:</b>{' '}
          {best.length > 0 && <span className="text-emerald-700 dark:text-emerald-400">▲ {pickLine(best)}</span>}
          {best.length > 0 && weak.length > 0 && <span className={muted}> · </span>}
          {weak.length > 0 && <span className="text-red-700 dark:text-red-400">▼ {pickLine(weak)}</span>}
        </li>
      ))}
    </ul>
  )
}

function PhaseBlock({
  phase, data, kind, rows, cricUrls,
}: { phase: PhaseKey; data: PhaseContribution; kind: 'bat' | 'bowl'; rows: ContribRow[]; cricUrls: Record<string, string | null> }) {
  const list = rows
    .map(r => ({ r, c: r.byPhase[phase] as ContribCell | null }))
    .filter((x): x is { r: ContribRow; c: ContribCell } => !!x.c)
    .sort((a, b) => (b.c.z ?? -99) - (a.c.z ?? -99) || b.c.balls - a.c.balls)
  if (list.length === 0) return null
  const base = data.baseline[phase]
  const eventLabel = kind === 'bat' ? 'Lost' : 'Wkts'
  return (
    <div className="overflow-x-auto">
      <p className={`font-rajdhani text-xs font-bold uppercase tracking-wide ${muted} mb-1`}>{PHASE_LABEL[phase]}</p>
      <table className="w-full text-sm font-rajdhani">
        <thead>
          <tr className={`text-xs ${muted}`}>
            <th className="text-left font-semibold py-1">Player</th>
            <th className="text-right">Balls</th><th className="text-right">RPO</th><th className="text-right">vs rest</th>
            <th className="text-right">Dot%</th><th className="text-right">vs rest</th>
            <th className="text-right">{eventLabel}</th><th className="text-left pl-3">Verdict</th>
          </tr>
        </thead>
        <tbody className="text-[var(--stats-text)]">
          <tr className="border-t border-[var(--stats-divider)] bg-[var(--stats-row-hover,transparent)]">
            <td className={`py-1.5 font-semibold ${muted}`}>Whole team</td>
            <td className="text-right">{base.balls}</td><td className="text-right font-semibold">{f1(base.rpo)}</td><td />
            <td className="text-right">{base.dotPct == null ? '—' : `${Math.round(base.dotPct)}%`}</td><td />
            <td className="text-right">{base.events}</td><td />
          </tr>
          {list.map(({ r, c }) => (
            <tr key={r.playerId} className="border-t border-[var(--stats-divider)]">
              <td className="py-1.5">
                <PlayerNameLink name={r.name} playerId={r.playerId} cricHeroesUrl={cricUrls[r.playerId] ?? null} />
                {kind === 'bat' && r.usualPosition != null && <span className={`text-[11px] ${muted}`}> · usually No. {r.usualPosition}</span>}
                {!r.available && <span className={`text-[11px] ${muted}`}> · not marked available</span>}
              </td>
              <td className="text-right">{c.balls}</td>
              <td className="text-right font-semibold">{f1(c.rpo)}</td>
              <td className={`text-right ${c.verdict === 'above' ? 'text-emerald-700 dark:text-emerald-400' : c.verdict === 'below' ? 'text-red-700 dark:text-red-400' : muted}`}>
                {signed(c.rpoDelta)}
              </td>
              <td className="text-right">{c.dotPct == null ? '—' : `${Math.round(c.dotPct)}%`}</td>
              <td className={`text-right ${c.dotFlag === 'good' ? 'text-emerald-700 dark:text-emerald-400' : c.dotFlag === 'bad' ? 'text-red-700 dark:text-red-400' : muted}`}>
                {c.dotDelta == null ? '' : `${signed(c.dotDelta, 0)} pts`}
              </td>
              <td className="text-right">{c.events}</td>
              <td className="pl-3 whitespace-nowrap"><Chip v={c.verdict} /></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function Section({
  title, kind, data, who, cricUrls,
}: { title: string; kind: 'bat' | 'bowl'; data: PhaseContribution; who: 'available' | 'all'; cricUrls: Record<string, string | null> }) {
  const rows = data.rows.filter(r => who === 'all' || r.available)
  return (
    <details className="group border-t border-[var(--stats-divider)] pt-3 mt-3">
      <summary className="cursor-pointer select-none font-rajdhani text-sm font-bold text-[var(--stats-text)]">
        {title} <span className={`font-normal ${muted}`}>· {rows.length} {rows.length === 1 ? 'player' : 'players'} · tap to expand</span>
      </summary>
      <div className="mt-3 space-y-4">
        {PHASE_KEYS.map(p => <PhaseBlock key={p} phase={p} data={data} kind={kind} rows={rows} cricUrls={cricUrls} />)}
        {rows.length === 0 && <p className={`font-rajdhani text-sm ${muted}`}>No ball-by-ball data for these players in this view.</p>}
      </div>
    </details>
  )
}

export function PhaseContributors({
  data, who, toggleHref, cricUrls, scope,
}: {
  data: { batting: PhaseContribution; bowling: PhaseContribution }
  who: 'available' | 'all'
  toggleHref: string
  cricUrls: Record<string, string | null>
  scope: string
}) {
  return (
    <div className="bg-[var(--stats-card-bg)] border border-[var(--stats-card-border)] rounded-2xl p-4 md:p-5">
      <div className="flex items-start justify-between gap-3 mb-1">
        <h2 className="font-cinzel text-sm font-bold tracking-wide text-[var(--stats-text)]">Who drives each phase</h2>
        <Link href={toggleHref} replace scroll={false}
          className="font-rajdhani text-xs font-bold text-[var(--stats-accent)] underline decoration-dotted whitespace-nowrap">
          {who === 'available' ? 'Show everyone' : 'Available players only'}
        </Link>
      </div>
      <p className={`font-rajdhani text-xs ${muted} mb-3`}>
        {who === 'available' ? 'Players who marked Y, O or E' : 'Every Spartans player with ball-by-ball data'}, compared with the rest of the team in
        the same phase, {scope}. A gap only counts as above or below when it is bigger than normal match-to-match noise;
        under {MIN_CONTRIB_BALLS} balls is marked a small sample.
      </p>

      <p className={`font-rajdhani text-xs font-bold uppercase tracking-wide ${muted} mb-1`}>Batting — who to send in for each phase</p>
      <Recommendations data={data.batting} />
      <p className={`font-rajdhani text-[11px] ${muted} mt-1`}>
        Batting position is not recorded ball by ball: a batter&rsquo;s phase depends on when they walked in, which depends on the order and on wickets. Read this
        as evidence of who scores well in a phase, not a fixed instruction.
      </p>

      <p className={`font-rajdhani text-xs font-bold uppercase tracking-wide ${muted} mt-4 mb-1`}>Bowling — who to bowl in each phase</p>
      <Recommendations data={data.bowling} />
      <p className={`font-rajdhani text-[11px] ${muted} mt-1`}>For bowlers a minus is good: they went for fewer runs an over than the rest of the attack.</p>

      <Section title="Batting detail by phase" kind="bat" data={data.batting} who={who} cricUrls={cricUrls} />
      <Section title="Bowling detail by phase" kind="bowl" data={data.bowling} who={who} cricUrls={cricUrls} />
    </div>
  )
}
