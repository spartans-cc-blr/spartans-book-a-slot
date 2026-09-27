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
import type { PlayerUnderCaptain, PositionRecommendation, PositionUsage, SeasonProgression, TimelinePoint } from '@/lib/captaincyStatsCore'

function shortDate(iso: string): string {
  return new Date(`${iso}T00:00:00`).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: '2-digit' })
}

function fig(v: number | null, digits = 1): string {
  return v == null ? '—' : v.toFixed(digits)
}

// One batting position, expandable to the matches behind it — this is the
// consolidated replacement for the old separate "position chip" +
// "batting bar chart" pair. The aggregate line is always visible; the
// match list (newest first) only renders once opened, so a player with
// many innings at one position never forces a scroll-heavy chart.
// `isRecommended` highlights the one position pickRecommendedPosition()
// picked out — a gold-tinted border/background rather than a separate
// badge, so it reads as "this row" without adding more text per row.
function PositionRow({ p, isRecommended }: { p: PositionUsage; isRecommended: boolean }) {
  return (
    <details className={`group border rounded-lg ${isRecommended
      ? 'border-[var(--stats-badge-border)] bg-[var(--stats-badge-bg)]'
      : 'border-[var(--stats-card-border)] bg-[var(--stats-row-bg)]'}`}>
      <summary className="list-none cursor-pointer px-3 py-2 flex items-center justify-between gap-2">
        <span className="font-rajdhani text-xs text-[var(--stats-text-2)] truncate">
          {isRecommended && <span title="Recommended position" className="mr-1">⭐</span>}
          <b className="text-[var(--stats-text)]">No. {p.position}</b> · {p.innings} inn · {p.runs} runs
          {p.average != null && ` · avg ${fig(p.average)}`}
          {p.strikeRate != null && ` · SR ${Math.round(p.strikeRate)}`}
        </span>
        <span className="text-[var(--stats-text-muted)] text-xs transition-transform group-open:rotate-180 flex-shrink-0">▾</span>
      </summary>
      <ul className="px-3 pb-2 pt-2 flex flex-col gap-1 border-t border-[var(--stats-divider)]">
        {p.matches.map(m => (
          <li key={m.bookingId}>
            <Link href={`/matches/history/${m.bookingId}`}
              className="flex items-center justify-between gap-2 font-rajdhani text-xs text-[var(--stats-text-2)] hover:text-[var(--stats-accent)] transition-colors">
              <span className="truncate">{shortDate(m.gameDate)}{m.opponentName ? ` vs ${m.opponentName}` : ''}</span>
              <span className="flex-shrink-0 font-semibold text-[var(--stats-text)]">{m.runs}{m.notOut ? '*' : ''} ({m.balls})</span>
            </Link>
          </li>
        ))}
      </ul>
    </details>
  )
}

// The plain-language "why this position" note under the heading, right
// above the row it points at.
function RecommendationHint({ rec }: { rec: PositionRecommendation }) {
  return (
    <p className="font-rajdhani text-[11px] text-[var(--stats-text-muted)] mb-1.5">
      ⭐ <b className="text-[var(--stats-text-2)]">No. {rec.position}</b> recommended — {rec.reason}
    </p>
  )
}

