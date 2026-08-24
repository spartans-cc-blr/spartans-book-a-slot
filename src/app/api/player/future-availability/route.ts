// src/app/api/player/future-availability/route.ts
//
// Captain-only: marks a date/slot as "I already know I can't lead a game"
// (response is always 'L' — see schemas.ts) for dates that don't have a
// real booking yet. Feeds the tournament share page's suggestion engines
// only — getSuggestedOpenDates()'s day-level exclusion and R8's exact-slot
// warning in src/lib/validation.ts. Distinct from /api/player-availability,
// which requires a real booking_id. No wallet-dues guard and no
// availability_locked/freeze check here — those only make sense once a
// real booking exists (see player-availability/route.ts).
//
// Narrowed to isCaptain||isAdmin (August 2026) — was open to any active
// player marking Y/O/E/L, but nothing ever consumed anything but a
// captain's own 'L', so the wider surface had no purpose. Route path/table
// name still say "player" — left as-is rather than renamed, since this is
// an internal API path with no external consumers to break.

import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { createServiceClient } from '@/lib/supabase'
import { rateLimit, RATE_LIMITS } from '@/lib/rateLimit'
import { futureAvailabilityRequestSchema, futureAvailabilitySlotTimeSchema, GAME_DATE_REGEX } from '@/lib/schemas'

const ALL_SLOT_TIMES = futureAvailabilitySlotTimeSchema.options

// ── GET — own rows, or (admin only) another captain's rows via ?player_id= ─
export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions)
  const player  = session?.user as any
  if (!player?.playerId || (!player?.isCaptain && !player?.isAdmin)) {
    return NextResponse.json({ availability: [] })
  }

  // Only an admin can look up someone else's marks — a non-admin caller
  // (including a captain) always sees their own rows regardless of what's
  // in the query string.
  const requestedPlayerId = req.nextUrl.searchParams.get('player_id')
  const targetPlayerId = player.isAdmin && requestedPlayerId ? requestedPlayerId : player.playerId

  const supabase = createServiceClient()
  const { data } = await supabase
    .from('player_future_availability')
    .select('game_date, slot_time, response')
    .eq('player_id', targetPlayerId)

  return NextResponse.json({ availability: data ?? [] })
}

// ── Upsert a single (player, game_date, slot_time) row — explicit
// SELECT → INSERT or UPDATE, no .upsert(), matching the rest of this repo's
// availability-write convention (see player-availability/route.ts).
async function upsertOne(
  supabase: ReturnType<typeof createServiceClient>,
  playerId: string,
  game_date: string,
  slot_time: string,
  response: string
): Promise<{ error: string | null }> {
  const { data: existing } = await supabase
    .from('player_future_availability')
    .select('id')
    .eq('player_id', playerId)
    .eq('game_date', game_date)
    .eq('slot_time', slot_time)
    .maybeSingle()

  if (existing?.id) {
    const { error } = await supabase
      .from('player_future_availability')
      .update({ response })
      .eq('id', existing.id)
    return { error: error?.message ?? null }
  }

  const { error } = await supabase
    .from('player_future_availability')
    .insert({ player_id: playerId, game_date, slot_time, response })
  return { error: error?.message ?? null }
}

// ── POST — mark unavailable (single slot, or whole_day fan-out) ───────────
export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  const player  = session?.user as any
  if (!player?.playerId) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
  if (player?.playerStatus === 'expelled') return NextResponse.json({ error: 'Account suspended' }, { status: 403 })
  if (!player?.isCaptain && !player?.isAdmin) {
    return NextResponse.json({ error: 'Unauthorised — captains only' }, { status: 403 })
  }

  const limited = await rateLimit(req, RATE_LIMITS.captainWrite, player.playerId)
  if (limited) return limited

  const body = await req.json().catch(() => null)
  const parsed = futureAvailabilityRequestSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'Invalid request' }, { status: 400 })
  }
  const { game_date, response, slot_time, whole_day } = parsed.data

  const supabase = createServiceClient()

  if (whole_day) {
    // Fan out to independent rows, one per slot_time — a later single-slot
    // edit only ever touches its own row, so this is a convenience for
    // creating 4 rows at once, not a persistent "day mode" flag.
    const results = await Promise.all(
      ALL_SLOT_TIMES.map(slot => upsertOne(supabase, player.playerId, game_date, slot, response))
    )
    const errors = results.map(r => r.error).filter((e): e is string => !!e)
    if (errors.length > 0) {
      return NextResponse.json({ error: errors[0] }, { status: 500 })
    }
    return NextResponse.json({ success: true })
  }

  const { error } = await upsertOne(supabase, player.playerId, game_date, slot_time!, response)
  if (error) return NextResponse.json({ error }, { status: 500 })

  return NextResponse.json({ success: true })
}

// ── DELETE — clear a single slot's mark ─────────────────────────────────────
export async function DELETE(req: NextRequest) {
  const session = await getServerSession(authOptions)
  const player  = session?.user as any
  if (!player?.playerId) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
  if (player?.playerStatus === 'expelled') return NextResponse.json({ error: 'Account suspended' }, { status: 403 })
  if (!player?.isCaptain && !player?.isAdmin) {
    return NextResponse.json({ error: 'Unauthorised — captains only' }, { status: 403 })
  }

  const limited = await rateLimit(req, RATE_LIMITS.captainWrite, player.playerId)
  if (limited) return limited

  const body = await req.json().catch(() => null)
  const game_date = body?.game_date
  const slot_time = body?.slot_time
  if (!game_date || !GAME_DATE_REGEX.test(game_date) || !ALL_SLOT_TIMES.includes(slot_time)) {
    return NextResponse.json({ error: 'game_date (YYYY-MM-DD) and a valid slot_time are required' }, { status: 400 })
  }

  const supabase = createServiceClient()
  const { error } = await supabase
    .from('player_future_availability')
    .delete()
    .eq('player_id', player.playerId)
    .eq('game_date', game_date)
    .eq('slot_time', slot_time)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ success: true })
}
