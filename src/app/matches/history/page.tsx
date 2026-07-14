import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { redirect } from 'next/navigation'
import { SiteNav } from '@/components/ui/SiteNav'
import { MatchHistoryClient } from '@/components/matches/MatchHistoryClient'
import type { Metadata } from 'next'

export const metadata: Metadata = { title: 'Past Matches — Spartans CC' }
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
      <SiteNav activePage="matches" isAdmin={isAdmin} />
      <main className="min-h-screen bg-ink-1 px-4 md:px-8 py-8 max-w-4xl mx-auto">
        <div className="mb-6">
          <h1 className="font-cinzel text-xl font-bold text-gold">Past Matches</h1>
          <p className="font-rajdhani text-sm text-zinc-500 mt-1">
            Squad history for completed matches.
          </p>
        </div>
        <MatchHistoryClient
          canEditRoles={canEditRoles}
          canEditTournament={isAdmin}
          viewerPlayerId={user?.playerId ?? null}
          isAdmin={isAdmin}
        />
      </main>
    </>
  )
}
