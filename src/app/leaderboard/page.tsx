import { redirect } from 'next/navigation'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { createServiceClient } from '@/lib/supabase'
import { getLeaderboard } from '@/lib/playerStats'
import { SiteNav } from '@/components/ui/SiteNav'
import { LeaderboardFilters, type LeaderboardCategory } from '@/components/leaderboard/LeaderboardFilters'
import { LeaderboardTable } from '@/components/leaderboard/LeaderboardTable'
import type { Metadata } from 'next'

export const metadata: Metadata = { title: 'Leaderboard — Spartans CC' }
export const revalidate = 0

function isCategory(v: string | undefined): v is LeaderboardCategory {
  return v === 'batting' || v === 'bowling' || v === 'fielding' || v === 'mvp'
}

export default async function LeaderboardPage({
  searchParams,
}: {
  searchParams?: { year?: string; tournament?: string; category?: string }
}) {
  const session = await getServerSession(authOptions)
  const user = session?.user as any

  if (!session) redirect('/login')
  if (user?.playerStatus === 'expelled') redirect('/')

  const currentYear = new Date().getFullYear()
  const yearParam = searchParams?.year
  const year: number | 'all' = yearParam === 'all' ? 'all' : (Number(yearParam) || currentYear)
  const tournamentId = searchParams?.tournament && searchParams.tournament !== 'all' ? searchParams.tournament : 'all'
  const category: LeaderboardCategory = isCategory(searchParams?.category) ? searchParams!.category as LeaderboardCategory : 'batting'

  const supabase = createServiceClient()
  const { data: tournaments } = await supabase
    .from('tournaments')
    .select('id, name')
    .order('name', { ascending: true })

  const rows = await getLeaderboard({
    year: year === 'all' ? undefined : year,
    tournamentId: tournamentId === 'all' ? undefined : tournamentId,
  })

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
        <h1 className="font-cinzel text-2xl md:text-3xl font-bold text-parchment tracking-wide">Leaderboard</h1>
      </div>

      <div className="px-5 md:px-8 lg:px-10 py-6">
        <LeaderboardFilters
          years={[currentYear, currentYear - 1, currentYear - 2]}
          tournaments={tournaments ?? []}
          year={year}
          tournamentId={tournamentId}
          category={category}
        />

        <LeaderboardTable key={category} rows={rows} category={category} />
      </div>

      <footer className="border-t border-ink-4 py-5 text-center font-rajdhani text-xs text-zinc-600 mt-8">
        © 2026 <span className="text-gold-dim">Spartans Cricket Club</span> · Bengaluru · Est. 2014
      </footer>
    </div>
  )
}
