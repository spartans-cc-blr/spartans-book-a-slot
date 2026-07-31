import { redirect } from 'next/navigation'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { getLeaderboard, getFilterOptions, getAvailableMonths, getMonthlyPerformances } from '@/lib/playerStats'
import { SiteNav } from '@/components/ui/SiteNav'
import { LeaderboardFilters, type LeaderboardCategory, type Format } from '@/components/leaderboard/LeaderboardFilters'
import { LeaderboardTable } from '@/components/leaderboard/LeaderboardTable'
import { LeaderboardMilestones } from '@/components/leaderboard/LeaderboardMilestones'
import { LeaderboardMonthly } from '@/components/leaderboard/LeaderboardMonthly'
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
  searchParams?: { year?: string; month?: string; tournament?: string; ground?: string; category?: string; format?: string }
}) {
  const session = await getServerSession(authOptions)
  const user = session?.user as any

  if (!session) redirect('/login')
  if (user?.playerStatus === 'expelled') redirect('/')

  const currentYear = new Date().getFullYear()
  const yearParam = searchParams?.year
  const year: number | 'all' = yearParam === 'all' ? 'all' : (Number(yearParam) || currentYear)
  const category: LeaderboardCategory = isCategory(searchParams?.category) ? searchParams!.category as LeaderboardCategory : 'overall'

  const monthParam = searchParams?.month
  const month = monthParam && /^\d{4}-\d{2}$/.test(monthParam) ? monthParam : currentMonthStr()

  // Format is checkboxes, not a single-select: only a strict one-format
  // restriction is ever encoded in the URL (see LeaderboardFilters' toggle
  // logic) — both checked, or the param absent/invalid, both mean "no
  // restriction" and are treated identically.
  const formatParam = searchParams?.format
  const restrictedFormats: Format[] | undefined = formatParam === 'T20' || formatParam === 'T30' ? [formatParam] : undefined
  const formats: Set<Format> = new Set(restrictedFormats ?? (['T20', 'T30'] as Format[]))

  // Tournament/Ground option lists are themselves scoped by the current
  // Format selection, so picking T20-only immediately narrows both
  // dropdowns to tournaments/grounds that actually have a T20 match.
  const [{ tournaments, grounds }, availableMonths] = await Promise.all([
    getFilterOptions(restrictedFormats),
    getAvailableMonths(),
  ])

  const tournamentParam = searchParams?.tournament && searchParams.tournament !== 'all' ? searchParams.tournament : 'all'
  const groundParam = searchParams?.ground && searchParams.ground !== 'all' ? searchParams.ground : 'all'
  // If a previously-selected Tournament/Ground falls outside the current
  // Format-scoped list (e.g. it only ever played T30 and the captain just
  // restricted to T20), fall back to "All" rather than showing a <select>
  // with no matching option or silently querying an inconsistent combo.
  const tournamentId = tournamentParam === 'all' || tournaments.some(t => t.id === tournamentParam) ? tournamentParam : 'all'
  const groundId = groundParam === 'all' || grounds.some(g => g.id === groundParam) ? groundParam : 'all'

  // Monthly is scoped by month alone (no tournament/ground — see
  // LeaderboardFilters' Honor Board treatment); every other view keeps the
  // existing year/tournament/ground/format scoping.
  const rows = category === 'monthly'
    ? await getLeaderboard({ month, formats: restrictedFormats })
    : await getLeaderboard({
        year: year === 'all' ? undefined : year,
        tournamentId: tournamentId === 'all' ? undefined : tournamentId,
        groundId: groundId === 'all' ? undefined : groundId,
        formats: restrictedFormats,
      })

  const monthlyPerformances = category === 'monthly' ? await getMonthlyPerformances(month) : null

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
          category={category}
        />

        {category === 'overall' ? (
          <LeaderboardMilestones rows={rows} year={year} />
        ) : category === 'monthly' ? (
          <LeaderboardMonthly
            rows={rows}
            centuries={monthlyPerformances!.centuries}
            halfCenturies={monthlyPerformances!.halfCenturies}
            monthLabel={monthLabel(month)}
          />
        ) : (
          <LeaderboardTable key={category} rows={rows} category={category} tournamentFiltered={tournamentId !== 'all'} />
        )}

        <p className="font-rajdhani text-xs text-zinc-500 text-center mt-8 px-4">
          Stats are synced from CricHeroes, a third-party platform, on a best-effort basis. Small discrepancies may appear from time to time — we're actively working to catch these up.
        </p>
      </div>

      <footer className="border-t border-ink-4 py-5 text-center font-rajdhani text-xs text-zinc-600 mt-8">
        © 2026 <span className="text-gold-dim">Spartans Cricket Club</span> · Bengaluru · Est. 2014
      </footer>
    </div>
  )
}
