import { redirect } from 'next/navigation'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { createServiceClient } from '@/lib/supabase'
import { getLeaderboard, getFilterOptions, getAvailableMonths, getPerformances } from '@/lib/playerStats'
import { SiteNav } from '@/components/ui/SiteNav'
import { LeaderboardFilters, type LeaderboardCategory, type Format, type InningsKey } from '@/components/leaderboard/LeaderboardFilters'
import { LeaderboardTable } from '@/components/leaderboard/LeaderboardTable'
import { LeaderboardMilestones } from '@/components/leaderboard/LeaderboardMilestones'
import { LeaderboardMonthly } from '@/components/leaderboard/LeaderboardMonthly'
import { LeaderboardGlossary } from '@/components/leaderboard/LeaderboardGlossary'
import { CricHeroesIcon } from '@/components/matches/ScorecardVerifyPanel'
import { buildOverallGlossary, buildMonthlyGlossary, buildDetailedGlossary, detailedGlossaryTitle } from '@/lib/leaderboardGlossary'
import { getMonthSyncStatus } from '@/lib/monthlyRecognition'
import type { Metadata } from 'next'

export const metadata: Metadata = { title: 'Yours Statistically — Spartans CC' }
export const revalidate = 0

function isCategory(v: string | undefined): v is LeaderboardCategory {
  return v === 'overall' || v === 'monthly' || v === 'batting' || v === 'bowling' || v === 'fielding' || v === 'mvp'
}

