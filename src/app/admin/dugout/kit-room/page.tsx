import { redirect } from 'next/navigation'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { createServiceClient } from '@/lib/supabase'
import { SiteNav } from '@/components/ui/SiteNav'
import { AdminKitRoomClient } from '@/components/dugout/AdminKitRoomClient'

export const revalidate = 0

export default async function AdminKitRoomPage() {
  const session = await getServerSession(authOptions)
  const user = session?.user as any

  if (!user?.isAdmin && !user?.isGC) redirect('/')

  const supabase = createServiceClient()

  const [ordersResult, settingsResult] = await Promise.all([
    supabase
      .from('jersey_orders')
      .select(`
        id,
        jersey_name,
        jersey_number,
        jersey_size,
        notes,
        status,
        created_at,
        player:players(name, cricheroes_url)
      `)
      .order('created_at', { ascending: true }),
    supabase
      .from('dugout_settings')
      .select('kit_room_batch_date')
      .eq('id', 1)
      .maybeSingle(),
  ])

  // Strip any sensitive player fields — expose only name and cricheroes_url
  const rawOrders = ordersResult.data ?? []
  const orders = rawOrders.map((o: any) => ({
    id:                   o.id,
    jersey_name:          o.jersey_name,
    jersey_number:        o.jersey_number,
    jersey_size:          o.jersey_size,
    notes:                o.notes ?? null,
    status:               o.status,
    created_at:           o.created_at,
    player_name:          o.player?.name ?? '',
    player_cricheroes_url: o.player?.cricheroes_url ?? null,
  }))

  const batchDate = settingsResult.data?.kit_room_batch_date ?? null

  return (
    <div style={{ backgroundColor: '#F8F4EE', minHeight: '100vh' }}>
      <SiteNav activePage="dugout" isAdmin={user.isAdmin} />
      <main className="px-4 py-8" style={{ backgroundColor: '#F8F4EE' }}>
        <div className="max-w-5xl mx-auto">
          <h1 className="font-cinzel font-bold text-2xl text-stone-900 mb-6">Kit Room — Admin</h1>
          <AdminKitRoomClient
            orders={orders}
            batchDate={batchDate}
            isAdmin={Boolean(user.isAdmin)}
          />
        </div>
      </main>
    </div>
  )
}
