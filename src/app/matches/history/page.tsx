import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { redirect } from 'next/navigation'
import { SiteNav } from '@/components/ui/SiteNav'
import { MatchHistoryClient } from '@/components/matches/MatchHistoryClient'
import { MatchesSegmentedTabs } from '@/components/matches/MatchesSegmentedTabs'
import type { Metadata } from 'next'

export const metadata: Metadata = { title: 'Matches — Spartans CC' }
export const revalidate = 0

export default async function MatchHistoryPage() {
  const session = await getServerSession(authOptions)
  const user = session?.user as any

  // Signed-in members only — squad rows here include player names (with
  // CricHeroes links), so unlike /schedule this isn't public.
  if (!session) redirect('/login')
  if (user?.playerStatus === 'expelled') redirect('/')

  // Wranglers can correct match-day roles too (they're the ones backfilling
  // squad data from WhatsApp announcements and are best placed to notice a
  // wrong C/VC/WK) but do not get the admin-only tournament reassignment.
  const canEditRoles = !!user?.isGC || !!user?.isAdmin || !!user?.isWrangler
  const isAdmin       = !!user?.isAdmin

  return (
    <>
      <SiteNav activePage="matches" mobileTabBarTheme="light" />
      <main className="min-h-screen px-4 md:px-8 py-8 max-w-4xl mx-auto" style={{ background: '#F8F4EE' }}>
        <div className="mb-6">
          <h1 className="font-cinzel text-xl font-bold mb-1" style={{ color: '#B45309' }}>Matches</h1>
          <p className="font-rajdhani text-sm mb-4" style={{ color: '#78716C' }}>
            Squad history for completed matches.
          </p>
          <MatchesSegmentedTabs active="past" theme="light" />
        </div>
        <MatchHistoryClient
          canEditRoles={canEditRoles}
          canEditTournament={isAdmin}
          viewerPlayerId={user?.playerId ?? null}
          isWrangler={!!user?.isWrangler}
        />
      </main>
    </>
  )
}