function currentMonthStr(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

function monthLabel(m: string): string {
  const [y, mo] = m.split('-').map(Number)
  return new Date(Date.UTC(y, mo - 1, 1)).toLocaleDateString('en-IN', { month: 'long', year: 'numeric', timeZone: 'UTC' })
}

export default async function LeaderboardPage({
  searchParams,
}: {
  searchParams?: { year?: string; month?: string; tournament?: string; ground?: string; category?: string; format?: string; innings?: string }
}) {
  const session = await getServerSession(authOptions)
  const user = session?.user as any

  // Preserve the deep link (month/category etc.) through sign-in — a
  // Monthly Recognition link shared to WhatsApp is often opened signed-out,
  // and without this an unauthenticated visitor lands on '/' after signing
  // in instead of back on the specific month they were sent. See
  // src/app/login/page.tsx for the other half of this.
  if (!session) {
    const qs = new URLSearchParams(
      Object.entries(searchParams ?? {}).filter(([, v]) => v !== undefined) as [string, string][]
    ).toString()
    redirect(`/login?callbackUrl=${encodeURIComponent('/leaderboard' + (qs ? `?${qs}` : ''))}`)
  }
  if (user?.playerStatus === 'expelled') redirect('/')

  const currentYear = new Date().getFullYear()
  const yearParam = searchParams?.year
  const year: number | 'all' = yearParam === 'all' ? 'all' : (Number(yearParam) || currentYear)
  const category: LeaderboardCategory = isCategory(searchParams?.category) ? searchParams!.category as LeaderboardCategory : 'overall'

  // Clamped to the current month — a hand-edited URL (?month=2026-12)
  // shouldn't be able to request a month that hasn't happened yet.
  const monthParam = searchParams?.month
  const requestedMonth = monthParam && /^\d{4}-\d{2}$/.test(monthParam) ? monthParam : currentMonthStr()
  const month = requestedMonth > currentMonthStr() ? currentMonthStr() : requestedMonth

  // Format is checkboxes, not a single-select: only a strict one-format
  // restriction is ever encoded in the URL (see LeaderboardFilters' toggle
  // logic) — both checked, or the param absent/invalid, both mean "no
  // restriction" and are treated identically.
  const formatParam = searchParams?.format
  const restrictedFormats: Format[] | undefined = formatParam === 'T20' || formatParam === 'T30' ? [formatParam] : undefined
  const formats: Set<Format> = new Set(restrictedFormats ?? (['T20', 'T30'] as Format[]))

  // Defending/Chasing — same both-checked-means-no-restriction convention
  // as Format. Only ever surfaced (and therefore only ever meaningful) on
  // Detailed → MVP; a hand-edited URL setting it alongside another
  // category is simply ignored rather than silently scoping a table the
  // control isn't shown next to.
  const inningsParam = searchParams?.innings
  const restrictedInnings: InningsKey[] | undefined =
    inningsParam === 'defending' || inningsParam === 'chasing' ? [inningsParam] : undefined
  const innings: Set<InningsKey> = new Set(restrictedInnings ?? (['defending', 'chasing'] as InningsKey[]))

  // Tournament/Ground option lists are themselves scoped by the current
  // Format selection, so picking T20-only immediately narrows both
  // dropdowns to tournaments/grounds that actually have a T20 match.
  const supabase = createServiceClient()
  const [{ tournaments, grounds }, availableMonths, myCricheroesUrl] = await Promise.all([
    getFilterOptions(restrictedFormats),
    getAvailableMonths(),
    user?.playerId
      ? supabase.from('players').select('cricheroes_url').eq('id', user.playerId).single()
          .then(({ data }) => data?.cricheroes_url ?? null)
      : Promise.resolve(null),
  ])

  const tournamentParam = searchParams?.tournament && searchParams.tournament !== 'all' ? searchParams.tournament : 'all'
  const groundParam = searchParams?.ground && searchParams.ground !== 'all' ? searchParams.ground : 'all'
  // If a previously-selected Tournament/Ground falls outside the current
  // Format-scoped list (e.g. it only ever played T30 and the captain just
  // restricted to T20), fall back to "All" rather than showing a <select>
  // with no matching option or silently querying an inconsistent combo.
  const tournamentId = tournamentParam === 'all' || tournaments.some(t => t.id === tournamentParam) ? tournamentParam : 'all'
  const groundId = groundParam === 'all' || grounds.some(g => g.id === groundParam) ? groundParam : 'all'
  const tournamentName = tournamentId === 'all' ? null : (tournaments.find(t => t.id === tournamentId)?.name ?? null)
  const groundName = groundId === 'all' ? null : (grounds.find(g => g.id === groundId)?.name ?? null)

  // Monthly is scoped by month alone (no tournament/ground — see
  // LeaderboardFilters' Honor Board treatment); every other view keeps the
  // existing year/tournament/ground/format scoping.
  const overallFilters = {
    year: year === 'all' ? undefined : year,
    tournamentId: tournamentId === 'all' ? undefined : tournamentId,
    groundId: groundId === 'all' ? undefined : groundId,
    formats: restrictedFormats,
    innings: category === 'mvp' ? restrictedInnings?.[0] : undefined,
  }

  const rows = category === 'monthly'
    ? await getLeaderboard({ month, formats: restrictedFormats })
    : await getLeaderboard(overallFilters)

  // Two calls for Monthly — `getPerformances()`'s `includePractice` scopes
  // the *whole* match set a call draws from, so Centuries/5-Wicket Hauls
  // (practice-inclusive) and Half-Centuries/3-Wicket Hauls (practice-
  // exclusive, same as every other aggregate/ranking metric) can't come off
  // one shared call without one side leaking into the other. A century or
  // 5-wicket haul is still worth surfacing even from a practice game; the
  // two more common bands stay "real stats only". See `features/leaderboard.md`
  // §5/§5.1/§10 for the full history (removed, then restored, on the
  // Monthly tab specifically).
  const monthlyPerformances = category === 'monthly' ? await getPerformances({ month, includePractice: true }) : null
  const monthlyPerformancesNoPractice = category === 'monthly' ? await getPerformances({ month }) : null

  // WhatsApp share for the Monthly tab, open to any signed-in player — see
  // src/lib/monthlyRecognition.ts. The share button itself only renders
  // once every real match scheduled this month has a synced scorecard.
  const monthSyncStatus = category === 'monthly' ? await getMonthSyncStatus(month) : null

  // Individual centuries/5-wicket-haul lists for the Overall tab's bands —
  // fetched for a specific year (not "All Time") or whenever a
  // Tournament/Ground filter is active (scoped), matching the same scope as
  // `rows` above. Neither condition met ("All Time", no scope) keeps the
  // plain tied-cards Most 100s/50s treatment instead.
  const scoped = !!(tournamentName || groundName)
  const yearlyPerformances = category === 'overall' && (year !== 'all' || scoped) ? await getPerformances({ ...overallFilters, includePractice: true }) : null

  const glossaryTitle = category === 'overall' ? 'Overall'
    : category === 'monthly' ? 'Monthly'
    : detailedGlossaryTitle(category)
  const glossaryEntries = category === 'overall' ? buildOverallGlossary(year, tournamentName, groundName)
    : category === 'monthly' ? buildMonthlyGlossary(monthLabel(month))
    : buildDetailedGlossary(category)

  return (
    <div className="min-h-screen bg-ink grain">
      <SiteNav activePage="leaderboard" />

      <div className="bg-ink-2 border-b border-ink-4 px-5 md:px-8 lg:px-10 py-7 relative overflow-hidden">
        <div className="absolute -top-8 -right-8 w-48 h-48 rounded-full pointer-events-none"
          style={{ background: 'radial-gradient(circle, rgba(201,168,76,0.1) 0%, transparent 70%)' }} />
        <p className="text-gold text-xs font-rajdhani font-semibold tracking-[3px] uppercase mb-2 flex items-center gap-2">
          <span className="w-4 h-px bg-gold inline-block" />
          Performance
        </p>
        <h1 className="font-cinzel text-2xl md:text-3xl font-bold text-parchment tracking-wide">Yours Statistically</h1>

        {user?.playerId && (
          <div className="flex flex-wrap items-center gap-4 mt-3">
            <a href={`/players/${user.playerId}/stats`}
              className="font-rajdhani text-sm font-semibold text-gold hover:text-gold-light transition-colors">
              My stats on Hub →
            </a>
            {myCricheroesUrl ? (
              <a href={myCricheroesUrl} target="_blank" rel="noopener noreferrer"
                className="font-rajdhani text-sm font-semibold text-parchment hover:text-gold transition-colors flex items-center gap-1.5">
                <CricHeroesIcon size={16} /> My stats on CricHeroes
              </a>
            ) : (
              <a href="/profile"
                className="font-rajdhani text-xs text-amber-400 hover:text-amber-300 bg-amber-950/30 border border-amber-800/50 rounded px-2.5 py-1 flex items-center gap-1.5 transition-colors">
                <CricHeroesIcon size={14} /> Add your CricHeroes profile to see your stats there
              </a>
            )}
          </div>
        )}
      </div>

      <div className="px-5 md:px-8 lg:px-10 py-6">
        <LeaderboardFilters
          years={[currentYear, currentYear - 1, currentYear - 2]}
          months={availableMonths}
          tournaments={tournaments}
          grounds={grounds}
          year={year}
          month={month}
          tournamentId={tournamentId}
          groundId={groundId}
          formats={formats}
          innings={innings}
          category={category}
          monthFullLabel={category === 'monthly' ? monthLabel(month) : null}
          monthSyncStatus={monthSyncStatus}
        />

        {category === 'overall' ? (
          <LeaderboardMilestones
            rows={rows}
            year={year}
            scoped={scoped}
            centuries={yearlyPerformances?.centuries ?? null}
            fiveWicketHauls={yearlyPerformances?.fiveWicketHauls ?? null}
          />
        ) : category === 'monthly' ? (
          <LeaderboardMonthly
            rows={rows}
            centuries={monthlyPerformances!.centuries}
            halfCenturies={monthlyPerformancesNoPractice!.halfCenturies}
            fiveWicketHauls={monthlyPerformances!.fiveWicketHauls}
            threeWicketHauls={monthlyPerformancesNoPractice!.threeWicketHauls}
            monthLabel={monthLabel(month)}
          />
        ) : (
          <LeaderboardTable key={category} rows={rows} category={category} tournamentFiltered={tournamentId !== 'all'} />
        )}

        <p className="font-rajdhani text-xs text-zinc-500 text-center mt-8 px-4">
          Stats are synced from CricHeroes, a third-party platform, on a best-effort basis. Small discrepancies may appear from time to time — we're actively working to catch these up. Practice games are excluded from every ranking and aggregate above — only real tournament fixtures count towards these numbers — though a century or 5-wicket haul from a practice game is still recognised in the Centuries/5-Wicket Hauls lists.
        </p>

        <LeaderboardGlossary title={glossaryTitle} entries={glossaryEntries} />
      </div>

      <footer className="border-t border-ink-4 py-5 text-center font-rajdhani text-xs text-zinc-600 mt-8">
        © 2026 <span className="text-gold-dim">Spartans Cricket Club</span> · Bengaluru · Est. 2014
      </footer>
    </div>
  )
}
