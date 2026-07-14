// POST /api/matches/[id]/scorecard
// Captain/VC (for this specific booking) or wrangler/admin (any booking)
// upload a CricHeroes PDF scorecard for a completed match. The PDF is
// validated server-side (magic bytes, size) then forwarded to the
// spartans-dw-ui Railway/Render microservice for parsing.
//
// vibe-security: the captain/VC check is a `squad` table lookup scoped to
// THIS booking_id + THIS player_id — never just "is this player a captain
// anywhere". is_wrangler bypasses the per-booking check but still requires
// an authenticated session with a valid playerId.

import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { createServiceClient } from '@/lib/supabase'
import { RATE_LIMITS, rateLimit } from '@/lib/rateLimit'

const MAX_FILE_BYTES = 10 * 1024 * 1024 // 10MB

// Render's free/hobby tier spins down after inactivity — a cold start alone
// can take ~30s, on top of parse time. Bounded well under maxDuration below
// so a hung or cold-starting microservice fails fast with a clear error
// instead of leaving the client waiting indefinitely.
const MICROSERVICE_TIMEOUT_MS = 45_000

// Vercel Hobby defaults to a 10s function timeout — nowhere near enough to
// wait out a cold microservice start plus parse. 60s is the Hobby ceiling.
export const maxDuration = 60

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const session = await getServerSession(authOptions)
  const user = session?.user as any
  if (!user?.playerId) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })

  const limited = await rateLimit(req, RATE_LIMITS.captainWrite, user.playerId)
  if (limited) return limited

  const supabase = createServiceClient()
  const bookingId = params.id

  // Auth: wrangler/admin can upload for any booking. Everyone else must be
  // captain or VC for THIS specific booking — re-derived server-side, never
  // trusted from the client.
  if (!user.isWrangler && !user.isAdmin) {
    const { data: squadRow } = await supabase
      .from('squad')
      .select('is_captain, is_vc')
      .eq('booking_id', bookingId)
      .eq('player_id', user.playerId)
      .maybeSingle()

    if (!squadRow?.is_captain && !squadRow?.is_vc) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }
  }

  const { data: booking, error: bookingErr } = await supabase
    .from('bookings')
    .select('id, match_id, game_date, status')
    .eq('id', bookingId)
    .eq('status', 'confirmed')
    .single()

  if (bookingErr || !booking) return NextResponse.json({ error: 'Booking not found' }, { status: 404 })

  const today = new Date().toISOString().split('T')[0]
  if (booking.game_date >= today) {
    return NextResponse.json({ error: 'Match not yet completed' }, { status: 400 })
  }

  const formData = await req.formData().catch(() => null)
  const file = formData?.get('file') as File | null
  if (!file) return NextResponse.json({ error: 'No file provided' }, { status: 400 })

  const bytes = await file.arrayBuffer()
  const buf = Buffer.from(bytes)

  if (buf.length === 0 || buf.length > MAX_FILE_BYTES) {
    return NextResponse.json({ error: 'File too large (max 10MB)' }, { status: 400 })
  }

  // Validate by magic bytes — never trust the Content-Type header.
  if (buf.subarray(0, 4).toString('latin1') !== '%PDF') {
    return NextResponse.json({ error: 'File must be a valid PDF' }, { status: 400 })
  }

  const microserviceUrl = process.env.MICROSERVICE_URL
  const microserviceSecret = process.env.MICROSERVICE_SECRET
  if (!microserviceUrl || !microserviceSecret) {
    return NextResponse.json({ error: 'Analytics microservice is not configured' }, { status: 500 })
  }

  // Upsert upload record — status always starts at pending_parse on a fresh
  // upload attempt (forward-only progression from here on).
  const { error: upsertErr } = await supabase.from('scorecard_uploads').upsert({
    booking_id:  bookingId,
    match_id:    booking.match_id,
    status:      'pending_parse',
    uploaded_by: user.playerId,
    uploaded_at: new Date().toISOString(),
    error_message: null,
  }, { onConflict: 'booking_id' })

  if (upsertErr) return NextResponse.json({ error: upsertErr.message }, { status: 500 })

  // Forward to microservice — secret sent server-to-server only.
  const fd = new FormData()
  fd.append('file', new Blob([buf], { type: 'application/pdf' }), file.name)
  if (booking.match_id) fd.append('match_id', booking.match_id)

  let msRes: Response
  try {
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), MICROSERVICE_TIMEOUT_MS)
    try {
      msRes = await fetch(`${microserviceUrl}/parse-scorecard`, {
        method:  'POST',
        headers: { 'x-secret': microserviceSecret },
        body:    fd,
        signal:  controller.signal,
      })
    } finally {
      clearTimeout(timeout)
    }
  } catch (err: any) {
    const timedOut = err?.name === 'AbortError'
    await supabase.from('scorecard_uploads')
      .update({
        error_message: timedOut
          ? `Microservice did not respond within ${MICROSERVICE_TIMEOUT_MS / 1000}s (likely a cold start — try again)`
          : `Microservice unreachable: ${err?.message ?? 'unknown error'}`,
      })
      .eq('booking_id', bookingId)
    return NextResponse.json(
      { error: timedOut ? 'Analytics microservice timed out — it may be cold-starting, try again in a minute' : 'Failed to reach analytics microservice' },
      { status: 502 }
    )
  }

  if (!msRes.ok) {
    const errText = await msRes.text().catch(() => 'Unknown error')
    await supabase.from('scorecard_uploads')
      .update({ error_message: errText })
      .eq('booking_id', bookingId)
    return NextResponse.json({ error: 'Parse failed', detail: errText }, { status: 502 })
  }

  const { error: statusErr } = await supabase
    .from('scorecard_uploads')
    .update({ status: 'parsed' })
    .eq('booking_id', bookingId)

  if (statusErr) return NextResponse.json({ error: statusErr.message }, { status: 500 })

  const result = await msRes.json().catch(() => ({}))
  return NextResponse.json({ ok: true, ...result })
}
