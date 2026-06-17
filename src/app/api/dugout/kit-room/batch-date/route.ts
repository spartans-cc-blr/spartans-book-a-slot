import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { createServiceClient } from '@/lib/supabase'

// Validates YYYY-MM-DD format and that the date is a real calendar date
function isValidDateString(value: unknown): value is string {
  if (typeof value !== 'string') return false
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false
  const d = new Date(value)
  return !isNaN(d.getTime()) && d.toISOString().startsWith(value)
}

// PATCH /api/dugout/kit-room/batch-date
// Admin only (GC cannot change this)
// Body: { batch_date: 'YYYY-MM-DD' } or { batch_date: null } to clear
export async function PATCH(req: NextRequest) {
  const session = await getServerSession(authOptions)
  const user    = session?.user as any

  if (!user?.playerId) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
  }

  // GC and non-admin are both rejected — admin only
  if (!user?.isAdmin) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const body = await req.json()

  // Only batch_date is accepted — all other fields are ignored
  if (!('batch_date' in body)) {
    return NextResponse.json({ error: 'batch_date is required' }, { status: 400 })
  }

  const { batch_date } = body

  if (batch_date !== null && !isValidDateString(batch_date)) {
    return NextResponse.json(
      { error: 'batch_date must be a valid date in YYYY-MM-DD format, or null to clear' },
      { status: 400 }
    )
  }

  const supabase = createServiceClient()

  const { data, error } = await supabase
    .from('dugout_settings')
    .update({ kit_room_batch_date: batch_date ?? null })
    .eq('id', 1)
    .select()
    .single()

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ batch_date: data?.kit_room_batch_date ?? null })
}
