// src/app/gc-players/page.tsx
// GC-only read-only squad register.
// vibe-security: isGC || isAdmin enforced server-side; redirect on failure.
// Theme: Slate & Teal

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

  // vibe-security: server-side role check — never trust client
  if (!user?.isGC && !user?.isAdmin) redirect('/')

  const supabase = createServiceClient()

  // Fetch ALL players (active + inactive + expelled).
  // Client-side filter to active by default.
  // vibe-security: gmail_id, dob, blood_group excluded — not GC's remit.
  // No write paths exist on this page.
  const { data: players, error } = await supabase
    .from('players')
    .select(`
      id, name, photo_url, jersey_name, jersey_number,
      primary_skill, secondary_skill, cricheroes_url,
      wallet_balance, inducted_on, is_captain, status, active
    `)
    .order('name', { ascending: true })

  if (error) {
    console.error('[gc-players] Supabase error:', error.message)
  }

  const total = players?.length ?? 0

  return (
    <div className="min-h-screen bg-[#F0F4F5] flex flex-col">
      <SiteNav activePage="gc-players" />
      <div className="flex flex-1">
        <AdminSidebar />
        <main className="flex-1 px-5 md:px-8 lg:px-10 py-8 max-w-6xl">

          {/* Page header */}
          <div className="mb-6">
            <h1 className="font-cinzel text-xl font-bold text-[#0F3D42]">
              Squad Register
            </h1>
            <p className="font-rajdhani text-sm text-slate-500 mt-1">
              {total} member{total !== 1 ? 's' : ''} total · Read-only view
            </p>
          </div>

          <GCPlayersGrid players={(players ?? []) as any} />

        </main>
      </div>
    </div>
  )
}
