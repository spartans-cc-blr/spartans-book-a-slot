import { getServerSession } from 'next-auth'
import { redirect, notFound } from 'next/navigation'
import Link from 'next/link'
import { authOptions } from '@/lib/auth'
import { createServiceClient } from '@/lib/supabase'
import { SiteNav } from '@/components/ui/SiteNav'
import { ScorecardTables } from '@/components/matches/ScorecardTables'

export const revalidate = 0

// Result is the headline of a completed match — win gets the celebratory
// solid-fill pill, anything else is stated plainly in colour (mirrors
// MatchHistoryClient's resultBadgeStyle so both surfaces read the same way).
function resultBadgeStyle(result: string | null): { pill: boolean; bg: string; color: string; label: string } {
  const r = (result ?? '').toLowerCase()
  if (r.includes('win'))  return { pill: true,  bg: '#059669', color: '#FFFFFF', label: 'WON' }
  if (r.includes('los'))  return { pill: false, bg: '',        color: '#F87171', label: 'LOST' }
  if (r.includes('tie'))  return { pill: false, bg: '',        color: '#FBBF24', label: 'TIED' }
  return { pill: false, bg: '', color: '#94A3B8', label: (result ?? 'NO RESULT').toUpperCase() }
}

function scoreLine(stats: {
  team_total: number | null; team_wickets: number | null; team_overs: number | null
  opponent_total: number | null; opponent_wickets: number | null; opponent_overs: number | null
}): string {
  const own = `${stats.team_total ?? '—'}/${stats.team_wickets ?? '—'} (${stats.team_overs ?? '—'} ov)`
  const opp = `${stats.opponent_total ?? '—'}/${stats.opponent_wickets ?? '—'} (${stats.opponent_overs ?? '—'} ov)`
  return `${own} vs ${opp}`
}

function formatDate(dateStr: string): string {
  return new Date(`${dateStr}T00:00:00`).toLocaleDateString('en-IN', {
    weekday: 'short', day: 'numeric', month: 'short', year: 'numeric',
  })
}

export default async function MatchDetailPage({ params }: { params: { bookingId: string } }) {
  const session = await getServerSession(authOptions)
  const user = session?.user as any

  // Signed-in members only — same gate as /matches/history and its API
  // routes, since squad rows here include player names.
  if (!session) redirect('/login')
  if (user?.playerStatus === 'expelled') redirect('/')

  const supabase = createServiceClient()
  const today = new Date().toISOString().split('T')[0]

  // vibe-security: only a past, confirmed booking is servable here — same
  // predicate as /api/matches/history/[bookingId], so a future or
  // not-yet-confirmed booking's id can't be used to peek at anything.
  const { data: booking, error: bookingErr } = await supabase
    .from('bookings')
    .select(`
      id, game_date, slot_time, match_time, format, opponent_name, match_id, cricheroes_url,
      tournament:tournaments(name, ball_type, ground:grounds(name, maps_url))
    `)
    .eq('id', params.bookingId)
    .eq('status', 'confirmed')
    .lt('game_date', today)
    .single()

  if (bookingErr || !booking) notFound()

  const tournament = Array.isArray(booking.tournament) ? booking.tournament[0] ?? null : booking.tournament
  const ground = tournament?.ground ? (Array.isArray(tournament.ground) ? tournament.ground[0] ?? null : tournament.ground) : null

  const [{ data: squadRows }, statsRes] = await Promise.all([
    supabase
      .from('squad')
      .select('player_id, players(name, cricheroes_url)')
      .eq('booking_id', booking.id),
    booking.match_id
      ? supabase
          .from('match_stats_cache')
          .select('match_result, team_total, team_wickets, team_overs, opponent_total, opponent_wickets, opponent_overs, batting, bowling, fielding, team_list')
          .eq('match_id', booking.match_id)
          .maybeSingle()
      : Promise.resolve({ data: null }),
  ])

  const squad = (squadRows ?? []).map((r: any) => ({
    player_name:    r.players?.name ?? 'Unknown',
    cricheroes_url: r.players?.cricheroes_url ?? null,
  }))

  const stats = statsRes.data

  return (
    <>
      <SiteNav activePage="matches" isAdmin={!!user?.isAdmin} />
      <main className="min-h-screen bg-ink-1 px-4 md:px-8 py-8 max-w-2xl mx-auto">
        <Link href="/matches/history" className="font-rajdhani text-xs font-bold text-gold hover:text-gold-light transition-colors">
          ← Past Matches
        </Link>

        <div className="mt-4 relative overflow-hidden rounded-xl border border-[#2D3748] p-5"
          style={{ background: 'linear-gradient(135deg, #1C2333 0%, #111827 100%)', boxShadow: '0 4px 20px rgba(0,0,0,0.4)' }}>
          <div className="absolute top-0 left-0 right-0 h-[3px]" style={{ background: 'linear-gradient(90deg, #C9A84C, #F5D78E, #C9A84C)' }} />

          <div className="flex justify-between items-center mb-2">
            <span className="text-xs font-semibold text-gold tracking-wide">
              {formatDate(booking.game_date)} · {booking.slot_time}
            </span>
            {booking.format && (
              <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-[#1E3A5F] text-[#93C5FD] tracking-wide">
                {booking.format}
              </span>
            )}
          </div>

          <div className="mb-3">
            <div className="text-lg font-bold text-zinc-100 leading-tight mb-1">
              {tournament?.name ?? 'Unassigned'}
            </div>
            <div className="text-sm text-zinc-400">
              vs <span className="text-zinc-200 font-medium">{booking.opponent_name || 'TBD'}</span>
            </div>
            {ground?.name && (
              <div className="text-xs text-zinc-500 mt-1">
                {'@ '}
                {ground.maps_url ? (
                  <a href={ground.maps_url} target="_blank" rel="noopener noreferrer" className="text-[#34A853]">
                    {ground.name}
                  </a>
                ) : ground.name}
              </div>
            )}
          </div>

          {stats && (() => {
            const badge = resultBadgeStyle(stats.match_result)
            return (
              <div className="flex items-center gap-2 mb-1">
                <span style={badge.pill
                  ? { background: badge.bg, color: badge.color, fontSize: 13, fontWeight: 800, padding: '4px 12px', borderRadius: 6, letterSpacing: '0.06em' }
                  : { color: badge.color, fontSize: 13, fontWeight: 800, letterSpacing: '0.06em' }}>
                  {badge.label}
                </span>
                <span className="text-xs text-zinc-400">{scoreLine(stats)}</span>
              </div>
            )
          })()}

          {booking.cricheroes_url && (
            <a href={booking.cricheroes_url} target="_blank" rel="noopener noreferrer"
              className="inline-block mt-2 text-[11px] text-zinc-600 hover:text-zinc-400 transition-colors">
              View original scorecard on CricHeroes ↗
            </a>
          )}
        </div>

        <div className="mt-5">
          {stats ? (
            <ScorecardTables batting={stats.batting ?? []} bowling={stats.bowling ?? []} teamList={stats.team_list ?? []} squad={squad} />
          ) : (
            <p className="font-rajdhani text-sm text-zinc-500">
              Scorecard not yet synced to Hub for this match.
              {booking.cricheroes_url && (
                <> In the meantime, see it on{' '}
                  <a href={booking.cricheroes_url} target="_blank" rel="noopener noreferrer" className="text-gold underline">
                    CricHeroes
                  </a>.
                </>
              )}
            </p>
          )}
        </div>
      </main>
    </>
  )
}
