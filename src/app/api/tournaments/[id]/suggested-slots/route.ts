// GET /api/tournaments/[id]/suggested-slots
//
// GC/Admin only. Thin auth wrapper around getSuggestedOpenDates() —
// see src/lib/suggestedSlots.ts for the full algorithm, which is shared
// with the public tournament share page's "Next available dates" section
// so both surfaces can never disagree about what's actually open.

import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { getSuggestedOpenDates } from '@/lib/suggestedSlots'

export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const session = await getServerSession(authOptions)
  const user = session?.user as any
  if (!user?.isAdmin && !user?.isGC) {
    return NextResponse.json({ error: 'Unauthorised' }, { status: 403 })
  }

  const result = await getSuggestedOpenDates(params.id)

  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: result.status })
  }

  return NextResponse.json({
    suggestions: result.suggestions,
    monthlyCap: result.monthlyCap,
    overCapMonths: result.overCapMonths,
  })
}
