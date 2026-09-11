// /team-stats — "Team Record": Spartans' own win/loss record, sliced by
// tournament, ground, opponent (with marquee head-to-head), format,
// league/knockout, defending/chasing, toss, captain, year, month and slot,
// plus headline records and current form. See features/team-stats.md.
//
// Server Component, same access gate as /leaderboard (any signed-in,
// non-expelled member). One fetch (getTeamMatches) then pure in-memory
// slicing — see src/lib/teamStats.ts for why. Themed with the shared
// --stats-* tokens so this and Yours Statistically read as one stats area.

import { redirect } from 'next/navigation'
import Link from 'next/link'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { SiteNav } from '@/components/ui/SiteNav'
import { TeamFilterBar, type TeamFilterState } from '@/components/team/TeamFilterBar'
import { TeamSplitTable, FormPills, MatchList } from '@/components/team/TeamSplitTable'
import {
  getTeamMatches, applyFilters, summarize, recentForm, currentStreak, splitBy, computeRecords,
  filterOptions, sortNewestFirst, SPLIT_LABEL,
  type FormatFilter, type InningsFilter, type StageFilter, type SplitDimension,
} from '@/lib/teamStats'
import type { Metadata } from 'next'

export const metadata: Metadata = { title: 'Team Record — Spartans CC' }
export const revalidate = 0

const DIMENSIONS: SplitDimension[] = ['tournament', 'ground', 'opponent', 'format', 'stage', 'innings', 'toss', 'captain', 'year', 'month', 'slot']

function pickEnum<T extends string>(v: string | undefined, allowed: readonly T[], fallback: T): T {
  return (allowed as readonly string[]).includes(v ?? '') ? (v as T) : fallback
}

type SearchParams = Partial<Record<'year' | 'format' | 'tournament' | 'ground' | 'opponent' | 'innings' | 'stage' | 'practice' | 'by', string>>

