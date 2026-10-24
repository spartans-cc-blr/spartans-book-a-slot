// PATCH /api/admin/record-breaks/[id] — admin only. Marks a record break as
// shared (admin sent it to the club WhatsApp group), ignored, or back to pending.
// The WhatsApp send itself is a client-side wa.me link — this only records the decision.
// See .claude/rules/features/record-breaking.md.
import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { createServiceClient } from '@/lib/supabase'
import { rateLimit, RATE_LIMITS } from '@/lib/rateLimit'
import { recordBreakDecisionSchema } from '@/lib/schemas'

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions)
  const user = session?.user as any
  if (!user?.isAdmin) return NextResponse.json({ error: 'Unauthorised' }, { status: 403 })
  const limited = await rateLimit(req, RATE_LIMITS.adminWrite, user.playerId ?? user.email)
  if (limited) return limited

  if (!/^[0-9a-f-]{36}$/i.test(params.id)) return NextResponse.json({ error: 'Invalid id' }, { status: 400 })
  const parsed = recordBreakDecisionSchema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'Invalid input' }, { status: 400 })

  const pending = parsed.data.status === 'pending'
  const { data, error } = await createServiceClient()
    .from('record_breaks')
    .update({
      status: parsed.data.status,
      decided_by: pending ? null : user.email ?? null,
      decided_at: pending ? null : new Date().toISOString(),
    })
    .eq('id', params.id)
    .select('id, status')
    .maybeSingle()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  if (!data) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  return NextResponse.json({ ok: true, ...data })
}
