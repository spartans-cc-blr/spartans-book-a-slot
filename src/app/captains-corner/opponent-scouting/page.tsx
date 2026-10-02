// app/captains-corner/opponent-scouting/page.tsx
//
// Pre-match scouting for captains: what happened every time we met the
// opponent of an upcoming game (from ball-by-ball data), and how each player
// who has said Y/O/E for it did against them — batting position, phases,
// how they got out, bowling by phase — with data-derived pointers.
// See .claude/rules/features/opponent-scouting.md.
//
// Access: captains, GC and admin. Read-only; no write path.

import Link from 'next/link'
import { redirect } from 'next/navigation'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { SiteNav } from '@/components/ui/SiteNav'
import { PlayerNameLink } from '@/lib/playerLink'
import { getScoutingContext } from '@/lib/opponentScoutingData'
import { scoutTeam, scoutPlayers, rpo, type PhaseTallies, type PlayerScout } from '@/lib/opponentScouting'
import { PHASE_KEYS, PHASE_LABEL } from '@/lib/ballByBall'
import type { Metadata } from 'next'

export const dynamic = 'force-dynamic'
export const metadata: Metadata = { title: 'Opponent Scouting — Captains’ Corner' }

const card = 'bg-[var(--stats-card-bg)] border border-[var(--stats-card-border)] rounded-2xl p-4 md:p-5'
const h2 = 'font-cinzel text-sm font-bold tracking-wide text-[var(--stats-text)] mb-3'
const muted = 'text-[var(--stats-text-muted)]'

function fmtDate(iso: string) {
  return new Date(`${iso}T00:00:00`).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
}
const f1 = (n: number | null) => (n == null ? '—' : n.toFixed(1))
const RESULT_CLS: Record<string, string> = {
  won: 'text-emerald-700 dark:text-emerald-400', lost: 'text-red-700 dark:text-red-400',
  tied: 'text-amber-700 dark:text-amber-400', nr: 'text-[var(--stats-text-muted)]',
}

