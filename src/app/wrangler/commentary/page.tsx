import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { redirect } from 'next/navigation'
import { createServiceClient } from '@/lib/supabase'
import { hasMatchEnded } from '@/lib/matchStatus'
import type { BbbStatus, CommentaryMatchOption } from '@/lib/commentary'
import { createAnalyticsClient } from '@/lib/playerIdentityResolution'
import { SiteNav } from '@/components/ui/SiteNav'
import { CommentaryClient } from '@/components/wrangler/CommentaryClient'
import type { Metadata } from 'next'

export const metadata: Metadata = { title: 'Ball-by-ball Commentary — Spartans CC' }
export const revalidate = 0

export default async function CommentaryPage() {
  const session = await getServerSession(authOptions)
  const user    = session?.user as any

  // vibe-security: role check before any data fetch, re-validated on every render
  if (!session) redirect('/login')
  if (!user?.isWrangler && !user?.isAdmin) redirect('/')

  const supabase = createServiceClient()

  // Every finished match whose scorecard is already in: ball-by-ball attaches to the existing
  // match_stats row, so there is nothing to attach to until then. "Scorecard is in" is decided by
  // match_stats_cache, the same table the match history reads, so this list matches the history.
  // (It used to be capped to the newest 80 bookings and to ones with a scorecard_uploads row, which
  // hid older and backfilled matches.) Nothing here refetches a scorecard.
  const { data: cached } = await supabase
    .from('match_stats_cache')
    .select('booking_id')
    .not('booking_id', 'is', null)
  const inCache = new Set((cached ?? []).map(c => c.booking_id as string))

  const { data: bookings } = await supabase
    .from('bookings')
    .select('id, game_date, slot_time, format, opponent_name, match_id, cricheroes_url')
    .eq('status', 'confirmed')
    .not('match_id', 'is', null)
    .order('game_date', { ascending: false })

  // Ball-by-ball status per match from the analytics DB's match_coverage view (see
  // cricket-intelligence-foundation.md). Best-effort: if it can't be read the page still works,
  // it just shows no status and no "needs commentary" panel.
  const coverage = new Map<string, BbbStatus>()
  const analytics = createAnalyticsClient()
  if (analytics) {
    const { data: cov, error: covErr } = await analytics
      .from('match_coverage')
      .select('match_id, bbb_status')
      .limit(1000)
    if (covErr) console.error('[commentary] match_coverage read failed:', covErr.message)
    for (const c of cov ?? []) coverage.set(String(c.match_id), c.bbb_status as BbbStatus)
  }

  const matches: CommentaryMatchOption[] = (bookings ?? [])
    .filter(b => inCache.has(b.id) && hasMatchEnded(b.game_date, b.slot_time, b.format))
    .map(b => ({
      booking_id:    b.id,
      match_id:      String(b.match_id),
      game_date:     b.game_date,
      format:        b.format,
      opponent_name: b.opponent_name,
      cricheroes_url: b.cricheroes_url ?? null,
      bbb_status:    coverage.get(String(b.match_id)),
    }))

  return (
    <>
      <SiteNav activePage="wrangler" />
      <div className="min-h-screen bg-parchment dark:bg-ink">
      <main className="px-4 md:px-8 py-8 max-w-3xl mx-auto">
        <div className="mb-6">
          <h1 className="font-cinzel text-xl font-bold text-gold">Ball-by-ball Commentary</h1>
          <p className="font-rajdhani text-sm text-[#78716C] dark:text-zinc-500 mt-1">
            Attach ball-by-ball data to a match whose scorecard is already in. Upload the printed
            CricHeroes commentary PDF for each innings — Spartans batting and the opponent batting.
          </p>
        </div>
        <CommentaryClient matches={matches} />
      </main>
      </div>
    </>
  )
}
