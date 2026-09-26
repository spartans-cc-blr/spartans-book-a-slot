import { getServerSession } from 'next-auth'
import { redirect } from 'next/navigation'
import { authOptions } from '@/lib/auth'
import { createServiceClient } from '@/lib/supabase'
import { getPlayerStats, getPlayerMatchHistory } from '@/lib/playerStats'
import { SiteNav } from '@/components/ui/SiteNav'
import { PlayerStatsClient } from '@/components/players/PlayerStatsClient'
import { PlayerCaptaincyBreakdown } from '@/components/captaincy/PlayerCaptaincyBreakdown'
import { getCaptaincyInnings, buildPlayerUnderCaptains, buildSeasonProgression } from '@/lib/captaincyStats'
import type { Metadata } from 'next'

export const revalidate = 0

export async function generateMetadata({ params }: { params: { id: string } }): Promise<Metadata> {
  const supabase = createServiceClient()
  const { data: player } = await supabase.from('players').select('name').eq('id', params.id).single()
  return { title: player ? `${player.name} — Stats — Spartans CC` : 'Player Stats — Spartans CC' }
}

// vibe-security: any signed-in, non-expelled member can view any player's
// stats — same posture as /matches/history and its scorecard routes.
// Not IDOR-restricted to self; there is no write path on this page at all.
// The one exception is the "Under each captain" breakdown, which is only
// fetched and rendered for the player themselves or GC/admin — see
// features/captaincy-stats.md.
export default async function PlayerStatsPage({ params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions)
  const user = session?.user as any

  if (!session) redirect('/login')
  if (user?.playerStatus === 'expelled') redirect('/')

  // Also drives "My Stats" highlighting in the mobile tab bar, which would
  // be misleading on another player's page.
  const isOwnStats = !!user?.playerId && user.playerId === params.id
  // "Under each captain" is visible to the player themselves and to GC/admin
  // only — skip the fetch entirely for anyone else so it never reaches them.
  const canSeeCaptaincy = isOwnStats || !!user?.isGC || !!user?.isAdmin

  const supabase = createServiceClient()
  const [{ data: player }, { data: grounds }, career, matches, captaincyRows] = await Promise.all([
    supabase.from('players')
      .select('id, name, photo_url, jersey_name, jersey_number, primary_skill, secondary_skill, cricheroes_url')
      .eq('id', params.id).single(),
    supabase.from('grounds').select('id, name').order('name', { ascending: true }),
    getPlayerStats(params.id),
    getPlayerMatchHistory(params.id),
    canSeeCaptaincy
      ? getCaptaincyInnings({ playerId: params.id }).catch(err => {
          console.error('[player-stats] captaincy breakdown failed:', err)
          return []
        })
      : Promise.resolve([]),
  ])

  if (!player) redirect('/')

  return (
    <div className="min-h-screen" style={{ backgroundColor: 'var(--stats-shell-bg)' }}>
      {/* Own stats is a bottom-tab destination — no back there; another
          player's page is always a drill-down, so it gets one. */}
      <SiteNav activePage={isOwnStats ? 'my-stats' : undefined}
        back={isOwnStats ? undefined : { fallbackHref: '/leaderboard', label: 'Leaderboard' }} />
      <PlayerStatsClient
        player={player}
        grounds={grounds ?? []}
        initialCareer={career}
        initialMatches={matches}
      />
      {canSeeCaptaincy && (
        <PlayerCaptaincyBreakdown
          captains={buildPlayerUnderCaptains(captaincyRows)}
          seasons={buildSeasonProgression(captaincyRows)}
          isOwn={isOwnStats}
        />
      )}
      <footer className="border-t py-5 text-center font-rajdhani text-xs mt-8"
        style={{ borderColor: 'var(--stats-card-border)', color: 'var(--stats-text-muted)' }}>
        © 2026 <span style={{ color: 'var(--stats-badge-text)' }}>Spartans Cricket Club</span> · Bengaluru · Est. 2014
      </footer>
    </div>
  )
}
