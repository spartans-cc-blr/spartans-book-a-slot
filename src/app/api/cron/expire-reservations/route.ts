import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase'

export async function GET(req: NextRequest) {
  const authHeader = req.headers.get('authorization')
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })
  }

  const supabase = createServiceClient()
  const now = new Date().toISOString()

  const { data, error } = await supabase
    .from('bookings')
    .delete()
    .eq('status', 'soft_block')
    .not('reserved_until', 'is', null)
    .lt('reserved_until', now)
    .select()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({
    expired: data?.length ?? 0,
    message: `${data?.length ?? 0} reservation(s) expired and removed.`
  })
}
