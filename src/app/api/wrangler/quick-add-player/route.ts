// POST /api/wrangler/quick-add-player
//
// Lets a wrangler/admin create a minimal player record inline while
// backfilling a historic squad from WhatsApp text (see
// BackfillSquadClient.tsx) — for a name that genuinely has no match in the
// current roster (a player who left the club, or a one-off guest, often
// from a match years before the Hub existed).
//
// Deliberately NOT a thin wrapper around POST /api/players:
//   - That route defaults a new player's status to 'active' and fires a
//     club-wide "🎉 Welcome to the Club!" push to every subscribed player
//     (notifyAllSubscribed) — right for a real new recruit, actively wrong
//     for someone being retroactively logged against a years-old match.
//   - This route instead creates the row as status: 'inactive' (so it
//     doesn't surface in /players, Captains' Corner selection, or active
//     roster counts) and sends no notification at all.
//
// Idempotent on an exact (normalised) name match — reusing the same
// byNormalisedName approach parse-announcement.ts already uses to resolve
// a scorecard name against the roster, so re-submitting the same name
// twice (e.g. the same historic player appearing in two different
// backfilled matches) returns the same row instead of creating a
// duplicate.
//
// See features/squad-backfill.md.

import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { createServiceClient } from '@/lib/supabase'
import { rateLimit, RATE_LIMITS } from '@/lib/rateLimit'
import { quickAddPlayerSchema } from '@/lib/schemas'
import { normaliseName } from '@/lib/nameMatch'

async function requireWrangler() {
  const session = await getServerSession(authOptions)
  const user = session?.user as any
  if (!user?.playerId) return { error: NextResponse.json({ error: 'Not authenticated' }, { status: 401 }), user: null }
  if (!user?.isWrangler && !user?.isAdmin) return { error: NextResponse.json({ error: 'Forbidden' }, { status: 403 }), user: null }
  return { error: null, user }
}

export async function POST(req: NextRequest) {
  const { error: authErr, user } = await requireWrangler()
  if (authErr) return authErr

  const limited = await rateLimit(req, RATE_LIMITS.captainWrite, user!.playerId)
  if (limited) return limited

  const body = await req.json().catch(() => null)
  const parsed = quickAddPlayerSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'Invalid name' }, { status: 400 })
  }
  const name = parsed.data.name

  const supabase = createServiceClient()

  // Idempotent get-or-create — same exact-normalised-name key
  // parse-announcement.ts already uses to auto-resolve a scorecard name.
  const { data: roster, error: rosterErr } = await supabase.from('players').select('id, name')
  if (rosterErr) return NextResponse.json({ error: rosterErr.message }, { status: 500 })

  const key = normaliseName(name)
  const existing = (roster ?? []).find(p => normaliseName(p.name) === key)
  if (existing) {
    return NextResponse.json({ player: existing, created: false })
  }

  const { data, error } = await supabase
    .from('players')
    .insert({
      name,
      status: 'inactive',
      is_captain: false,
      is_gc: false,
      is_wrangler: false,
      wallet_balance: 0,
    })
    .select('id, name')
    .single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ player: data, created: true })
}
