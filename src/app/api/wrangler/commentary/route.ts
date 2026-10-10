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

// Opaque token from the microservice's dry run (secrets.token_urlsafe). Lets the save call skip
// re-uploading and re-parsing the same PDF; see spartans-python api.py _remember_parse.
const PARSE_TOKEN_RE = /^[A-Za-z0-9_-]{16,64}$/

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

  const rawToken = String(form?.get('parse_token') ?? '')
  const parseToken = !dryRun && PARSE_TOKEN_RE.test(rawToken) ? rawToken : ''
  const hasFile = file instanceof File
  if (!hasFile && !parseToken) return NextResponse.json({ error: 'No file provided' }, { status: 400 })
  if (!UUID_RE.test(bookingId)) return NextResponse.json({ error: 'Invalid booking' }, { status: 400 })
  if (!isCommentarySide(side)) return NextResponse.json({ error: 'side must be spartans or opponent' }, { status: 400 })

  // With a token the microservice reuses the PDF it parsed during the dry run, so none is needed.
  const buf = hasFile ? Buffer.from(await (file as File).arrayBuffer()) : null
  if (buf) {
    const fileError = validateCommentaryPdf(buf.length, buf)
    if (fileError) return NextResponse.json({ error: fileError }, { status: 400 })
  }

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
  if (buf) upstream.append('file', new Blob([buf], { type: 'application/pdf' }), (file as File).name || `${side}.pdf`)
  if (parseToken) upstream.append('parse_token', parseToken)
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

  // Read as text first: an edge-level rejection (e.g. Cloudflare's 429 page in front of
  // Render) is not JSON, and the raw text is the only clue to what really happened.
  const rawText = await res.text().catch(() => '')
  let body: any = null
  try { body = rawText ? JSON.parse(rawText) : null } catch { body = null }

  // 200 = parsed (and saved when dry_run=false); 422 = checks failed, nothing
  // saved. Both carry the full result for the UI to render.
  if (res.status === 200 || res.status === 422) {
    return NextResponse.json(body, { status: res.status })
  }

  // Microservice 4xx messages are written for humans (unknown match, bad PDF…)
  // and safe to show. Anything else is an upstream fault.
  const detail = typeof body?.detail === 'string' ? body.detail : null

  // The saved parse expired or the service restarted: ask the client to resend the file once.
  if (res.status === 410 && detail === 'parse_expired') {
    return NextResponse.json({ error: 'The earlier check expired. Resending the file…', parse_expired: true }, { status: 410 })
  }

  // FastAPI's own bare "Not Found" means the route itself is missing, i.e. the
  // microservice is running a build without /parse-commentary. Say so instead
  // of showing the wrangler an unexplained "Not Found".
  if (res.status === 404 && detail === 'Not Found') {
    console.error('[wrangler/commentary] microservice has no /parse-commentary route (not deployed yet?)')
    return NextResponse.json(
      { error: 'The analytics service does not support commentary uploads yet. It needs redeploying; tell an admin.' },
      { status: 502 },
    )
  }
  if (res.status >= 400 && res.status < 500 && res.status !== 401 && res.status !== 403 && detail) {
    return NextResponse.json({ error: detail }, { status: res.status })
  }
  console.error(
    '[wrangler/commentary] microservice returned', res.status, detail,
    `server=${res.headers.get('server') ?? '?'}`, `body=${rawText.slice(0, 200)}`,
  )

  // Say what actually went wrong where we can tell, instead of one catch-all.
  if (res.status === 429) {
    return NextResponse.json(
      { error: 'The analytics service is rate-limiting requests right now (HTTP 429). Wait a few minutes and try again.' },
      { status: 429 },
    )
  }
  if (res.status === 401 || res.status === 403) {
    return NextResponse.json(
      { error: `The analytics service rejected this request (HTTP ${res.status}). Its access secret may be misconfigured; tell an admin.` },
      { status: 502 },
    )
  }
  return NextResponse.json(
    { error: `The analytics service failed to process this PDF (HTTP ${res.status}). If it keeps happening, tell an admin.` },
    { status: 502 },
  )
}
