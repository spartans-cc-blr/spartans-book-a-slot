import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { redirect } from 'next/navigation'
import { createServiceClient } from '@/lib/supabase'
import { hasMatchEnded } from '@/lib/matchStatus'
import { SCORECARD_IMPORTED_STATUSES, type CommentaryMatchOption } from '@/lib/commentary'
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

  // Only matches that have finished AND whose scorecard is already imported:
  // ball-by-ball attaches to the existing match_stats row, so there is nothing
  // to attach to until then. Nothing here refetches a scorecard.
  const { data: bookings } = await supabase
    .from('bookings')
    .select('id, game_date, slot_time, format, opponent_name, match_id')
    .eq('status', 'confirmed')
    .not('match_id', 'is', null)
    .order('game_date', { ascending: false })
    .limit(80)

  const ended = (bookings ?? []).filter(b => hasMatchEnded(b.game_date, b.slot_time, b.format))

  const { data: uploads } = ended.length
    ? await supabase
        .from('scorecard_uploads')
        .select('booking_id')
        .in('booking_id', ended.map(b => b.id))
        .in('status', [...SCORECARD_IMPORTED_STATUSES])
    : { data: [] as { booking_id: string }[] }

  const imported = new Set((uploads ?? []).map(u => u.booking_id))
  const matches: CommentaryMatchOption[] = ended
    .filter(b => imported.has(b.id))
    .map(b => ({
      booking_id:    b.id,
      match_id:      String(b.match_id),
      game_date:     b.game_date,
      format:        b.format,
      opponent_name: b.opponent_name,
    }))

  return (
    <>
      <SiteNav activePage="wrangler" />
      <main className="min-h-screen bg-ink-1 px-4 md:px-8 py-8 max-w-3xl mx-auto">
        <div className="mb-6">
          <h1 className="font-cinzel text-xl font-bold text-gold">Ball-by-ball Commentary</h1>
          <p className="font-rajdhani text-sm text-zinc-500 mt-1">
            Attach ball-by-ball data to a match whose scorecard is already in. Upload the printed
            CricHeroes commentary PDF for each innings — Spartans batting and the opponent batting.
          </p>
        </div>
        <CommentaryClient matches={matches} />
      </main>
    </>
  )
}