function BowlingTimeline({ points }: { points: TimelinePoint[] }) {
  const bowled = points.filter(p => p.bowling)
  if (bowled.length === 0) return null

  return (
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
            {c.batting.innings > 0
              ? <><b className="font-cinzel text-[var(--stats-text)]">{c.batting.runs}</b> runs</>
              : <span className="text-[var(--stats-text-muted)]">Did not bat</span>}
            {c.bowling.wickets > 0 && <> · <b className="font-cinzel text-[var(--stats-text)]">{c.bowling.wickets}</b> wkts</>}
          </p>
        </div>
        <span className="text-[var(--stats-text-muted)] text-xs transition-transform group-open:rotate-180">▾</span>
      </summary>

      <div className="px-4 pb-4 flex flex-col gap-4 border-t border-[var(--stats-divider)] pt-3">
        <div>
          <p className="font-rajdhani text-[10px] font-bold tracking-widest uppercase text-[var(--stats-text-muted)] mb-1.5">
            Batting positions used <span className="normal-case tracking-normal font-normal">(in batting order)</span>
          </p>
          {c.positions.length === 0 ? (
            <p className="font-rajdhani text-xs text-[var(--stats-text-faint)]">Did not bat under this captain.</p>
          ) : (
            <>
              {c.recommendedPosition && <RecommendationHint rec={c.recommendedPosition} />}
              <div className="flex flex-col gap-1.5">
                {c.positions.map(p => (
                  <PositionRow key={p.position} p={p} isRecommended={c.recommendedPosition?.position === p.position} />
                ))}
              </div>
            </>
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

        <BowlingTimeline points={c.timeline} />
      </div>
    </details>
  )
}

export function PlayerCaptaincyBreakdown({
  captains, seasons, isOwn, filterLabel, groundFilterActive, practiceFilterActive, hasAnyData,
}: {
  captains: PlayerUnderCaptain[]
  seasons: SeasonProgression[]
  isOwn: boolean
  // Plain-language summary of the page's top filters currently narrowing
  // this section (e.g. "2026 · T20"), or null when nothing is applied.
  filterLabel: string | null
  // Two filters this section can't apply yet (see filterCaptaincyInnings()
  // in captaincyStatsCore.ts) — surfaced as a caveat rather than silently
  // ignored, so a player filtering by Ground/Practice elsewhere on the page
  // isn't misled into thinking this section followed along.
  groundFilterActive: boolean
  practiceFilterActive: boolean
  // Whether this player has any captaincy data at all, regardless of the
  // current filters — distinct from captains.length === 0, which can also
  // mean "the filters narrowed it to nothing." Only the former hides the
  // section outright; the latter shows an empty-state message instead.
  hasAnyData: boolean
}) {
  if (!hasAnyData) return null

  return (
    <div className="px-5 md:px-8 lg:px-10 max-w-3xl mx-auto flex flex-col gap-5">
      <section className="bg-[var(--stats-card-bg)] border border-[var(--stats-card-border)] rounded-2xl p-5">
        <h2 className="font-rajdhani text-xs font-bold tracking-widest uppercase text-[var(--stats-text-muted)] mb-1">
          Under each captain
        </h2>
        <p className="font-rajdhani text-xs text-[var(--stats-text-faint)] mb-4">
          {isOwn ? 'Visible to you and the Council only.' : 'Visible to this player and the Council only.'}{' '}
          {filterLabel ? `Filtered to ${filterLabel}` : 'All time'}, practice games excluded.{' '}
          Tap a position to see the matches behind it, or a bowling figure to open that match.
          {groundFilterActive && ' Ground filter isn’t applied to this section.'}
          {practiceFilterActive && ' Practice games stay excluded here regardless.'}
        </p>
        {captains.length === 0 ? (
          <p className="font-rajdhani text-sm text-[var(--stats-text-muted)]">No captaincy data for this filter.</p>
        ) : (
          <div className="flex flex-col gap-2">
            {captains.map((c, i) => <CaptainCard key={c.captainId ?? 'none'} c={c} defaultOpen={i === 0} />)}
          </div>
        )}
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
                  <th className="px-1 py-2" title="Batting innings">Inn</th>
                  <th className="px-1 py-2" title="Position batted at most often, with innings there">Usual pos</th>
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
                    <td className="px-1 py-2">{s.batting.innings}</td>
                    <td className="px-1 py-2">
                      {s.mostPlayedPosition
                        ? <>No. {s.mostPlayedPosition.position} <span className="text-[var(--stats-text-muted)] text-xs">({s.mostPlayedPosition.innings})</span></>
                        : '—'}
                    </td>
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
