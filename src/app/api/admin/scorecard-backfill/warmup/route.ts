// GET /api/admin/scorecard-backfill/warmup — admin-only. Pings the
// analytics microservice's own GET /health before the admin backfill page
// starts its client-driven loop, mirroring the "Warm up Render
// microservice" step .github/workflows/cron-backfill-scorecards.yml
// already added for the cron path (see features/post-match-scorecard.md
// §8's 2026-08-02 incident) — that fix was scoped to the GitHub Actions
// workflow only, so the admin page's own manual runs never got the same
// protection.
//
// Root cause this closes: a real 429 was traced to Render's free-tier
// dyno spinning down between manual admin sessions (confirmed via
// scorecard_uploads.error_message rows — always the generic "Microservice
// returned HTTP 429" fallback, never fetch-and-parse-scorecard's own
// friendlier "Rate limited by CricHeroes — wait before retrying" detail
// text, meaning the 429 never reached that route's own CricHeroes-status
// check at all). That's Render's own edge answering for a still-asleep
// dyno, not CricHeroes rate-limiting anything.
//
// Deliberately a separate, preceding call rather than a warm-up baked
// into backfillOneBooking() itself — folding it into that shared function
// would burn part of a single booking's already-tight 60s Vercel budget
// on the ~30-40s cold-start wait, reintroducing the exact 504 risk the
// cron's own warm-up step was built to avoid (see the 2026-08-02 incident
// write-up). This route has its own separate, generous budget instead.
import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'

export const maxDuration = 60

// Generous, but leaves headroom under this route's own 60s ceiling for
// the response to actually get back to the client.
const WARMUP_TIMEOUT_MS = 55_000

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions)
  const user = session?.user as any
  if (!user?.isAdmin) return NextResponse.json({ error: 'Unauthorised' }, { status: 403 })

  const microserviceUrl = process.env.MICROSERVICE_URL
  if (!microserviceUrl) {
    return NextResponse.json({ ok: false, error: 'Analytics microservice is not configured' })
  }

  const started = Date.now()
  try {
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), WARMUP_TIMEOUT_MS)
    let res: Response
    try {
      res = await fetch(`${microserviceUrl.replace(/\/+$/, '')}/health`, { signal: controller.signal })
    } finally {
      clearTimeout(timeout)
    }
    return NextResponse.json({ ok: res.ok, status: res.status, elapsed_ms: Date.now() - started })
  } catch (err: any) {
    // Best-effort — never blocks the admin page's own backfill loop from
    // proceeding, same "continuing anyway" posture as the cron workflow's
    // own warm-up step.
    return NextResponse.json({
      ok: false,
      error: err?.name === 'AbortError' ? 'Timed out waiting for the microservice to wake up' : (err?.message ?? 'Unreachable'),
      elapsed_ms: Date.now() - started,
    })
  }
}
