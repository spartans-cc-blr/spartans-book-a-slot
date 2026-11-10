// POST / DELETE /api/admin/finance/entries — admin only.
// Manual balance-sheet entries (club expenses, advances, write-offs). DELETE
// is a soft delete with a required reason. See
// features/finance-balance-sheet.md.

import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { createServiceClient } from '@/lib/supabase'
import { RATE_LIMITS, rateLimit } from '@/lib/rateLimit'
import { financeEntrySchema, financeEntryDeleteSchema } from '@/lib/schemas'
import { MANUAL_ENTRY_LINE_KEYS, FINANCE_CUTOVER_DATE } from '@/lib/financeCore'
import { istToday } from '@/lib/matchCompletion'

async function requireAdmin(req: NextRequest) {
  const session = await getServerSession(authOptions)
  const user = session?.user as any
  if (!user?.isAdmin) return { error: NextResponse.json({ error: 'Unauthorised' }, { status: 403 }) }
  const limited = await rateLimit(req, RATE_LIMITS.adminWrite, user.playerId)
  if (limited) return { error: limited }
  return { user }
}

export async function POST(req: NextRequest) {
  const auth = await requireAdmin(req)
  if (auth.error) return auth.error
  const user = auth.user

  const parsed = financeEntrySchema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'Invalid request' }, { status: 400 })
  }
  const { entry_date, line_key, amount, particulars, remarks } = parsed.data

  if (!MANUAL_ENTRY_LINE_KEYS.includes(line_key)) {
    return NextResponse.json({ error: 'Unknown balance sheet line' }, { status: 400 })
  }
  // Anything before the cut-over is already inside the opening figures, so an
  // entry dated there would be counted twice.
  if (entry_date < FINANCE_CUTOVER_DATE) {
    return NextResponse.json(
      { error: `Entries start from ${FINANCE_CUTOVER_DATE}. Earlier amounts belong in the opening figures.` },
      { status: 400 },
    )
  }
  if (entry_date > istToday()) {
    return NextResponse.json({ error: 'Entry date cannot be in the future' }, { status: 400 })
  }

  const { data, error } = await createServiceClient().from('finance_entries').insert({
    entry_date, line_key, amount, particulars,
    remarks: remarks || null,
    created_by: user.playerId ?? null,
    created_by_email: user.email ?? '',
  }).select('id').single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true, id: data.id })
}

export async function DELETE(req: NextRequest) {
  const auth = await requireAdmin(req)
  if (auth.error) return auth.error
  const user = auth.user

  const parsed = financeEntryDeleteSchema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'Invalid request' }, { status: 400 })
  }

  const { data, error } = await createServiceClient().from('finance_entries')
    .update({
      deleted_at: new Date().toISOString(),
      deleted_by_email: user.email ?? '',
      delete_reason: parsed.data.delete_reason,
    })
    .eq('id', parsed.data.id)
    .is('deleted_at', null)
    .select('id')
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  if (!data?.length) return NextResponse.json({ error: 'Entry not found' }, { status: 404 })
  return NextResponse.json({ ok: true })
}