function PhaseTable({ title, t, wicketLabel }: { title: string; t: PhaseTallies; wicketLabel: string }) {
  return (
    <div>
      <p className={`font-rajdhani text-xs font-bold uppercase tracking-wide ${muted} mb-1`}>{title}</p>
      <table className="w-full text-sm font-rajdhani">
        <thead>
          <tr className={`text-xs ${muted}`}>
            <th className="text-left font-semibold py-1">Phase</th><th className="text-right">Runs</th>
            <th className="text-right">Balls</th><th className="text-right">RPO</th>
            <th className="text-right">{wicketLabel}</th><th className="text-right">Dot%</th>
          </tr>
        </thead>
        <tbody className="text-[var(--stats-text)]">
          {PHASE_KEYS.map(p => (
            <tr key={p} className="border-t border-[var(--stats-divider)]">
              <td className="py-1.5">{PHASE_LABEL[p]}</td>
              <td className="text-right">{t[p].runs}</td><td className="text-right">{t[p].balls}</td>
              <td className="text-right font-semibold">{f1(rpo(t[p].runs, t[p].balls))}</td>
              <td className="text-right">{t[p].wickets}</td>
              <td className="text-right">{t[p].balls ? Math.round((t[p].dots / t[p].balls) * 100) : 0}%</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function PlayerCard({ p, url, response }: { p: PlayerScout; url: string | null; response: string }) {
  const b = p.batting
  const w = p.bowling
  return (
    <div className={card}>
      <div className="flex items-center gap-2 mb-2">
        <PlayerNameLink name={p.name} playerId={p.playerId} cricHeroesUrl={url}
          className="font-rajdhani font-bold text-base text-[var(--stats-text)]" />
        <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-[var(--stats-badge-bg)] text-[var(--stats-badge-text)] border border-[var(--stats-badge-border)]">{response}</span>
      </div>

      {b && (
        <div className="mb-3">
          <p className={`font-rajdhani text-xs font-bold uppercase tracking-wide ${muted}`}>Batting v them</p>
          <p className="font-rajdhani text-sm text-[var(--stats-text)]">
            {b.innings} inn · <b>{b.runs}</b> runs off {b.balls} · SR {b.strikeRate != null ? Math.round(b.strikeRate) : '—'}
            {b.average != null && <> · avg {f1(b.average)}</>}
          </p>
          <p className={`font-rajdhani text-xs ${muted}`}>
            Positions: {b.positions.map(x => `No. ${x.position} (${x.runs} in ${x.innings})`).join(', ')}
          </p>
          <p className={`font-rajdhani text-xs ${muted}`}>
            By phase: {PHASE_KEYS.filter(k => b.byPhase[k].balls > 0)
              .map(k => `${PHASE_LABEL[k]} ${b.byPhase[k].runs}(${b.byPhase[k].balls})`).join(' · ') || '—'}
          </p>
          <ul className="mt-1 space-y-0.5">
            {b.log.map(e => (
              <li key={e.bookingId} className="font-rajdhani text-xs text-[var(--stats-text-2)]">
                <Link href={`/matches/history/${e.bookingId}`} className="underline decoration-dotted">{fmtDate(e.gameDate)}</Link>
                {' '}No. {e.position}: {e.runs}{e.out ? '' : '*'} ({e.balls}) — {e.out ?? 'not out'}
              </li>
            ))}
          </ul>
        </div>
      )}

      {w && (
        <div className="mb-3">
          <p className={`font-rajdhani text-xs font-bold uppercase tracking-wide ${muted}`}>Bowling v them</p>
          <p className="font-rajdhani text-sm text-[var(--stats-text)]">
            {Math.floor(w.legalBalls / 6)}.{w.legalBalls % 6} ov · {w.runs} runs · <b>{w.wickets}</b> wkts · econ {f1(w.economy)}
          </p>
          <p className={`font-rajdhani text-xs ${muted}`}>
            By phase: {PHASE_KEYS.filter(k => w.byPhase[k].legalBalls > 0)
              .map(k => `${PHASE_LABEL[k]} ${w.byPhase[k].wickets}/${w.byPhase[k].runs} (${f1(rpo(w.byPhase[k].runs, w.byPhase[k].legalBalls))})`).join(' · ')}
          </p>
        </div>
      )}

      {p.insights.length > 0 && (
        <ul className="list-disc pl-4 space-y-0.5">
          {p.insights.map((t, i) => <li key={i} className="font-rajdhani text-xs text-[var(--stats-text-2)]">{t}</li>)}
        </ul>
      )}
    </div>
  )
}

export default async function OpponentScoutingPage({ searchParams }: { searchParams: { booking?: string } }) {
  const session = await getServerSession(authOptions)
  const user = session?.user as any
  if (!session) redirect('/login')
  if (user?.playerStatus === 'expelled') redirect('/')
  if (!user?.isCaptain && !user?.isGC && !user?.isAdmin) redirect('/fixtures')

  const ctx = await getScoutingContext(searchParams.booking)
  const sel = ctx.selected
  const team = ctx.scored.length ? scoutTeam(ctx.scored) : null
  const players = ctx.scored.length
    ? scoutPlayers(ctx.scored, ctx.available.map(a => ({ id: a.id, name: a.name })))
    : []
  const scoutedIds = new Set(players.map(p => p.playerId))
  const noHistory = ctx.available.filter(a => !scoutedIds.has(a.id))
  const meta = new Map(ctx.available.map(a => [a.id, a]))
  const won = ctx.history.filter(m => m.result === 'won').length
  const lost = ctx.history.filter(m => m.result === 'lost').length

  return (
    <div className="min-h-screen" style={{ backgroundColor: 'var(--stats-shell-bg)' }}>
      <SiteNav activePage="captains-scouting" back={{ fallbackHref: '/captains-corner', label: 'Squad Selection' }} />

      <div className="bg-[var(--stats-card-bg)] border-b border-[var(--stats-card-border)] px-5 md:px-8 lg:px-10 py-7">
        <div className="max-w-4xl mx-auto">
          <p className="text-[var(--stats-accent)] text-xs font-rajdhani font-semibold tracking-[3px] uppercase mb-1">Captains&rsquo; Corner</p>
          <h1 className="font-cinzel text-xl md:text-2xl font-bold text-[var(--stats-text)] tracking-wide">Opponent Scouting</h1>
          <p className={`font-rajdhani text-sm ${muted} mt-1 max-w-xl`}>
            What happened when we last met them, and how the players available for the next game did against them.
            Practice games are not counted.
          </p>
          {ctx.upcoming.length > 0 && (
            <div className="flex gap-2 flex-wrap mt-3">
              {ctx.upcoming.map(u => (
                <Link key={u.id} href={`/captains-corner/opponent-scouting?booking=${u.id}`} replace scroll={false}
                  className={`font-rajdhani text-xs font-bold px-3 py-1.5 rounded-full border transition-colors
                    ${u.id === sel?.id ? 'bg-[var(--stats-accent)] border-[var(--stats-accent)] text-white dark:text-ink'
                      : 'border-[var(--stats-card-border)] text-[var(--stats-text-muted)] hover:text-[var(--stats-text)]'}`}>
                  {fmtDate(u.gameDate)} · {u.opponentName}
                </Link>
              ))}
            </div>
          )}
        </div>
      </div>

      <div className="px-5 md:px-8 lg:px-10 py-6 max-w-4xl mx-auto space-y-4">
        {!sel ? (
          <div className={`${card} text-center`}><p className={`font-rajdhani text-sm ${muted}`}>No upcoming confirmed game with an opponent set.</p></div>
        ) : (
          <>
            <div className={card}>
              <p className="font-cinzel text-lg font-bold text-[var(--stats-text)]">vs {sel.opponentName}</p>
              <p className={`font-rajdhani text-sm ${muted}`}>
                {fmtDate(sel.gameDate)} · {sel.slotTime}{sel.format ? ` · ${sel.format}` : ''}{sel.tournamentName ? ` · ${sel.tournamentName}` : ''}
              </p>
              <p className="font-rajdhani text-sm text-[var(--stats-text)] mt-2">
                Met {ctx.history.length} {ctx.history.length === 1 ? 'time' : 'times'} · won {won}, lost {lost}
                {' · '}{ctx.scored.length} with ball-by-ball data
              </p>
              {ctx.history.length === 0 && <p className={`font-rajdhani text-sm ${muted} mt-1`}>We have no synced past match against this side (check the opponent is linked on /opponents).</p>}
              {ctx.history.length > 0 && ctx.scored.length === 0 && <p className={`font-rajdhani text-sm ${muted} mt-1`}>No commentary has been uploaded for those matches yet, so there is nothing to break down.</p>}
            </div>

            {team && (
              <>
                {team.insights.length > 0 && (
                  <div className={card}>
                    <h2 className={h2}>What stood out</h2>
                    <ul className="list-disc pl-4 space-y-1">
                      {team.insights.map((t, i) => <li key={i} className="font-rajdhani text-sm text-[var(--stats-text)]">{t}</li>)}
                    </ul>
                    <p className={`font-rajdhani text-[11px] ${muted} mt-2`}>Pointers are rule-based from the numbers below, not opinion.</p>
                  </div>
                )}

                <div className={card}>
                  <h2 className={h2}>Every meeting</h2>
                  <ul className="space-y-2">
                    {team.matches.map(m => (
                      <li key={m.bookingId} className="font-rajdhani text-sm">
                        <Link href={`/matches/history/${m.bookingId}`} className="font-bold text-[var(--stats-text)] underline decoration-dotted">{fmtDate(m.gameDate)}</Link>
                        {' '}<span className={`font-bold uppercase ${RESULT_CLS[m.result ?? 'nr']}`}>{m.result ?? '—'}</span>
                        <span className={muted}> · {m.scoreLine}{m.format ? ` · ${m.format}` : ''}</span>
                        <div className={`text-xs ${muted}`}>
                          {m.topBat && <>Our top: {m.topBat.name} {m.topBat.runs}({m.topBat.balls}). </>}
                          {m.topOppBat && <>Their top: {m.topOppBat.name} {m.topOppBat.runs}({m.topOppBat.balls}).</>}
                        </div>
                      </li>
                    ))}
                  </ul>
                </div>

                <div className={`${card} grid gap-5 md:grid-cols-2`}>
                  <PhaseTable title="Our batting by phase (all meetings)" t={team.batting} wicketLabel="Lost" />
                  <PhaseTable title="Our bowling by phase (all meetings)" t={team.bowling} wicketLabel="Taken" />
                </div>

                <div className={`${card} grid gap-5 md:grid-cols-2`}>
                  <div>
                    <h2 className={h2}>Their batters to watch</h2>
                    <ul className="space-y-1">
                      {team.threats.map(t => (
                        <li key={t.name} className="font-rajdhani text-sm text-[var(--stats-text)]">
                          <b>{t.name}</b> — {t.runs} off {t.balls} (SR {t.strikeRate != null ? Math.round(t.strikeRate) : '—'}), {t.innings} inn, out {t.dismissals}×
                        </li>
                      ))}
                    </ul>
                  </div>
                  <div>
                    <h2 className={h2}>How wickets fell</h2>
                    <p className="font-rajdhani text-sm text-[var(--stats-text)]">
                      Lost: {Object.entries(team.wicketsLost).filter(([, v]) => v > 0).map(([k, v]) => `${v} ${k}`).join(', ') || '—'}
                    </p>
                    <p className="font-rajdhani text-sm text-[var(--stats-text)]">
                      Took: {Object.entries(team.wicketsTaken).filter(([, v]) => v > 0).map(([k, v]) => `${v} ${k}`).join(', ') || '—'}
                    </p>
                    {team.oppBowlersWhoGotUs.length > 0 && (
                      <p className={`font-rajdhani text-xs ${muted} mt-1`}>
                        Their wicket-takers: {team.oppBowlersWhoGotUs.map(b => `${b.name} (${b.wickets})`).join(', ')}
                      </p>
                    )}
                  </div>
                </div>
              </>
            )}

            <div>
              <h2 className="font-cinzel text-base font-bold text-[var(--stats-text)] mb-1">Available for this game ({ctx.available.length})</h2>
              <p className={`font-rajdhani text-xs ${muted} mb-3`}>Players who marked Y, O or E, and how they did against {sel.opponentName}.</p>
              <div className="grid gap-3 md:grid-cols-2">
                {players.map(p => <PlayerCard key={p.playerId} p={p} url={meta.get(p.playerId)?.cricHeroesUrl ?? null} response={meta.get(p.playerId)?.response ?? ''} />)}
              </div>
              {noHistory.length > 0 && team && (
                <p className={`font-rajdhani text-xs ${muted} mt-3`}>
                  No ball-by-ball history against them: {noHistory.map(a => a.name).join(', ')}.
                </p>
              )}
              {ctx.available.length === 0 && <p className={`font-rajdhani text-sm ${muted}`}>Nobody has marked availability yet.</p>}
            </div>
          </>
        )}
      </div>
    </div>
  )
}
