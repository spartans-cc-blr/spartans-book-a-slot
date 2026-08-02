// POST /api/tournaments/[id]/organiser-attach-url
//
// Fully public, unauthenticated — the second half of the organiser
// self-service flow (see organiser-reserve/route.ts). Attaches a CricHeroes
// match URL to a hold this same flow created, then notifies GC so an admin
// can do the final one-click confirm from /admin/bookings/[id] — this route
// deliberately never flips status to 'confirmed' itself. Every other
// confirmed booking in this app is admin-created; an anonymous organiser
// (name + phone, unverified) shouldn't be the one exception.

import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase'
import { rateLimit, RATE_LIMITS } from '@/lib/rateLimit'
import { isCricheroesUrl } from '@/lib/cricheroesId'
import { notifyGCs } from '@/lib/webpush'
import { ORGANISER_SELF_SERVICE_REASON } from '@/types'

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const tournamentId = params.id
  const body = await req.json().catch(() => null)

  const booking_id    = typeof body?.booking_id === 'string' ? body.booking_id : ''
  const cricheroes_url = typeof body?.cricheroes_url === 'string' ? body.cricheroes_url.trim() : ''

  if (!booking_id) {
    return NextResponse.json({ error: 'Missing booking_id' }, { status: 400 })
  }
  if (!isCricheroesUrl(cricheroes_url)) {
    return NextResponse.json({ error: 'That doesn’t look like a CricHeroes link.' }, { status: 400 })
  }

  const rl = await rateLimit(req, RATE_LIMITS.organiserWrite, `${tournamentId}:${booking_id}`)
  if (rl) return rl

  const supabase = createServiceClient()

  const { data: booking } = await supabase
    .from('bookings')
    .select('id, tournament_id, status, block_reason, game_date, slot_time, tournament:tournaments!bookings_tournament_id_fkey(name)')
    .eq('id', booking_id)
    .single()

  // Only ever lets this attach onto a hold this same flow created, for this
  // same tournament, still awaiting confirmation — never an arbitrary
  // booking_id belonging to someone else's tournament or already resolved.
  if (
    !booking ||
    booking.tournament_id !== tournamentId ||
    booking.status !== 'soft_block' ||
    booking.block_reason !== ORGANISER_SELF_SERVICE_REASON
  ) {
    return NextResponse.json({ error: 'This reservation can no longer be updated.' }, { status: 404 })
  }

  const { error } = await supabase
    .from('bookings')
    .update({ cricheroes_url })
    .eq('id', booking_id)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const tournamentName = Array.isArray(booking.tournament)
    ? (booking.tournament[0] as any)?.name
    : (booking.tournament as any)?.name
  await notifyGCs(
    '\u{1F514} Self-service request ready',
    `${tournamentName ?? 'A tournament'} · ${booking.game_date} · ${booking.slot_time} — match link attached, ready to confirm`,
    `/admin/bookings/${booking_id}`
  )

  return NextResponse.json({ success: true })
}
