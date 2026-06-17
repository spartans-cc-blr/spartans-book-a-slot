import { redirect } from 'next/navigation'
import { headers, cookies } from 'next/headers'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { SiteNav } from '@/components/ui/SiteNav'
import { GearExchangeClient } from '@/components/dugout/GearExchangeClient'

export const revalidate = 0

export default async function GearExchangePage() {
  const session = await getServerSession(authOptions)
  const player = session?.user as any

  if (!player?.playerId) redirect('/')

  const isExpelled = player.playerStatus === 'expelled'
  const isAdmin = Boolean(player.isAdmin)

  const cookieStore = cookies()
  const cookieHeader = cookieStore.getAll()
    .map((c) => `${c.name}=${c.value}`)
    .join('; ')

  const baseUrl = process.env.NEXTAUTH_URL ?? 'http://localhost:3000'

  let listings: any[] = []
  try {
    const res = await fetch(`${baseUrl}/api/dugout/gear`, {
      headers: { cookie: cookieHeader },
      cache: 'no-store',
    })
    if (res.ok) {
      const json = await res.json()
      listings = json.listings ?? []
    }
  } catch {
    listings = []
  }

  return (
    <div style={{ backgroundColor: '#F8F4EE', minHeight: '100vh' }}>
      <SiteNav activePage="dugout" />
      <main className="px-4 py-8" style={{ backgroundColor: '#F8F4EE' }}>
        <div className="max-w-3xl mx-auto">
          <h1 className="font-cinzel font-bold text-2xl text-stone-900 mb-6">Gear Exchange</h1>
          <GearExchangeClient
            listings={listings}
            playerId={String(player.playerId)}
            isExpelled={isExpelled}
            isAdmin={isAdmin}
          />
        </div>
      </main>
    </div>
  )
}
