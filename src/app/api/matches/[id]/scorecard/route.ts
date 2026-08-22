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
//
// Response shape: fast validation failures (auth, booking, file checks)
// return a normal JSON error response. Once past those, the response is a
// newline-delimited JSON stream of `{ step, message, ... }` progress events
// so the client can show exactly which stage a slow upload is sitting in
// (recording the row, forwarding to the microservice, waiting on it,
// finalizing) rather than one opaque "Uploading…" the whole time. The
// terminal event is always `{ step: 'done', ok: true, ... }` or
// `{ step: 'error', message }` — the HTTP status of a streamed response is
// fixed at 200 once headers are sent, so the client must read the terminal
// event to know success/failure, not res.ok.

import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { createServiceClient } from '@/lib/supabase'
import { RATE_LIMITS, rateLimit } from '@/lib/rateLimit'
import { hasMatchEnded } from '@/lib/matchStatus'

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
    .select('id, match_id, game_date, slot_time, format, status')
    .eq('id', bookingId)
    .eq('status', 'confirmed')
    .single()

  if (bookingErr || !booking) return NextResponse.json({ error: 'Booking not found' }, { status: 404 })

  if (!hasMatchEnded(booking.game_date, booking.slot_time, booking.format)) {
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

  // Past this point every step is potentially slow (DB write, a network
  // call that can legitimately take 45s on a cold start) — stream progress
  // instead of leaving the client with a single opaque wait.
  const encoder = new TextEncoder()

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      function send(event: Record<string, unknown>) {
        controller.enqueue(encoder.encode(JSON.stringify(event) + '\n'))
      }

      // Whatever happens below, the stream must end with exactly one
      // terminal event and always close — an unclosed stream leaves the
      // client's reader hanging forever, which is the exact failure mode
      // this endpoint exists to avoid.
      try {
        // Upsert upload record — status always starts at pending_parse on a
        // fresh upload attempt (forward-only progression from here on).
        send({ step: 'recording', message: 'Recording upload…' })
        const { error: upsertErr } = await supabase.from('scorecard_uploads').upsert({
          booking_id:  bookingId,
          match_id:    booking.match_id,
          status:      'pending_parse',
          uploaded_by: user.playerId,
          uploaded_at: new Date().toISOString(),
          error_message: null,
        }, { onConflict: 'booking_id' })

        if (upsertErr) {
          send({ step: 'error', message: upsertErr.message })
          return
        }

        // Forward to microservice — secret sent server-to-server only.
        const fd = new FormData()
        fd.append('file', new Blob([buf], { type: 'application/pdf' }), file.name)
        if (booking.match_id) fd.append('match_id', booking.match_id)

        send({ step: 'sending', message: 'Sending scorecard to analytics service — this can take up to a minute if it’s cold-starting…' })

        let msRes: Response
        try {
          const abortController = new AbortController()
          const timeout = setTimeout(() => abortController.abort(), MICROSERVICE_TIMEOUT_MS)
          try {
            msRes = await fetch(`${microserviceUrl}/parse-scorecard`, {
              method:  'POST',
              headers: { 'x-secret': microserviceSecret },
              body:    fd,
              signal:  abortController.signal,
            })
          } finally {
            clearTimeout(timeout)
          }
        } catch (err: any) {
          const timedOut = err?.name === 'AbortError'
          const message = timedOut
            ? `Microservice did not respond within ${MICROSERVICE_TIMEOUT_MS / 1000}s (likely a cold start — try again)`
            : `Microservice unreachable: ${err?.message ?? 'unknown error'}`
          await supabase.from('scorecard_uploads').update({ error_message: message }).eq('booking_id', bookingId)
          send({ step: 'error', message })
          return
        }

        if (!msRes.ok) {
          const errText = await msRes.text().catch(() => 'Unknown error')
          await supabase.from('scorecard_uploads').update({ error_message: errText }).eq('booking_id', bookingId)
          send({ step: 'error', message: `Parse failed: ${errText}` })
          return
        }

        send({ step: 'finalizing', message: 'Analytics service responded — saving results…' })

        const { error: statusErr } = await supabase
          .from('scorecard_uploads')
          .update({ status: 'parsed' })
          .eq('booking_id', bookingId)

        if (statusErr) {
          send({ step: 'error', message: statusErr.message })
          return
        }

        const result = await msRes.json().catch(() => ({}))
        // ok/status intentionally last — must always reflect what this route
        // itself just confirmed, never whatever the microservice happens to
        // include in its own response body.
        send({ step: 'done', ...result, ok: true, status: 'parsed' })
      } catch (err: any) {
        send({ step: 'error', message: err?.message ?? 'Unexpected server error' })
      } finally {
        controller.close()
      }
    },
  })

  return new Response(stream, {
    headers: {
      'Content-Type':  'application/x-ndjson',
      'Cache-Control': 'no-cache',
    },
  })
}
