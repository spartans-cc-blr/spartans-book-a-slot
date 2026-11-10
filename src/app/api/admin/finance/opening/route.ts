// PUT /api/admin/finance/opening — admin only.
// Sets one opening figure (a period + balance-sheet line carried over from
// the legacy Google Sheet). Used to finalise CY 2026 at cut-over. See
// features/finance-balance-sheet.md.

import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { createServiceClient } from '@/lib/supabase'
import { RATE_LIMITS, rateLimit } from '@/lib/rateLimit'
import { financeOpeningSchema } from '@/lib/schemas'
import { FINANCE_LINE_KEYS } from '@/lib/financeCore'

export async function PUT(req: NextRequest) {
  const session = await getServerSession(authOptions)
  const user = session?.user as any
  if (!user?.isAdmin) return NextResponse.json({ error: 'Unauthorised' }, { status: 403 })

  const limited = await rateLimit(req, RATE_LIMITS.adminWrite, user.playerId)
  if (limited) return limited

  const parsed = financeOpeningSchema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'Invalid request' }, { status: 400 })
  }
  const { period, line_key, amount } = parsed.data
  if (!FINANCE_LINE_KEYS.includes(line_key)) {
    return NextResponse.json({ error: 'Unknown balance sheet line' }, { status: 400 })
  }

  const { error } = await createServiceClient().from('finance_opening_figures').upsert({
    period, line_key, amount,
    updated_by_email: user.email ?? '',
    updated_at: new Date().toISOString(),
  }, { onConflict: 'period,line_key' })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
