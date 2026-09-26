// "Under each captain" on /players/[id]/stats — which match captains have
// used this player, at which batting positions, how they did there, how
// much they bowled, and how that has changed over time. Plus a
// season-by-season progression table. Shown only to the player themselves
// and to GC/admin (gated in the page, which also skips the fetch
// otherwise). See features/captaincy-stats.md.
//
// Server-renderable: collapsible cards use native <details>, no hooks.

import Link from 'next/link'
import { PlayerNameLink } from '@/lib/playerLink'
import type { PlayerUnderCaptain, SeasonProgression, TimelinePoint } from '@/lib/captaincyStatsCore'

function shortDate(iso: string): string {
  return new Date(`${iso}T00:00:00`).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: '2-digit' })
}

function fig(v: number | null, digits = 1): string {
  return v == null ? '—' : v.toFixed(digits)
}

function Timeline({ points }: { points: TimelinePoint[] }) {
  const batted = points.filter(p => p.batting)
  const maxRuns = Math.max(1, ...batted.map(p => p.batting!.runs))
  const bowled = points.filter(p => p.bowling)

  return (
    <div className="flex flex-col gap-3">
      {batted.length > 0 && (
        <div>
          <p className="font-rajdhani text-[10px] font-bold tracking-widest uppercase text-[var(--stats-text-muted)] mb-1">
            Batting, oldest → latest <span className="normal-case tracking-normal font-normal">(bar = runs, label = position)</span>
          </p>
          <div className="overflow-x-auto">
            <div className="flex items-end gap-1 h-28 min-w-max pb-0.5">
              {batted.map(p => {
                const b = p.batting!
                return (
                  <Link key={p.bookingId} href={`/matches/history/${p.bookingId}`}
                    title={`${shortDate(p.gameDate)}${p.opponentName ? ` vs ${p.opponentName}` : ''} — ${b.runs}${b.notOut ? '*' : ''} (${b.balls}) at No. ${b.position ?? '?'}`}
                    className="flex flex-col items-center justify-end h-full w-7 flex-shrink-0 group">
                    <span className="font-rajdhani text-[10px] font-semibold text-[var(--stats-text-2)] leading-none mb-0.5">
                      {b.runs}{b.notOut ? '*' : ''}
                    </span>
                    <div className="w-5 rounded-t bg-[var(--stats-accent)] opacity-70 group-hover:opacity-100 transition-opacity"
                      style={{ height: `${Math.max(3, (b.runs / maxRuns) * 70)}%` }} />
                    <span className="font-rajdhani text-[10px] text-[var(--stats-text-muted)] leading-none mt-1">
                      {b.position ?? '–'}
                    </span>
                  </Link>
                )
              })}
            </div>
          </div>
        </div>
      )}
      {bowled.length > 0 && (
        <div>
          <p className="font-rajdhani text-[10px] font-bold tracking-widest uppercase text-[var(--stats-text-muted)] mb-1">
            Bowling, oldest → latest <span className="normal-case tracking-normal font-normal">(wickets/runs, overs)</span>
          </p>
          <div className="flex flex-wrap gap-1.5">
            {bowled.map(p => {
              const w = p.bowling!
              return (
                <Link key={p.bookingId} href={`/matches/history/${p.bookingId}`}
                  title={`${shortDate(p.gameDate)}${p.opponentName ? ` vs ${p.opponentName}` : ''}`}
                  className={`font-rajdhani text-[11px] px-2 py-0.5 rounded border transition-colors hover:border-[var(--stats-accent)]
                    ${w.wickets >= 3
                      ? 'bg-[var(--stats-badge-bg)] border-[var(--stats-badge-border)] text-[var(--stats-badge-text)] font-bold'
                      : 'bg-[var(--stats-row-bg)] border-[var(--stats-card-border)] text-[var(--stats-text-2)]'}`}>
                  {w.wickets}/{w.runs} <span className="text-[var(--stats-text-muted)] font-normal">({Math.floor(w.balls / 6)}.{w.balls % 6})</span>
                </Link>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}

function CaptainCard({ c, defaultOpen }: { c: PlayerUnderCaptain; defaultOpen: boolean }) {
  return (
    <details open={defaultOpen} className="group border border-[var(--stats-card-border)] rounded-xl">
      <summary className="list-none cursor-pointer px-4 py-3 flex items-center gap-3">
        <div className="flex-1 min-w-0">
          <p className="font-rajdhani text-sm font-bold text-[var(--stats-text)] truncate">
            {c.captainId
              ? <PlayerNameLink name={c.captainName} playerId={c.captainId} />
              : <span className="text-[var(--stats-text-muted)]">{c.captainName}</span>}
          </p>
          <p className="font-rajdhani text-[11px] text-[var(--stats-text-muted)]">
            {c.matches} {c.matches === 1 ? 'match' : 'matches'} · {shortDate(c.firstDate)}
            {c.firstDate !== c.lastDate && ` – ${shortDate(c.lastDate)}`}
          </p>
        </div>
        <div className="text-right flex-shrink-0">
          <p className="font-rajdhani text-xs text-[var(--stats-text-2)]">
            <b className="font-cinzel text-[var(--stats-text)]">{c.batting.runs}</b> runs
            {c.bowling.wickets > 0 && <> · <b className="font-cinzel text-[var(--stats-text)]">{c.bowling.wickets}</b> wkts</>}
          </p>
        </div>
        <span className="text-[var(--stats-text-muted)] text-xs transition-transform group-open:rotate-180">▾</span>
      </summary>

      <div className="px-4 pb-4 flex flex-col gap-4 border-t border-[var(--stats-divider)] pt-3">
        <div>
          <p className="font-rajdhani text-[10px] font-bold tracking-widest uppercase text-[var(--stats-text-muted)] mb-1.5">
            Batting positions used
          </p>
          {c.positions.length === 0 ? (
            <p className="font-rajdhani text-xs text-[var(--stats-text-faint)]">Did not bat under this captain.</p>
          ) : (
            <div className="flex flex-wrap gap-1.5">
              {c.positions.map(p => (
                <span key={p.position} className="font-rajdhani text-xs px-2 py-1 rounded-lg border border-[var(--stats-card-border)] bg-[var(--stats-row-bg)] text-[var(--stats-text-2)]">
                  <b className="text-[var(--stats-text)]">No. {p.position}</b> · {p.innings} inn · {p.runs} runs
                  {p.average != null && ` · avg ${fig(p.average)}`}
                  {p.strikeRate != null && ` · SR ${Math.round(p.strikeRate)}`}
                </span>
              ))}
            </div>
          )}
        </div>

        <div className="grid grid-cols-2 gap-3 font-rajdhani text-xs text-[var(--stats-text-2)]">
          <div>
            <p className="text-[10px] font-bold tracking-widest uppercase text-[var(--stats-text-muted)] mb-0.5">Batting</p>
            {c.batting.innings > 0
              ? <p>{c.batting.innings} inn · {c.batting.runs} runs · avg {fig(c.batting.average)} · SR {fig(c.batting.strikeRate, 0)}{c.batting.best && ` · best ${c.batting.best.runs}${c.batting.best.notOut ? '*' : ''}`}</p>
              : <p className="text-[var(--stats-text-faint)]">—</p>}
          </div>
          <div>
            <p className="text-[10px] font-bold tracking-widest uppercase text-[var(--stats-text-muted)] mb-0.5">Bowling</p>
            {c.bowling.innings > 0
              ? <p>{c.bowling.innings} inn · {c.bowling.overs} ov · {c.bowling.wickets} wkts · econ {fig(c.bowling.economy, 2)}{c.bowling.best && ` · best ${c.bowling.best.wickets}/${c.bowling.best.runs}`}</p>
              : <p className="text-[var(--stats-text-faint)]">Did not bowl</p>}
          </div>
        </div>

        <Timeline points={c.timeline} />
      </div>
    </details>
  )
}

export function PlayerCaptaincyBreakdown({ captains, seasons, isOwn }: {
  captains: PlayerUnderCaptain[]
  seasons: SeasonProgression[]
  isOwn: boolean
}) {
  if (captains.length === 0) return null

  return (
    <div className="px-5 md:px-8 lg:px-10 max-w-3xl mx-auto flex flex-col gap-5">
      <section className="bg-[var(--stats-card-bg)] border border-[var(--stats-card-border)] rounded-2xl p-5">
        <h2 className="font-rajdhani text-xs font-bold tracking-widest uppercase text-[var(--stats-text-muted)] mb-1">
          Under each captain
        </h2>
        <p className="font-rajdhani text-xs text-[var(--stats-text-faint)] mb-4">
          {isOwn ? 'Visible to you and the Council only.' : 'Visible to this player and the Council only.'}{' '}
          All time, practice games excluded. Tap a bar or figure to open that match.
        </p>
        <div className="flex flex-col gap-2">
          {captains.map((c, i) => <CaptainCard key={c.captainId ?? 'none'} c={c} defaultOpen={i === 0} />)}
        </div>
      </section>

      {seasons.length > 0 && (
        <section className="bg-[var(--stats-card-bg)] border border-[var(--stats-card-border)] rounded-2xl p-5">
          <h2 className="font-rajdhani text-xs font-bold tracking-widest uppercase text-[var(--stats-text-muted)] mb-3">
            Season by season
          </h2>
          <div className="overflow-x-auto -mx-1">
            <table className="w-full font-rajdhani text-sm min-w-[560px]">
              <thead>
                <tr className="text-[10px] font-bold tracking-widest uppercase text-[var(--stats-text-muted)] text-right">
                  <th className="px-1 py-2 text-left">Year</th>
                  <th className="px-1 py-2">M</th>
                  <th className="px-1 py-2" title="Average batting position">Avg pos</th>
                  <th className="px-1 py-2">Runs</th>
                  <th className="px-1 py-2">Avg</th>
                  <th className="px-1 py-2">SR</th>
                  <th className="px-1 py-2">Overs</th>
                  <th className="px-1 py-2">Wkts</th>
                  <th className="px-1 py-2">Econ</th>
                </tr>
              </thead>
              <tbody>
                {seasons.map(s => (
                  <tr key={s.year} className="border-t border-[var(--stats-divider)] text-right text-[var(--stats-text)]">
                    <td className="px-1 py-2 text-left font-semibold">{s.year}</td>
                    <td className="px-1 py-2">{s.matches}</td>
                    <td className="px-1 py-2">{fig(s.averagePosition)}</td>
                    <td className="px-1 py-2 font-semibold">{s.batting.runs}</td>
                    <td className="px-1 py-2">{fig(s.batting.average)}</td>
                    <td className="px-1 py-2">{fig(s.batting.strikeRate, 0)}</td>
                    <td className="px-1 py-2">{s.bowling.innings > 0 ? s.bowling.overs : '—'}</td>
                    <td className="px-1 py-2 font-semibold">{s.bowling.innings > 0 ? s.bowling.wickets : '—'}</td>
                    <td className="px-1 py-2">{fig(s.bowling.economy, 2)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </div>
  )
}
