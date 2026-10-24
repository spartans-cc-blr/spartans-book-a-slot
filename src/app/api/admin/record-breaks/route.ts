// GET /api/admin/record-breaks — admin only. Feeds /admin/records. Newest first.
// See .claude/rules/features/record-breaking.md.
import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { createServiceClient } from '@/lib/supabase'

export async function GET() {
  const session = await getServerSession(authOptions)
  const user = session?.user as any
  if (!user?.isAdmin) return NextResponse.json({ error: 'Unauthorised' }, { status: 403 })

  const { data, error } = await createServiceClient()
    .from('record_breaks')
    .select('id, booking_id, record_key, scope_key, title, scope_label, holder, display, prev_holder, prev_display, game_date, opponent_name, message, status, decided_at, created_at')
    .order('created_at', { ascending: false })
    .limit(200)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ breaks: data ?? [] })
}