export default async function TeamStatsPage({ searchParams }: { searchParams?: SearchParams }) {
  const session = await getServerSession(authOptions)
  const user = session?.user as any
  if (!session) {
    const qs = new URLSearchParams(Object.entries(searchParams ?? {}).filter(([, v]) => v !== undefined) as [string, string][]).toString()
    redirect(`/login?callbackUrl=${encodeURIComponent('/team-stats' + (qs ? `?${qs}` : ''))}`)
  }
  if (user?.playerStatus === 'expelled') redirect('/')

  const canManageOpponents = !!user?.isCaptain || !!user?.isGC || !!user?.isWrangler || !!user?.isAdmin

  const all = await getTeamMatches()
  const options = filterOptions(all)

  const yearParam = searchParams?.year && /^\d{4}$/.test(searchParams.year) && options.years.includes(searchParams.year) ? searchParams.year : 'all'
  const state: TeamFilterState = {
    year:       yearParam,
    format:     pickEnum<FormatFilter>(searchParams?.format, ['all', 'T20', 'T30', 'other'], 'all'),
    tournament: options.tournaments.some(t => t.id === searchParams?.tournament) ? searchParams!.tournament! : 'all',
    ground:     options.grounds.some(g => g.id === searchParams?.ground) ? searchParams!.ground! : 'all',
    opponent:   options.opponents.some(o => o.id === searchParams?.opponent) ? searchParams!.opponent! : 'all',
    innings:    pickEnum<InningsFilter>(searchParams?.innings, ['all', 'defending', 'chasing'], 'all'),
    stage:      pickEnum<StageFilter>(searchParams?.stage, ['all', 'league', 'knockout'], 'all'),
    practice:   searchParams?.practice === '1',
    by:         pickEnum<SplitDimension>(searchParams?.by, DIMENSIONS, 'tournament'),
  }

  const matches = applyFilters(all, {
    year: state.year === 'all' ? null : Number(state.year),
    format: state.format,
    tournamentId: state.tournament === 'all' ? null : state.tournament,
    groundId: state.ground === 'all' ? null : state.ground,
    opponentKey: state.opponent === 'all' ? null : state.opponent,
    innings: state.innings,
    stage: state.stage,
    includePractice: state.practice,
  })

  const summary = summarize(matches)
  const form = recentForm(matches, 5)
  const streak = currentStreak(matches)
  const rows = splitBy(matches, state.by)
  const records = computeRecords(matches)
  const marquee = state.by === 'opponent' ? [] : splitBy(matches, 'opponent').filter(r => r.meta?.isMarquee)
  const anyMarqueeDefined = all.some(m => m.isMarquee)
  const unlinkedCount = new Set(matches.filter(m => !m.opponentId).map(m => m.opponentName.toLowerCase())).size
  const recent = sortNewestFirst(matches).slice(0, 5)

  return (
    <div className="min-h-screen bg-[var(--stats-shell-bg)] dark:bg-ink grain">
      <SiteNav activePage="team-stats" />

      <div className="bg-[var(--stats-card-bg)] dark:bg-ink-2 border-b border-[var(--stats-divider)] dark:border-ink-4 px-5 md:px-8 lg:px-10 py-7 relative overflow-hidden">
        <div className="absolute -top-8 -right-8 w-48 h-48 rounded-full pointer-events-none"
          style={{ background: 'radial-gradient(circle, rgba(201,168,76,0.1) 0%, transparent 70%)' }} />
        <p className="text-[var(--stats-accent)] dark:text-gold text-xs font-rajdhani font-semibold tracking-[3px] uppercase mb-2 flex items-center gap-2">
          <span className="w-4 h-px bg-[var(--stats-accent)] dark:bg-gold inline-block" />
          Performance
        </p>
        <h1 className="font-cinzel text-2xl md:text-3xl font-bold text-[var(--stats-text)] dark:text-parchment tracking-wide">Team Record</h1>
        <div className="flex flex-wrap items-center gap-4 mt-3">
          <Link href="/leaderboard" className="font-rajdhani text-sm font-semibold text-[var(--stats-accent)] dark:text-gold hover:text-[var(--stats-accent-dim)] dark:hover:text-gold-light transition-colors">
            Player stats — Yours Statistically →
          </Link>
          {canManageOpponents && (
            <Link href="/opponents" className="font-rajdhani text-sm font-semibold text-[var(--stats-text)] dark:text-parchment hover:text-[var(--stats-accent)] dark:hover:text-gold transition-colors">
              ⚔️ Manage opponents{unlinkedCount > 0 ? ` (${unlinkedCount} unlinked)` : ''}
            </Link>
          )}
        </div>
      </div>

      <div className="px-5 md:px-8 lg:px-10 py-6">
        <TeamFilterBar {...state} years={options.years} tournaments={options.tournaments} grounds={options.grounds} opponents={options.opponents} />

        {/* Headline strip */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-3">
          <Stat label="Played" value={String(summary.played)} />
          <Stat label="Won" value={String(summary.won)} tone="win" />
          <Stat label="Lost" value={String(summary.lost)} tone="loss" />
          <Stat label="Win %" value={summary.winPct === null ? '–' : `${summary.winPct}%`} sub={summary.tied + summary.nr > 0 ? `${summary.tied} tied · ${summary.nr} no result` : undefined} />
        </div>
        <div className="bg-[var(--stats-card-bg)] dark:bg-ink-3 border border-[var(--stats-card-border)] dark:border-ink-5 rounded-lg px-4 py-3 mb-6 flex flex-wrap items-center gap-x-6 gap-y-2">
          <div className="flex items-center gap-3">
            <span className="font-rajdhani text-[10px] font-bold tracking-widest uppercase text-[var(--stats-text-muted)] dark:text-zinc-500">Current form</span>
            <FormPills form={form} size="lg" />
          </div>
          {streak && (
            <span className="font-rajdhani text-sm text-[var(--stats-text-2)] dark:text-zinc-300">
              Streak: <span className={`font-bold ${streak.letter === 'W' ? 'text-emerald-600 dark:text-emerald-400' : streak.letter === 'L' ? 'text-red-600 dark:text-red-400' : 'text-amber-600 dark:text-amber-400'}`}>
                {streak.length} {streak.letter === 'W' ? 'win' : streak.letter === 'L' ? 'loss' : 'tie'}{streak.length === 1 ? '' : streak.letter === 'L' ? 'es' : 's'}
              </span>
            </span>
          )}
          <span className="font-rajdhani text-xs text-[var(--stats-text-faint)] dark:text-zinc-600 ml-auto">Most recent first</span>
        </div>

        {/* Marquee head-to-head — pinned above whichever split is selected */}
        {state.by !== 'opponent' && (marquee.length > 0 || (canManageOpponents && !anyMarqueeDefined)) && (
          <section className="mb-6">
            <SectionHeading title="Marquee opponents — head to head" link={{ href: '/team-stats?by=opponent', label: 'All opponents →' }} />
            {marquee.length > 0 ? (
              <TeamSplitTable rows={marquee} />
            ) : (
              <p className="font-rajdhani text-sm text-[var(--stats-text-muted)] dark:text-zinc-500">
                No marquee opponents yet — mark the rivals you care about on <Link href="/opponents" className="text-[var(--stats-accent)] dark:text-gold underline decoration-dotted">Manage opponents</Link> and they&rsquo;ll be pinned here.
              </p>
            )}
          </section>
        )}

        {/* The split */}
        <section className="mb-6">
          <SectionHeading title={`By ${SPLIT_LABEL[state.by].toLowerCase()}`} />
          {state.by === 'opponent' && unlinkedCount > 0 && (
            <p className="font-rajdhani text-xs text-[var(--stats-text-muted)] dark:text-zinc-500 mb-2">
              Opponents marked <span className="font-bold uppercase tracking-widest text-[10px]">unlinked</span> are grouped by the exact spelling on the booking — link them on{' '}
              {canManageOpponents ? <Link href="/opponents" className="text-[var(--stats-accent)] dark:text-gold underline decoration-dotted">Manage opponents</Link> : 'Manage opponents (captains, GC, wranglers)'} so different spellings of the same club count together.
            </p>
          )}
          <TeamSplitTable rows={rows} showOpponentInMatches={state.by !== 'opponent'} />
        </section>

        {/* Records */}
        {records.length > 0 && (
          <section className="mb-6">
            <SectionHeading title="Records" />
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
              {records.map(r => (
                <Link key={r.title} href={`/matches/history/${r.match.bookingId}`}
                  className="bg-[var(--stats-card-bg)] dark:bg-ink-3 border border-[var(--stats-card-border)] dark:border-ink-5 rounded-lg px-4 py-3 hover:border-[var(--stats-accent-dim)] dark:hover:border-gold-dim transition-colors">
                  <p className="font-rajdhani text-[10px] font-bold tracking-widest uppercase text-[var(--stats-text-muted)] dark:text-zinc-500">{r.title}</p>
                  <p className="font-cinzel text-xl font-bold text-[var(--stats-accent)] dark:text-gold mt-1">{r.value}</p>
                  <p className="font-rajdhani text-xs text-[var(--stats-text-2)] dark:text-zinc-400 mt-1 truncate">vs {r.match.opponentLabel}</p>
                  <p className="font-rajdhani text-[11px] text-[var(--stats-text-faint)] dark:text-zinc-600 truncate">{r.match.tournamentName ?? '—'} · {r.match.gameDate}</p>
                </Link>
              ))}
            </div>
          </section>
        )}

        {/* Recent matches */}
        {recent.length > 0 && (
          <section className="mb-6">
            <SectionHeading title="Recent matches" link={{ href: '/matches/history?month=all', label: 'Match history →' }} />
            <div className="bg-[var(--stats-card-bg)] dark:bg-ink-3 border border-[var(--stats-card-border)] dark:border-ink-5 rounded-lg overflow-hidden">
              <MatchList matches={recent} />
            </div>
          </section>
        )}

        <p className="font-rajdhani text-xs text-[var(--stats-text-muted)] dark:text-zinc-500 text-center mt-8 px-4">
          Covers every confirmed Hub booking whose CricHeroes scorecard has synced. Win % excludes no-results. Defending/chasing and toss splits come from the scorecard&rsquo;s toss line; League/Knockout from the booking&rsquo;s stage flag (unclassified games count as league). Practice games are excluded unless &ldquo;Include practice&rdquo; is ticked.
        </p>
      </div>

      <footer className="border-t border-[var(--stats-divider)] dark:border-ink-4 py-5 text-center font-rajdhani text-xs text-[var(--stats-text-faint)] dark:text-zinc-600 mt-8">
        © 2026 <span className="text-[var(--stats-accent-dim)] dark:text-gold-dim">Spartans Cricket Club</span> · Bengaluru · Est. 2014
      </footer>
    </div>
  )
}

function Stat({ label, value, sub, tone }: { label: string; value: string; sub?: string; tone?: 'win' | 'loss' }) {
  const colour = tone === 'win' ? 'text-emerald-600 dark:text-emerald-400' : tone === 'loss' ? 'text-red-600 dark:text-red-400' : 'text-[var(--stats-accent)] dark:text-gold'
  return (
    <div className="bg-[var(--stats-card-bg)] dark:bg-ink-3 border border-[var(--stats-card-border)] dark:border-ink-5 rounded-lg px-4 py-3">
      <p className="font-rajdhani text-[10px] font-bold tracking-widest uppercase text-[var(--stats-text-muted)] dark:text-zinc-500">{label}</p>
      <p className={`font-cinzel text-2xl font-bold mt-1 ${colour}`}>{value}</p>
      {sub && <p className="font-rajdhani text-[11px] text-[var(--stats-text-faint)] dark:text-zinc-600 mt-0.5">{sub}</p>}
    </div>
  )
}

function SectionHeading({ title, link }: { title: string; link?: { href: string; label: string } }) {
  return (
    <div className="flex items-baseline justify-between mb-2">
      <h2 className="font-rajdhani text-xs font-bold tracking-[3px] uppercase text-[var(--stats-text-muted)] dark:text-zinc-500">{title}</h2>
      {link && <Link href={link.href} className="font-rajdhani text-xs font-semibold text-[var(--stats-accent)] dark:text-gold hover:underline">{link.label}</Link>}
    </div>
  )
}
