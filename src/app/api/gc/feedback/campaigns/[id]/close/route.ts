import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { createServiceClient } from '@/lib/supabase'
import { NextResponse } from 'next/server'

async function requireGC() {
  const session = await getServerSession(authOptions)
  const user = session?.user as any
  if (!user?.isGC && !user?.isAdmin)
    return NextResponse.json({ error: 'Unauthorised' }, { status: 403 })
  return null
}

export async function PATCH(
  _req: Request,
  { params }: { params: { id: string } }
) {
  const guard = await requireGC()
  if (guard) return guard
  const db = createServiceClient()
  const { error } = await db
    .from('feedback_campaigns')
    .update({ closed_at: new Date().toISOString() })
    .eq('id', params.id)
    .is('closed_at', null)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}