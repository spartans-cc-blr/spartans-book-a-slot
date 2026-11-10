// POST /api/admin/finance/bank-balance — admin only.
// Records the club's bank balance as of a date. The latest row is the
// "Net Balance in Bank" line; earlier rows stay as history. See
// features/finance-balance-sheet.md.

import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { createServiceClient } from '@/lib/supabase'
import { RATE_LIMITS, rateLimit } from '@/lib/rateLimit'
import { financeBankBalanceSchema } from '@/lib/schemas'
import { istToday } from '@/lib/matchCompletion'

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  const user = session?.user as any
  if (!user?.isAdmin) return NextResponse.json({ error: 'Unauthorised' }, { status: 403 })

  const limited = await rateLimit(req, RATE_LIMITS.adminWrite, user.playerId)
  if (limited) return limited

  const parsed = financeBankBalanceSchema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'Invalid request' }, { status: 400 })
  }
  const { as_of, amount, note } = parsed.data
  if (as_of > istToday()) {
    return NextResponse.json({ error: 'Date cannot be in the future' }, { status: 400 })
  }

  const { error } = await createServiceClient().from('finance_bank_balances').insert({
    as_of, amount, note: note || null, recorded_by_email: user.email ?? '',
  })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
