// POST /api/tournaments/[id]/organiser-next-slot
//
// Public, unauthenticated, read-only (rate-limited under publicRead rather
// than organiserWrite since nothing is written here). Powers the "Not
// available" step for one specific slot bucket in the organiser
// self-service flow — each bucket now names one exact date rather than a
// pre-fetched list, so declining needs a round trip to find the next
// compliant date for that same bucket, beyond whatever the organiser has
// already declined this session.

import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase'
import { findNextSlotDate } from '@/lib/suggestedSlots'
import { rateLimit, RATE_LIMITS } from '@/lib/rateLimit'
import { SLOT_TIMES } from '@/types'

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const tournamentId = params.id
  const body = await req.json().catch(() => null)

  const day        = body?.day
  const slot_time  = body?.slot_time
  const format     = body?.format
  const exclude_dates: string[] = Array.isArray(body?.exclude_dates)
    ? body.exclude_dates.filter((d: unknown): d is string => typeof d === 'string').slice(0, 50)
    : []
  // Other bucket cards' current dates, so this bucket's next date can't
  // land within a weekend of one of its siblings either — see
  // findNextSlotDate's weekend-gap handling in suggestedSlots.ts.
  const avoid_near_dates: string[] = Array.isArray(body?.avoid_near_dates)
    ? body.avoid_near_dates.filter((d: unknown): d is string => typeof d === 'string').slice(0, 20)
    : []

  if (day !== 'Sat' && day !== 'Sun') {
    return NextResponse.json({ error: 'Invalid day' }, { status: 400 })
  }
  if (!SLOT_TIMES.includes(slot_time)) {
    return NextResponse.json({ error: 'Invalid slot_time' }, { status: 400 })
  }
  if (format !== 'T20' && format !== 'T30') {
    return NextResponse.json({ error: 'Invalid format' }, { status: 400 })
  }

  const rl = await rateLimit(req, RATE_LIMITS.publicRead)
  if (rl) return rl

  const supabase = createServiceClient()
  const { data: tournament } = await supabase
    .from('tournaments')
    .select('id, organiser_self_service')
    .eq('id', tournamentId)
    .single()

  if (!tournament) return NextResponse.json({ error: 'Tournament not found' }, { status: 404 })
  if (!tournament.organiser_self_service) {
    return NextResponse.json({ error: 'Self-service reservations are not enabled for this tournament.' }, { status: 403 })
  }

  const result = await findNextSlotDate(tournamentId, day, slot_time, format, exclude_dates, avoid_near_dates)
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status })

  return NextResponse.json({ game_date: result.game_date })
}
