// POST /api/wrangler/commentary — wrangler/admin only.
// Forwards one printed CricHeroes commentary PDF (one innings) to the
// microservice's POST /parse-commentary for a booking whose scorecard is
// already imported. No scorecard is refetched: the microservice only reads
// the existing match_stats row and writes ball_by_ball / commentary_uploads.
//
// Two-step use, same as the scorecard backfill's "confirm explicitly" habit:
//   dry_run=true  (default) -> parse + run every check, save nothing
//   dry_run=false           -> save; refused with 422 if any check failed,
//                              unless save_anyway=true
//
// vibe-security: the match id is re-derived from the booking server-side,
// never taken from the client. Role is re-validated on every request. The
// microservice secret is only ever sent server-to-server.

import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { createServiceClient } from '@/lib/supabase'
import { RATE_LIMITS, rateLimit } from '@/lib/rateLimit'
import { isCommentarySide, validateCommentaryPdf } from '@/lib/commentary'

// A cold Render dyno can take ~30s before it even starts parsing, so the
// outbound call gets its own timeout well under maxDuration (limitations.md H-4/H-5).
const MICROSERVICE_TIMEOUT_MS = 45_000
export const maxDuration = 60

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  const user = session?.user as any
  if (!user?.playerId) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
  if (!user?.isWrangler && !user?.isAdmin) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const limited = await rateLimit(req, RATE_LIMITS.adminWrite, user.playerId)
  if (limited) return limited

  const form = await req.formData().catch(() => null)
  const file = form?.get('file')
  const bookingId = String(form?.get('booking_id') ?? '')
  const side = form?.get('side')
  const dryRun = String(form?.get('dry_run') ?? 'true') !== 'false'
  const saveAnyway = String(form?.get('save_anyway') ?? 'false') === 'true'

  if (!(file instanceof File)) return NextResponse.json({ error: 'No file provided' }, { status: 400 })
  if (!UUID_RE.test(bookingId)) return NextResponse.json({ error: 'Invalid booking' }, { status: 400 })
  if (!isCommentarySide(side)) return NextResponse.json({ error: 'side must be spartans or opponent' }, { status: 400 })

  const buf = Buffer.from(await file.arrayBuffer())
  const fileError = validateCommentaryPdf(buf.length, buf)
  if (fileError) return NextResponse.json({ error: fileError }, { status: 400 })

  const supabase = createServiceClient()
  const { data: booking } = await supabase
    .from('bookings')
    .select('id, match_id')
    .eq('id', bookingId)
    .eq('status', 'confirmed')
    .maybeSingle()
  if (!booking) return NextResponse.json({ error: 'Booking not found' }, { status: 404 })
  if (!booking.match_id) {
    return NextResponse.json({ error: 'This booking has no CricHeroes match id yet' }, { status: 400 })
  }

  const microserviceUrl = process.env.MICROSERVICE_URL
  const microserviceSecret = process.env.MICROSERVICE_SECRET
  if (!microserviceUrl || !microserviceSecret) {
    return NextResponse.json({ error: 'Analytics microservice is not configured' }, { status: 500 })
  }

  const upstream = new FormData()
  upstream.append('file', new Blob([buf], { type: 'application/pdf' }), file.name || `${side}.pdf`)
  upstream.append('match_id', String(booking.match_id))
  upstream.append('side', side)
  upstream.append('dry_run', String(dryRun))
  upstream.append('save_anyway', String(saveAnyway))
  upstream.append('uploaded_by', String(user.playerId))

  let res: Response
  try {
    res = await fetch(`${microserviceUrl.replace(/\/$/, '')}/parse-commentary`, {
      method: 'POST',
      headers: { 'x-secret': microserviceSecret },
      body: upstream,
      signal: AbortSignal.timeout(MICROSERVICE_TIMEOUT_MS),
    })
  } catch (e: any) {
    const timedOut = e?.name === 'TimeoutError' || e?.name === 'AbortError'
    return NextResponse.json(
      { error: timedOut ? 'The analytics service took too long (it may be waking up). Try again.' : 'Could not reach the analytics service' },
      { status: 504 },
    )
  }

  const body = await res.json().catch(() => null)

  // 200 = parsed (and saved when dry_run=false); 422 = checks failed, nothing
  // saved. Both carry the full result for the UI to render.
  if (res.status === 200 || res.status === 422) {
    return NextResponse.json(body, { status: res.status })
  }

  // Microservice 4xx messages are written for humans (unknown match, bad PDF…)
  // and safe to show. Anything else is an upstream fault.
  const detail = typeof body?.detail === 'string' ? body.detail : null
  if (res.status >= 400 && res.status < 500 && res.status !== 401 && res.status !== 403 && detail) {
    return NextResponse.json({ error: detail }, { status: res.status })
  }
  console.error('[wrangler/commentary] microservice returned', res.status, detail)
  return NextResponse.json({ error: 'The analytics service failed to process this PDF' }, { status: 502 })
}
