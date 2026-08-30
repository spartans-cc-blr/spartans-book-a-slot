// Readiness check for the Monthly Recognition WhatsApp share button on
// /leaderboard (Honor Board → Monthly). The share is meant to go out only
// once every real match scheduled that month is fully wrapped up — game
// played AND its scorecard synced — so the club isn't recognising a month
// that's still missing a result. See features/leaderboard.md for the
// Monthly tab this feeds and features/post-match-scorecard.md for the
// synced/fees_applied status this checks.
//
// Deliberately Hub-DB only (createServiceClient), not the analytics DB —
// this only needs to know "is every confirmed booking this month synced",
// which lives entirely in bookings + scorecard_uploads.

import { createServiceClient } from '@/lib/supabase'

export interface MonthSyncStatus {
  totalMatches: number
  syncedMatches: number
  // true only once every real (non-practice) confirmed match scheduled
  // this month — including one still upcoming later in the same month —
  // has a scorecard_uploads row at 'synced' or 'fees_applied'. A month
  // with zero qualifying matches is never "ready" (nothing to recognise).
  allSynced: boolean
}

export async function getMonthSyncStatus(month: string): Promise<MonthSyncStatus> {
  const supabase = createServiceClient()

  const [year, mo] = month.split('-').map(Number)
  const startDate = `${month}-01`
  const endDate = new Date(Date.UTC(year, mo, 1)).toISOString().split('T')[0] // first day of next month

  const { data: bookings, error } = await supabase
    .from('bookings')
    .select('id, tournament:tournaments(is_practice), scorecard_uploads(status)')
    .eq('status', 'confirmed')
    .gte('game_date', startDate)
    .lt('game_date', endDate)

  if (error) throw new Error(error.message)

  // Practice-tournament bookings aren't real fixtures — see
  // getPracticeTournamentIds()'s comment in src/lib/playerStats.ts for the
  // same exclusion applied to every other stats surface.
  const relevant = (bookings ?? []).filter((b: any) => {
    const tournament = Array.isArray(b.tournament) ? b.tournament[0] : b.tournament
    return !tournament?.is_practice
  })

  const totalMatches = relevant.length
  const syncedMatches = relevant.filter((b: any) => {
    const su = Array.isArray(b.scorecard_uploads) ? b.scorecard_uploads[0] : b.scorecard_uploads
    return su?.status === 'synced' || su?.status === 'fees_applied'
  }).length

  return { totalMatches, syncedMatches, allSynced: totalMatches > 0 && syncedMatches === totalMatches }
}
