// Opponent master list — see features/team-stats.md §5.
//
//   GET   any signed-in, non-expelled member  — master list + unlinked queue
//   POST  captain / GC / wrangler / admin     — create an opponent (optionally
//                                               linking a raw spelling at once)
//   PATCH captain / GC / wrangler / admin     — edit name / marquee / url / notes
//
// Same three-role write gate as the /opponents page itself; the page's
// canManage prop is UI only — this route is the real gate.

import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { createServiceClient } from '@/lib/supabase'
import { rateLimit, RATE_LIMITS } from '@/lib/rateLimit'
import { opponentCreateSchema, opponentUpdateSchema } from '@/lib/schemas'
import { normaliseOpponentName, linkSpellingToOpponent } from '@/lib/opponents'
import { suggestPlayers } from '@/lib/nameMatch'

async function requireManager() {
  const session = await getServerSession(authOptions)
  const user = session?.user as any
  if (!user) return { deny: NextResponse.json({ error: 'Unauthorised' }, { status: 401 }), user: null }
  if (user.playerStatus === 'expelled') return { deny: NextResponse.json({ error: 'Forbidden' }, { status: 403 }), user: null }
  if (!user.isCaptain && !user.isGC && !user.isWrangler && !user.isAdmin) {
    return { deny: NextResponse.json({ error: 'Unauthorised' }, { status: 403 }), user: null }
  }
  return { deny: null, user }
}

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions)
  const user = session?.user as any
  if (!user) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })
  if (user.playerStatus === 'expelled') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  const limited = await rateLimit(req, RATE_LIMITS.publicRead, user.playerId ?? user.email)
  if (limited) return limited

  const supabase = createServiceClient()
  const [{ data: opponents, error: oErr }, { data: aliases, error: aErr }, { data: bookings, error: bErr }] = await Promise.all([
    supabase.from('opponents').select('id, name, is_marquee, cricheroes_team_url, notes, created_at, updated_at').order('name'),
    supabase.from('opponent_aliases').select('opponent_id, alias'),
    supabase.from('bookings').select('id, opponent_name, opponent_id, game_date').eq('status', 'confirmed').not('opponent_name', 'is', null).range(0, 4999),
  ])
  if (oErr) return NextResponse.json({ error: oErr.message }, { status: 500 })
  if (aErr) return NextResponse.json({ error: aErr.message }, { status: 500 })
  if (bErr) return NextResponse.json({ error: bErr.message }, { status: 500 })

  const aliasesByOpp = new Map<string, string[]>()
  for (const a of aliases ?? []) {
    const list = aliasesByOpp.get(a.opponent_id) ?? []
    list.push(a.alias)
    aliasesByOpp.set(a.opponent_id, list)
  }
  const countByOpp = new Map<string, number>()
  const unlinked = new Map<string, { name: string; count: number; last_played: string }>()
  for (const b of bookings ?? []) {
    if (b.opponent_id) {
      countByOpp.set(b.opponent_id, (countByOpp.get(b.opponent_id) ?? 0) + 1)
      continue
    }
    const key = normaliseOpponentName(b.opponent_name)
    if (!key) continue
    const cur = unlinked.get(key)
    if (cur) {
      cur.count++
      if (b.game_date > cur.last_played) cur.last_played = b.game_date
    } else {
      unlinked.set(key, { name: String(b.opponent_name).trim(), count: 1, last_played: b.game_date })
    }
  }

  const roster = (opponents ?? []).map(o => ({ id: o.id, name: o.name }))
  const queue = Array.from(unlinked.values())
    .map(u => ({ ...u, suggestions: suggestPlayers(u.name, roster, 3) }))
    .sort((a, b) => b.count - a.count || b.last_played.localeCompare(a.last_played))

  return NextResponse.json({
    opponents: (opponents ?? []).map(o => ({
      ...o,
      aliases: (aliasesByOpp.get(o.id) ?? []).sort(),
      matches: countByOpp.get(o.id) ?? 0,
    })),
    unlinked: queue,
  })
}

export async function POST(req: NextRequest) {
  const { deny, user } = await requireManager()
  if (deny) return deny
  const limited = await rateLimit(req, RATE_LIMITS.captainWrite, user.playerId ?? user.email)
  if (limited) return limited

  const parsed = opponentCreateSchema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'Invalid input' }, { status: 400 })
  const { name, is_marquee, cricheroes_team_url, notes, link_name } = parsed.data

  const supabase = createServiceClient()
  const { data: opponent, error } = await supabase
    .from('opponents')
    .insert({
      name,
      is_marquee: is_marquee ?? false,
      cricheroes_team_url: cricheroes_team_url ?? null,
      notes: notes ?? null,
      created_by: user.playerId ?? null,
    })
    .select('id, name, is_marquee, cricheroes_team_url, notes, created_at, updated_at')
    .single()
  if (error) {
    if (error.code === '23505') return NextResponse.json({ error: 'An opponent with that name already exists' }, { status: 409 })
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  // The canonical name itself is always an alias of the opponent — so a
  // booking typed exactly as the master name links on save too — plus the
  // raw spelling the manager linked from the queue, if any.
  const linked = await linkSpellingToOpponent(supabase, opponent.id, name, user.playerId ?? null)
  const linkedRaw = link_name && normaliseOpponentName(link_name) !== normaliseOpponentName(name)
    ? await linkSpellingToOpponent(supabase, opponent.id, link_name, user.playerId ?? null)
    : 0

  return NextResponse.json({ opponent, linked_bookings: linked + linkedRaw })
}

export async function PATCH(req: NextRequest) {
  const { deny, user } = await requireManager()
  if (deny) return deny
  const limited = await rateLimit(req, RATE_LIMITS.captainWrite, user.playerId ?? user.email)
  if (limited) return limited

  const parsed = opponentUpdateSchema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'Invalid input' }, { status: 400 })
  const { id, ...updates } = parsed.data
  if (Object.keys(updates).length === 0) return NextResponse.json({ error: 'Nothing to update' }, { status: 400 })

  const supabase = createServiceClient()
  const { data, error } = await supabase
    .from('opponents')
    .update({ ...updates, updated_at: new Date().toISOString() })
    .eq('id', id)
    .select('id, name, is_marquee, cricheroes_team_url, notes, created_at, updated_at')
    .single()
  if (error) {
    if (error.code === '23505') return NextResponse.json({ error: 'An opponent with that name already exists' }, { status: 409 })
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
  // A renamed opponent's new name should resolve on future bookings too.
  if (updates.name) await linkSpellingToOpponent(supabase, id, updates.name, user.playerId ?? null)
  return NextResponse.json({ opponent: data })
}
