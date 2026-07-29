import { getServerSession } from 'next-auth'
import { redirect } from 'next/navigation'
import { authOptions } from '@/lib/auth'
import { createServiceClient } from '@/lib/supabase'
import { getPlayerStats, getPlayerMatchHistory } from '@/lib/playerStats'
import { SiteNav } from '@/components/ui/SiteNav'
import { PlayerStatsClient } from '@/components/players/PlayerStatsClient'
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
export default async function PlayerStatsPage({ params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions)
  const user = session?.user as any

  if (!session) redirect('/login')
  if (user?.playerStatus === 'expelled') redirect('/')

  const supabase = createServiceClient()
  const [{ data: player }, { data: grounds }, career, matches] = await Promise.all([
    supabase.from('players')
      .select('id, name, photo_url, jersey_name, jersey_number, primary_skill, secondary_skill, cricheroes_url')
      .eq('id', params.id).single(),
    supabase.from('grounds').select('id, name').order('name', { ascending: true }),
    getPlayerStats(params.id),
    getPlayerMatchHistory(params.id),
  ])

  if (!player) redirect('/')

  return (
    <div className="min-h-screen bg-parchment">
      <SiteNav isAdmin={!!user?.isAdmin} />
      <PlayerStatsClient
        player={player}
        grounds={grounds ?? []}
        initialCareer={career}
        initialMatches={matches}
      />
      <footer className="border-t border-parchment-3 py-5 text-center font-rajdhani text-xs text-stone-500 mt-8">
        © 2026 <span className="text-gold-dim">Spartans Cricket Club</span> · Bengaluru · Est. 2014
      </footer>
    </div>
  )
}
