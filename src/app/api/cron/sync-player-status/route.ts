// Runs daily at 02:00 IST (20:30 UTC previous day)
// vercel.json: { "path": "/api/cron/sync-player-status", "schedule": "30 20 * * *" }

import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase'

export async function GET(req: NextRequest) {
  const authHeader = req.headers.get('authorization')
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })
  }

  const supabase = createServiceClient()

  const thirtyDaysAgo = new Date()
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30)
  const cutoff = thirtyDaysAgo.toISOString().split('T')[0]
  const today  = new Date().toISOString().split('T')[0]

  // Players who have played ≥ 1 announced game in the last 30 days
  const { data: activePlayers, error: aErr } = await supabase
    .from('squad')
    .select('player_id, bookings!inner(game_date)')
    .eq('status', 'announced')
    .gte('bookings.game_date', cutoff)
    .lte('bookings.game_date', today)

  if (aErr) return NextResponse.json({ error: aErr.message }, { status: 500 })

  const activeIds = Array.from(new Set((activePlayers ?? []).map(r => r.player_id)))

  // Set active — never touch expelled
  const { error: setActive } = await supabase
    .from('players')
    .update({ status: 'active' })
    .in('id', activeIds.length ? activeIds : ['00000000-0000-0000-0000-000000000000'])
    .neq('status', 'expelled')

  if (setActive) return NextResponse.json({ error: setActive.message }, { status: 500 })

  // Set inactive — everyone else who isn't expelled or just set active
  const { error: setInactive } = await supabase
    .from('players')
    .update({ status: 'inactive' })
    .not('id', 'in', `(${activeIds.length ? activeIds.join(',') : '00000000-0000-0000-0000-000000000000'})`)
    .neq('status', 'expelled')

  if (setInactive) return NextResponse.json({ error: setInactive.message }, { status: 500 })

  return NextResponse.json({ active: activeIds.length })
}
