import { redirect } from 'next/navigation'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { createServiceClient } from '@/lib/supabase'
import { SiteNav } from '@/components/ui/SiteNav'
import { AdminKitRoomClient } from '@/components/dugout/AdminKitRoomClient'

export const revalidate = 0

export default async function StoreOrdersPage() {
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
        jersey_half_sleeve_size,
        jersey_full_sleeve_size,
        tracks_size,
        jersey_name_override,
        jersey_number_override,
        jersey_half_sleeve_qty,
        jersey_full_sleeve_qty,
        tracks_qty,
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

  const rawOrders = ordersResult.data ?? []
  const orders = rawOrders.map((o: any) => ({
    id:                      o.id,
    jersey_name:             o.jersey_name,
    jersey_number:           o.jersey_number,
    jersey_size:             o.jersey_size ?? null,
    jersey_half_sleeve_size: o.jersey_half_sleeve_size ?? null,
    jersey_full_sleeve_size: o.jersey_full_sleeve_size ?? null,
    tracks_size:             o.tracks_size ?? null,
    jersey_name_override:    o.jersey_name_override ?? null,
    jersey_number_override:  o.jersey_number_override ?? null,
    jersey_half_sleeve_qty:  o.jersey_half_sleeve_qty ?? 1,
    jersey_full_sleeve_qty:  o.jersey_full_sleeve_qty ?? 1,
    tracks_qty:              o.tracks_qty ?? 1,
    notes:                   o.notes ?? null,
    status:                  o.status,
    created_at:              o.created_at,
    player_name:             o.player?.name ?? '',
    player_cricheroes_url:   o.player?.cricheroes_url ?? null,
  }))

  const batchDate = settingsResult.data?.kit_room_batch_date ?? null

  return (
    <div style={{ backgroundColor: '#F8F4EE', minHeight: '100vh' }}>
      <SiteNav activePage="dugout" />
      <main className="px-4 py-8" style={{ backgroundColor: '#F8F4EE' }}>
        <div className="max-w-5xl mx-auto">
          <h1 className="font-cinzel font-bold text-2xl text-stone-900 mb-1">
            Store Orders
          </h1>
          <p className="font-rajdhani text-sm text-stone-500 mb-6">
            All active apparel orders — pending and submitted.
          </p>
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
