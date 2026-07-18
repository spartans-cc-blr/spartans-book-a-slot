// Admin performance report — /admin/stats. Auth is enforced by
// src/app/admin/layout.tsx (redirects non-admins before this ever
// renders), same pattern every other /admin/* page relies on. Full
// history by default (no year restriction) — the AGM award use case needs
// the whole record, not just the current season.

import { createServiceClient } from '@/lib/supabase'
import { getLeaderboard } from '@/lib/playerStats'
import { AdminStatsFilters, type AdminStatsCategory } from '@/components/admin/AdminStatsFilters'
import { AdminStatsTable } from '@/components/admin/AdminStatsTable'

export const revalidate = 0

function isCategory(v: string | undefined): v is AdminStatsCategory {
  return v === 'runs' || v === 'wickets' || v === 'fielding' || v === 'mvp'
}

export default async function AdminStatsPage({
  searchParams,
}: {
  searchParams?: { year?: string; tournament?: string; category?: string }
}) {
  const currentYear = new Date().getFullYear()
  const yearParam = searchParams?.year
  // Admin default is full history — 'all' unless a specific year is chosen.
  const year: number | 'all' = yearParam && yearParam !== 'all' ? (Number(yearParam) || 'all') : 'all'
  const tournamentId = searchParams?.tournament && searchParams.tournament !== 'all' ? searchParams.tournament : 'all'
  const category: AdminStatsCategory = isCategory(searchParams?.category) ? searchParams!.category as AdminStatsCategory : 'runs'

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
    <div>
      <div className="mb-6">
        <h1 className="font-cinzel text-xl font-bold text-gold">Performance Report</h1>
        <p className="font-rajdhani text-zinc-500 text-sm mt-1">
          Career and season stats across every reconciled player — useful for AGM awards and squad selection.
        </p>
      </div>

      <AdminStatsFilters
        years={[currentYear, currentYear - 1, currentYear - 2, currentYear - 3]}
        tournaments={tournaments ?? []}
        year={year}
        tournamentId={tournamentId}
        category={category}
      />

      <AdminStatsTable rows={rows} category={category} />
    </div>
  )
}
