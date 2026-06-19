import { redirect } from 'next/navigation'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { createServiceClient } from '@/lib/supabase'
import { SiteNav } from '@/components/ui/SiteNav'
import { KitRoomClient } from '@/components/dugout/KitRoomClient'

export const revalidate = 0

export default async function KitRoomPage() {
  const session = await getServerSession(authOptions)
  const player = session?.user as any

  if (!player?.playerId) redirect('/')

  const isExpelled = player.playerStatus === 'expelled'

  const supabase = createServiceClient()

  const [playerResult, ordersResult, settingsResult] = await Promise.all([
    supabase
      .from('players')
      .select('jersey_name, jersey_number')
      .eq('id', player.playerId)
      .single(),
    supabase
      .from('jersey_orders')
      .select('id, jersey_name, jersey_number, jersey_size, jersey_half_sleeve_size, jersey_full_sleeve_size, tracks_size, jersey_name_override, notes, status, created_at')
      .eq('player_id', player.playerId)
      .order('created_at', { ascending: false }),
    supabase
      .from('dugout_settings')
      .select('kit_room_batch_date')
      .eq('id', 1)
      .maybeSingle(),
  ])

  const jerseyName   = playerResult.data?.jersey_name   ?? null
  const jerseyNumber = playerResult.data?.jersey_number ?? null
  const orders       = ordersResult.data ?? []
  const batchDate    = settingsResult.data?.kit_room_batch_date ?? null

  return (
    <div style={{ backgroundColor: '#F8F4EE', minHeight: '100vh' }}>
      <SiteNav activePage="dugout" />
      <main className="px-4 py-8" style={{ backgroundColor: '#F8F4EE' }}>
        <div className="max-w-2xl mx-auto">
          <div className="w-full rounded-xl mb-6 overflow-hidden" style={{ height: '210px' }}>
          <img
            src="/images/jersey-collage.png"
            alt="OUR HERITAGE. OUR PRIDE. — The 2024 Spartans Club Collection"
            className="w-full h-full object-cover"
            style={{ objectPosition: 'center 30%' }}
          />
        </div>
            <div className="absolute inset-0 bg-black/20 rounded-xl" />
            <div className="absolute bottom-0 left-0 right-0 px-5 py-4">
              <h1 className="font-cinzel font-bold text-2xl text-white drop-shadow-md">
                Spartans Store
              </h1>
            </div>
          </div>
          <KitRoomClient
            orders={orders}
            batchDate={batchDate}
            jerseyName={jerseyName}
            jerseyNumber={jerseyNumber}
            isExpelled={isExpelled}
          />
        </div>
      </main>
    </div>
  )
}
