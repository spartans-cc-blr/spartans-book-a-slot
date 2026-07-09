// POST /api/wrangler/parse-announcement — read-only.
// Parses a pasted WhatsApp squad-announcement message and resolves each
// named player against the players table, and resolves the target booking
// via a three-step fallback chain (see resolveBooking below). Wrangler/
// Admin only — this route reads the full player roster and booking list,
// so it must stay behind auth even though it performs no writes.

import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { createServiceClient } from '@/lib/supabase'
import { parseAnnouncement, type ParsedAnnouncement, type SquadRole } from '@/lib/parseAnnouncement'

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

// date_raw is day + month only (e.g. "5th July") — no year, so this can
// only ever narrow candidates by day-of-month + month, never a full date.
const MONTH_NAMES = [
  'january', 'february', 'march', 'april', 'may', 'june',
  'july', 'august', 'september', 'october', 'november', 'december',
]

function parseDateRawParts(dateRaw: string | null): { day: number; month: number } | null {
  if (!dateRaw) return null
  const m = dateRaw.match(/(\d{1,2})(?:st|nd|rd|th)?\s+([A-Za-z]+)/)
  if (!m) return null
  const day = parseInt(m[1], 10)
  const monthName = m[2].toLowerCase()
  const monthIdx = MONTH_NAMES.findIndex(mn => mn === monthName || mn.startsWith(monthName))
  if (monthIdx === -1) return null
  return { day, month: monthIdx + 1 } // 1-indexed
}

interface BookingCandidate {
  id: string
  game_date: string
  format: string
  opponent_name: string | null
}

type ResolvedVia = 'fixtures_link' | 'match_id' | 'date_format_fallback' | 'unresolved'

interface ResolveResult {
  booking_id:   string | null
  resolved_via: ResolvedVia
  candidates?:  BookingCandidate[]
}

// Tries, in order: (1) the direct /fixtures/<uuid> link, (2) the CricHeroes
// scorecard id from the Match Link matched against bookings.match_id, (3) a
// day+month+format fallback. Each method only "succeeds" (sets booking_id)
// when it resolves to exactly one row — ambiguous or empty results fall
// through to the next method rather than guessing.
async function resolveBooking(
  parsed: ParsedAnnouncement,
  supabase: ReturnType<typeof createServiceClient>
): Promise<ResolveResult> {
  if (parsed.booking_id_from_link) {
    return { booking_id: parsed.booking_id_from_link, resolved_via: 'fixtures_link' }
  }

  if (parsed.match_id) {
    const { data } = await supabase
      .from('bookings')
      .select('id, game_date, format, opponent_name')
      .eq('match_id', parsed.match_id)
    if (data?.length === 1) {
      return { booking_id: data[0].id, resolved_via: 'match_id' }
    }
  }

  const dateParts = parseDateRawParts(parsed.date_raw)
  if (dateParts && parsed.format_raw) {
    const { data } = await supabase
      .from('bookings')
      .select('id, game_date, format, opponent_name')
      .eq('format', parsed.format_raw)

    const candidates = (data ?? []).filter(b => {
      const [, gm, gd] = b.game_date.split('-').map(Number)
      return gd === dateParts.day && gm === dateParts.month
    })

    if (candidates.length === 1) {
      return { booking_id: candidates[0].id, resolved_via: 'date_format_fallback' }
    }
    // Zero or multiple candidates — do not guess; hand them to the client
    // (empty array included) so the wrangler gets a manual picker instead
    // of a false match.
    return { booking_id: null, resolved_via: 'date_format_fallback', candidates }
  }

  return { booking_id: null, resolved_via: 'unresolved' }
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

  const { booking_id, resolved_via, candidates } = await resolveBooking(parsed, supabase)

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
      roles: entry.roles as SquadRole[],
      matched_player_id: exact?.id ?? null,
      suggestions,
    }
  })

  // Availability + existing-squad context for the preview table and the
  // overwrite warning banner — both read-only, both keyed off the resolved
  // booking_id (whichever resolution method produced it).
  let availability: Record<string, string> = {}
  let existingSquadCount = 0

  if (booking_id) {
    const [availRes, squadRes] = await Promise.all([
      supabase.from('availability').select('player_id, response').eq('booking_id', booking_id),
      supabase.from('squad').select('id').eq('booking_id', booking_id),
    ])
    for (const row of availRes.data ?? []) availability[row.player_id] = row.response
    existingSquadCount = squadRes.data?.length ?? 0
  }

  return NextResponse.json({
    booking_id,
    resolved_via,
    candidates,
    date_raw:   parsed.date_raw,
    format_raw: parsed.format_raw,
    players,
    // Full roster so the UI can resolve a chosen suggestion (or manual
    // search) back to a player_id — names are unique across the club roster.
    roster: roster.map(p => ({ id: p.id, name: p.name })),
    availability,
    existing_squad_count: existingSquadCount,
  })
}
