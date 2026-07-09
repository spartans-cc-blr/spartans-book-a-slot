import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { redirect } from 'next/navigation'
import { SiteNav } from '@/components/ui/SiteNav'
import { BackfillSquadClient } from '@/components/wrangler/BackfillSquadClient'
import type { Metadata } from 'next'

export const metadata: Metadata = { title: 'Squad Backfill — Spartans CC' }
export const revalidate = 0

export default async function BackfillSquadPage() {
  const session = await getServerSession(authOptions)
  const user    = session?.user as any

  // vibe-security: role check before any data fetch, re-validated on every render
  if (!session) redirect('/login')
  if (!user?.isWrangler && !user?.isAdmin) redirect('/')

  return (
    <>
      <SiteNav activePage="wrangler" isAdmin={!!user?.isAdmin} />
      <main className="min-h-screen bg-ink-1 px-4 md:px-8 py-8 max-w-3xl mx-auto">
        <div className="mb-6">
          <h1 className="font-cinzel text-xl font-bold text-gold">Squad Backfill</h1>
          <p className="font-rajdhani text-sm text-zinc-500 mt-1">
            Paste a WhatsApp squad announcement to reconstruct the squad table for matches
            that were announced before the Hub tracked them.
          </p>
        </div>
        <BackfillSquadClient />
      </main>
    </>
  )
}
