// POST /api/wrangler/parse-announcement — read-only.
// Parses a pasted WhatsApp squad-announcement message and resolves each
// named player against the players table. Wrangler/Admin only — this
// route reads the full player roster, so it must stay behind auth even
// though it performs no writes.

import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { createServiceClient } from '@/lib/supabase'
import { parseAnnouncement, type SquadRole } from '@/lib/parseAnnouncement'

async function requireWrangler() {
  const session = await getServerSession(authOptions)
  const user = session?.user as any
  if (!user?.playerId) return { error: NextResponse.json({ error: 'Not authenticated' }, { status: 401 }), user: null }
  if (!user?.isWrangler && !user?.isAdmin) return { error: NextResponse.json({ error: 'Forbidden' }, { status: 403 }), user: null }
  return { error: null, user }
}

// Plain Levenshtein edit distance — small roster (~150 names), no need for a library.
function levenshtein(a: string, b: string): number {
  const m = a.length, n = b.length
  const dp = Array.from({ length: m + 1 }, (_, i) => [i, ...Array(n).fill(0)])
  for (let j = 0; j <= n; j++) dp[0][j] = j
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      dp[i][j] = a[i - 1] === b[j - 1]
        ? dp[i - 1][j - 1]
        : 1 + Math.min(dp[i - 1][j - 1], dp[i - 1][j], dp[i][j - 1])
    }
  }
  return dp[m][n]
}

function normalise(s: string): string {
  return s.toLowerCase().replace(/[^a-z\s]/g, '').replace(/\s+/g, ' ').trim()
}

export async function POST(req: NextRequest) {
  const { error: authErr } = await requireWrangler()
  if (authErr) return authErr

  const body = await req.json().catch(() => null)
  const text = body?.text
  if (typeof text !== 'string' || !text.trim()) {
    return NextResponse.json({ error: 'text is required' }, { status: 400 })
  }

  const parsed = parseAnnouncement(text)

  const supabase = createServiceClient()
  const { data: allPlayers, error: playersErr } = await supabase
    .from('players')
    .select('id, name')

  if (playersErr) return NextResponse.json({ error: playersErr.message }, { status: 500 })

  const roster = allPlayers ?? []
  const byNormalisedName = new Map(roster.map(p => [normalise(p.name), p]))

  const players = parsed.players.map(entry => {
    const key = normalise(entry.name)
    const exact = byNormalisedName.get(key)

    let suggestions: string[] | undefined
    if (!exact && entry.name) {
      const scored = roster
        .map(p => ({ name: p.name, dist: levenshtein(key, normalise(p.name)) }))
        .sort((a, b) => a.dist - b.dist)
        .filter(s => s.dist <= Math.max(3, Math.ceil(key.length / 2)))
        .slice(0, 3)
      if (scored.length) suggestions = scored.map(s => s.name)
    }

    return {
      name: entry.name,
      role: entry.role as SquadRole | null,
      matched_player_id: exact?.id ?? null,
      suggestions,
    }
  })

  // Availability + existing-squad context for the preview table and the
  // overwrite warning banner — both read-only, both keyed off booking_id.
  let availability: Record<string, string> = {}
  let existingSquadCount = 0

  if (parsed.booking_id) {
    const [availRes, squadRes] = await Promise.all([
      supabase.from('availability').select('player_id, response').eq('booking_id', parsed.booking_id),
      supabase.from('squad').select('id').eq('booking_id', parsed.booking_id),
    ])
    for (const row of availRes.data ?? []) availability[row.player_id] = row.response
    existingSquadCount = squadRes.data?.length ?? 0
  }

  return NextResponse.json({
    booking_id: parsed.booking_id,
    date_raw:   parsed.date_raw,
    players,
    // Full roster so the UI can resolve a chosen suggestion (or manual
    // search) back to a player_id — names are unique across the club roster.
    roster: roster.map(p => ({ id: p.id, name: p.name })),
    availability,
    existing_squad_count: existingSquadCount,
  })
}
