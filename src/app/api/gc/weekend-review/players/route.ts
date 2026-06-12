// src/app/api/gc/players/route.ts
// GET /api/gc/players — all players for GC read-only view.
// vibe-security checklist:
//   ✅ isGC || isAdmin enforced server-side
//   ✅ service role key — never NEXT_PUBLIC_
//   ✅ gmail_id, dob, blood_group excluded (not GC's remit)
//   ✅ no write path on this route
//   ✅ wallet_balance returned read-only; no PATCH exposed here

import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { createServiceClient } from '@/lib/supabase'

export async function GET(_req: NextRequest) {
  const session = await getServerSession(authOptions)
  const user = session?.user as any

  if (!user?.isGC && !user?.isAdmin) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const supabase = createServiceClient()

  const { data, error } = await supabase
    .from('players')
    .select(`
      id, name, photo_url, jersey_name, jersey_number,
      primary_skill, secondary_skill, cricheroes_url,
      wallet_balance, inducted_on, is_captain, status, active
    `)
    .order('name', { ascending: true })

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ players: data })
}
