import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { SiteNav } from '@/components/ui/SiteNav'
import { MatchHistoryClient } from '@/components/matches/MatchHistoryClient'
import type { Metadata } from 'next'

export const metadata: Metadata = { title: 'Past Matches — Spartans CC' }
export const revalidate = 0

export default async function MatchHistoryPage() {
  const session = await getServerSession(authOptions)
  const user = session?.user as any

  const isGC    = !!user?.isGC || !!user?.isAdmin
  const isAdmin = !!user?.isAdmin

  return (
    <>
      <SiteNav activePage="matches" isAdmin={isAdmin} />
      <main className="min-h-screen bg-ink-1 px-4 md:px-8 py-8 max-w-3xl mx-auto">
        <div className="mb-6">
          <h1 className="font-cinzel text-xl font-bold text-gold">Past Matches</h1>
          <p className="font-rajdhani text-sm text-zinc-500 mt-1">
            Squad history for completed matches.
          </p>
        </div>
        <MatchHistoryClient canEditRoles={isGC} canEditTournament={isAdmin} />
      </main>
    </>
  )
}
