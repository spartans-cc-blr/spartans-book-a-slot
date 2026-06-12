// src/app/gc-players/page.tsx
import { getServerSession } from 'next-auth'
import { redirect } from 'next/navigation'
import { authOptions } from '@/lib/auth'
import { createServiceClient } from '@/lib/supabase'
import { SiteNav } from '@/components/ui/SiteNav'
import { AdminSidebar } from '@/components/admin/AdminSidebar'
import { GCPlayersGrid } from '@/components/gc/GCPlayersGrid'

export const revalidate = 120

export default async function GCPlayersPage() {
  const session = await getServerSession(authOptions)
  const user = session?.user as any
  if (!user?.isGC && !user?.isAdmin) redirect('/')

  const supabase = createServiceClient()
  const { data: players } = await supabase
    .from('players')
    .select(`
      id, name, photo_url, jersey_name, jersey_number,
      primary_skill, secondary_skill, cricheroes_url,
      wallet_balance, inducted_on, is_captain, status, active
    `)
    .order('name', { ascending: true })

  return (
    <div className="min-h-screen bg-parchment flex flex-col">
      <SiteNav activePage="gc" />
      <div className="flex flex-1">
        <AdminSidebar />
        <main className="flex-1 px-5 md:px-8 lg:px-10 py-8 max-w-6xl">
          <div className="mb-6">
            <h1 className="font-cinzel text-xl font-bold text-gold-dim">Squad Register</h1>
            <p className="font-rajdhani text-sm text-stone-500 mt-1">
              {players?.length ?? 0} members total · Read-only view
            </p>
          </div>
          <GCPlayersGrid players={(players ?? []) as any} />
        </main>
      </div>
    </div>
  )
}