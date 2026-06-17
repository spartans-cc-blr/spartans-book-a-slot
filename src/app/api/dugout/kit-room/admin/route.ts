import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { createServiceClient } from '@/lib/supabase'

// GET /api/dugout/kit-room/admin
// Admin/GC fetches all jersey orders with player details
export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions)
  const user = session?.user as any
  if (!user?.isAdmin && !user?.isGC) {
    return NextResponse.json({ error: 'Not authorised' }, { status: 403 })
  }

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

  if (ordersResult.error) {
    return NextResponse.json({ error: ordersResult.error.message }, { status: 500 })
  }

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
    notes:                   o.notes ?? null,
    status:                  o.status,
    created_at:              o.created_at,
    player_name:             o.player?.name ?? '',
    player_cricheroes_url:   o.player?.cricheroes_url ?? null,
  }))

  return NextResponse.json({
    orders,
    batch_date: settingsResult.data?.kit_room_batch_date ?? null,
  })
}