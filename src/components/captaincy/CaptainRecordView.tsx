// One captain's record: the top 3 batters at each batting position in the
// matches they led, and the bowlers they used most. Server-renderable (no
// hooks) — PlayerNameLink carries its own client boundary. Themed via the
// shared --stats-* tokens so it follows Light/Dark/System like the other
// stats pages. See features/captaincy-stats.md.

import { PlayerNameLink } from '@/lib/playerLink'
import type { CaptainRecord, BattingLine } from '@/lib/captaincyStatsCore'

const RANK_STYLE: Record<number, string> = {
  1: 'bg-[var(--stats-badge-bg)] text-[var(--stats-badge-text)] border-[var(--stats-badge-border)]',
  2: 'bg-[var(--stats-row-bg)] text-[var(--stats-text-2)] border-[var(--stats-card-border)]',
  3: 'bg-[var(--stats-row-bg)] text-[var(--stats-text-muted)] border-[var(--stats-card-border)]',
}

function battingSummary(l: BattingLine): string {
  const parts = [`${l.innings} inn`]
  if (l.average != null) parts.push(`avg ${l.average.toFixed(1)}`)
  if (l.strikeRate != null) parts.push(`SR ${Math.round(l.strikeRate)}`)
  if (l.best) parts.push(`best ${l.best.runs}${l.best.notOut ? '*' : ''}`)
  return parts.join(' · ')
}

export function CaptainRecordView({ record }: { record: CaptainRecord }) {
  const maxBalls = record.bowlers[0]?.balls ?? 0

  return (
    <div className="flex flex-col gap-5">
      <section className="bg-[var(--stats-card-bg)] border border-[var(--stats-card-border)] rounded-2xl p-5">
        <h2 className="font-rajdhani text-xs font-bold tracking-widest uppercase text-[var(--stats-text-muted)] mb-1">
          Top 3 at each batting position
        </h2>
        <p className="font-rajdhani text-xs text-[var(--stats-text-faint)] mb-4">
          Ranked by runs scored at that position, fewer innings breaking a tie.
        </p>
        {record.positions.length === 0 ? (
          <p className="font-rajdhani text-sm text-[var(--stats-text-muted)]">No batting positions recorded yet.</p>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {record.positions.map(p => (
              <div key={p.position} className="border border-[var(--stats-card-border)] rounded-xl p-3">
                <div className="flex items-baseline justify-between mb-2">
                  <p className="font-cinzel text-base font-bold text-[var(--stats-text)]">No. {p.position}</p>
                  <p className="font-rajdhani text-[11px] text-[var(--stats-text-faint)]">{p.totalInnings} innings</p>
                </div>
                <ol className="flex flex-col gap-2">
                  {p.choices.map(c => (
                    <li key={c.playerId} className="flex items-start gap-2">
                      <span className={`font-rajdhani text-[11px] font-bold w-5 h-5 flex-shrink-0 rounded-full border flex items-center justify-center ${RANK_STYLE[c.rank] ?? RANK_STYLE[3]}`}>
                        {c.rank}
                      </span>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-baseline justify-between gap-2">
                          <PlayerNameLink name={c.playerName} playerId={c.playerId} cricHeroesUrl={c.cricheroesUrl}
                            className="font-rajdhani text-sm font-semibold text-[var(--stats-text)] truncate" />
                          <span className="font-cinzel text-sm font-bold text-[var(--stats-text)] flex-shrink-0">{c.runs}</span>
                        </div>
                        <p className="font-rajdhani text-[11px] text-[var(--stats-text-muted)]">{battingSummary(c)}</p>
                      </div>
                    </li>
                  ))}
                </ol>
              </div>
            ))}
          </div>
        )}
      </section>

      <section className="bg-[var(--stats-card-bg)] border border-[var(--stats-card-border)] rounded-2xl p-5">
        <h2 className="font-rajdhani text-xs font-bold tracking-widest uppercase text-[var(--stats-text-muted)] mb-1">
          Bowlers used most
        </h2>
        <p className="font-rajdhani text-xs text-[var(--stats-text-faint)] mb-4">
          Ranked by overs bowled. The bar shows each bowler&rsquo;s share of all overs bowled in these matches.
        </p>
        {record.bowlers.length === 0 ? (
          <p className="font-rajdhani text-sm text-[var(--stats-text-muted)]">No bowling recorded yet.</p>
        ) : (
          <div className="overflow-x-auto -mx-1">
            <table className="w-full font-rajdhani text-sm min-w-[520px]">
              <thead>
                <tr className="text-[10px] font-bold tracking-widest uppercase text-[var(--stats-text-muted)] text-left">
                  <th className="px-1 py-2 w-6">#</th>
                  <th className="px-1 py-2">Bowler</th>
                  <th className="px-1 py-2 w-[30%]">Overs</th>
                  <th className="px-1 py-2 text-right">Inn</th>
                  <th className="px-1 py-2 text-right">Wkts</th>
                  <th className="px-1 py-2 text-right">Econ</th>
                  <th className="px-1 py-2 text-right">Avg</th>
                  <th className="px-1 py-2 text-right">Best</th>
                </tr>
              </thead>
              <tbody>
                {record.bowlers.map((b, i) => (
                  <tr key={b.playerId} className="border-t border-[var(--stats-divider)] text-[var(--stats-text)]">
                    <td className="px-1 py-2 text-[var(--stats-text-faint)]">{i + 1}</td>
                    <td className="px-1 py-2">
                      <PlayerNameLink name={b.playerName} playerId={b.playerId} cricHeroesUrl={b.cricheroesUrl} className="font-semibold" />
                    </td>
                    <td className="px-1 py-2">
                      <div className="flex items-center gap-2">
                        <span className="w-9 flex-shrink-0 font-semibold">{b.overs}</span>
                        <div className="flex-1 h-2 rounded bg-[var(--stats-row-bg)] overflow-hidden">
                          <div className="h-full bg-[var(--stats-accent)] opacity-70" style={{ width: `${maxBalls > 0 ? Math.max(4, (b.balls / maxBalls) * 100) : 0}%` }} />
                        </div>
                        <span className="w-8 text-right text-[11px] text-[var(--stats-text-muted)]">{Math.round(b.share * 100)}%</span>
                      </div>
                    </td>
                    <td className="px-1 py-2 text-right">{b.innings}</td>
                    <td className="px-1 py-2 text-right font-semibold">{b.wickets}</td>
                    <td className="px-1 py-2 text-right">{b.economy?.toFixed(2) ?? '—'}</td>
                    <td className="px-1 py-2 text-right">{b.average?.toFixed(1) ?? '—'}</td>
                    <td className="px-1 py-2 text-right">{b.best ? `${b.best.wickets}/${b.best.runs}` : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  )
}
