import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { redirect } from 'next/navigation'
import { SiteNav } from '@/components/ui/SiteNav'
import { GroundsClient } from '@/components/wrangler/GroundsClient'
import type { Metadata } from 'next'

export const metadata: Metadata = { title: 'Grounds — Spartans CC' }
export const revalidate = 0

export default async function WranglerGroundsPage() {
  const session = await getServerSession(authOptions)
  const user    = session?.user as any

  // vibe-security: role check before any data fetch, re-validated on every render
  if (!session) redirect('/login')
  if (!user?.isWrangler && !user?.isAdmin) redirect('/')

  return (
    <>
      <SiteNav activePage="wrangler" isAdmin={!!user?.isAdmin} />
      <main className="min-h-screen bg-ink-1 px-4 md:px-8 py-8 max-w-4xl mx-auto">
        <GroundsClient />
      </main>
    </>
  )
}
