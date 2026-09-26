// Captaincy stats — the fetch behind /captains-corner/my-players (a
// captain's players by batting position, and the bowlers he used most) and
// the "Under each captain" section on /players/[id]/stats. See
// features/captaincy-stats.md.
//
// Server-only: reads the Hub DB (bookings, squad, players) via the
// service-role client and the analytics DB (batting_stats/bowling_stats)
// via ANALYTICS_SUPABASE_KEY. Never import into a 'use client' file — the
// pure aggregators live in captaincyStatsCore.ts and are re-exported here.
//
// "Captain" always means the match captain — squad.is_captain on that
// booking — not players.is_captain (the permanent club flag). Same source
// Team Record's Captain split uses (src/lib/teamStats.ts).
//
// Scope: confirmed Hub bookings with a match_id, practice games excluded
// (both the tournament-level and booking-level flag — see
// features/practice-games.md). A player's stats are keyed by the analytics
// DB's reconciled player_id, so an unreconciled scorecard name simply
// doesn't appear, same as every other stats surface.

import { createServiceClient } from '@/lib/supabase'
import { createAnalyticsClient } from '@/lib/playerIdentityResolution'
import { fetchAllRows } from '@/lib/playerStats'
import type { CaptaincyInnings, CaptainOption } from '@/lib/captaincyStatsCore'

export * from '@/lib/captaincyStatsCore'

function num(v: any): number {
  const n = Number(v)
  return Number.isFinite(n) ? n : 0
}

// Cricket overs notation: "3.4" = 3 overs + 4 balls, not 3.4 overs.
function oversToBalls(overs: number): number {
  if (!overs) return 0
  const whole = Math.trunc(overs)
  return whole * 6 + Math.round((overs - whole) * 10)
}

function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = []
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size))
  return out
}

function one<T>(v: T | T[] | null | undefined): T | null {
  return Array.isArray(v) ? (v[0] ?? null) : (v ?? null)
}

async function loadBookingsAndCaptains() {
  const hub = createServiceClient()
  const { data: bookingRows, error: bErr } = await hub
    .from('bookings')
    .select('id, game_date, format, match_id, opponent_name, is_practice, tournament:tournaments!bookings_tournament_id_fkey(name, is_practice)')
    .eq('status', 'confirmed')
    .not('match_id', 'is', null)
    .order('game_date', { ascending: true })
    .range(0, 4999)
  if (bErr) throw new Error(bErr.message)

  const bookings = (bookingRows ?? []).filter((b: any) => !b.is_practice && !one<any>(b.tournament)?.is_practice)

  const captainRows: any[] = []
  await Promise.all(chunk(bookings.map((b: any) => b.id as string), 200).map(async ids => {
    const { data, error } = await hub
      .from('squad')
      .select('booking_id, player_id, players(name)')
      .eq('is_captain', true)
      .in('booking_id', ids)
    if (error) throw new Error(error.message)
    captainRows.push(...(data ?? []))
  }))
  const captainByBooking = new Map<string, { id: string; name: string | null }>()
  for (const r of captainRows) {
    captainByBooking.set(r.booking_id, { id: r.player_id, name: one<any>(r.players)?.name ?? null })
  }
  return { bookings, captainByBooking }
}

// Every player who has captained at least one in-scope match, most matches
// first — feeds the GC/admin captain picker. Hub-only, no analytics read.
export async function getMatchCaptains(): Promise<CaptainOption[]> {
  const { bookings, captainByBooking } = await loadBookingsAndCaptains()
  const map = new Map<string, { name: string; matches: Set<string> }>()
  for (const b of bookings) {
    const cap = captainByBooking.get(b.id)
    if (!cap) continue
    if (!map.has(cap.id)) map.set(cap.id, { name: cap.name ?? 'Unknown captain', matches: new Set() })
    map.get(cap.id)!.matches.add(b.match_id)
  }
  return Array.from(map.entries())
    .map(([id, v]) => ({ id, name: v.name, matches: v.matches.size }))
    .sort((a, b) => b.matches - a.matches || a.name.localeCompare(b.name))
}

// One row per (match, player) where the player appears in batting_stats or
// bowling_stats. Pass `captainId` to scope to that captain's matches, or
// `playerId` to scope to one player's innings (or both).
export async function getCaptaincyInnings(opts: { captainId?: string; playerId?: string } = {}): Promise<CaptaincyInnings[]> {
  const hub = createServiceClient()
  const analytics = createAnalyticsClient()
  if (!analytics) throw new Error('Analytics database is not configured')

  const { bookings, captainByBooking } = await loadBookingsAndCaptains()
  if (bookings.length === 0) return []

  // A match_id can (rarely) be shared by two confirmed bookings — first one
  // wins, which is stable since bookings are ordered by date.
  const bookingByMatch = new Map<string, any>()
  for (const b of bookings) {
    if (opts.captainId && captainByBooking.get(b.id)?.id !== opts.captainId) continue
    if (!bookingByMatch.has(b.match_id)) bookingByMatch.set(b.match_id, b)
  }
  const matchIds = Array.from(bookingByMatch.keys())
  if (matchIds.length === 0) return []

  // Captain view: scope the analytics read to that captain's matches.
  // Player view: scope to that player — their row count is small, and the
  // bookingByMatch lookup below drops anything outside the Hub scope.
  const matchChunks = opts.captainId ? chunk(matchIds, 200) : [null]
  async function read(table: string, columns: string): Promise<any[]> {
    const parts = await Promise.all(matchChunks.map(ids => fetchAllRows(() => {
      let q = analytics!.from(table).select(columns).order('match_id').order('player_name').not('player_id', 'is', null)
      if (opts.playerId) q = q.eq('player_id', opts.playerId)
      if (ids) q = q.in('match_id', ids)
      return q
    })))
    return parts.flat()
  }
  const [batting, bowling] = await Promise.all([
    read('batting_stats', 'match_id, player_id, player_name, batting_order, runs, balls, not_out, batted'),
    read('bowling_stats', 'match_id, player_id, player_name, overs, runs, wickets, did_bowl'),
  ])

  // One player can carry two rows in the same match when two scorecard
  // spellings alias to them (see features/player-identity-resolution.md
  // §5.2) — keep the row that actually shows participation.
  type Acc = { matchId: string; playerId: string; bat: any | null; bowl: any | null }
  const acc = new Map<string, Acc>()
  function slot(r: any): Acc | null {
    if (!bookingByMatch.has(r.match_id)) return null
    const key = `${r.match_id}|${r.player_id}`
    if (!acc.has(key)) acc.set(key, { matchId: r.match_id, playerId: r.player_id, bat: null, bowl: null })
    return acc.get(key)!
  }
  for (const r of batting) {
    const a = slot(r)
    if (a && (!a.bat || (r.batted && !a.bat.batted))) a.bat = r
  }
  for (const r of bowling) {
    const a = slot(r)
    if (a && (!a.bowl || (r.did_bowl && !a.bowl.did_bowl))) a.bowl = r
  }
  if (acc.size === 0) return []

  const playerIds = Array.from(new Set(Array.from(acc.values()).map(a => a.playerId)))
  const players: any[] = []
  await Promise.all(chunk(playerIds, 200).map(async ids => {
    const { data, error } = await hub.from('players').select('id, name, cricheroes_url').in('id', ids)
    if (error) throw new Error(error.message)
    players.push(...(data ?? []))
  }))
  const playerById = new Map(players.map(p => [p.id, p]))

  const out: CaptaincyInnings[] = []
  for (const a of Array.from(acc.values())) {
    const player = playerById.get(a.playerId)
    // Reconciled to a player_id no longer in Hub — skip, same as the
    // leaderboard, rather than attribute stats to an unverifiable name.
    if (!player) continue
    const b = bookingByMatch.get(a.matchId)
    const cap = captainByBooking.get(b.id) ?? null
    const pos = a.bat?.batting_order != null ? num(a.bat.batting_order) : null
    out.push({
      matchId: a.matchId,
      bookingId: b.id,
      gameDate: b.game_date,
      format: b.format ?? null,
      tournamentName: one<any>(b.tournament)?.name ?? null,
      opponentName: b.opponent_name ?? null,
      captainId: cap?.id ?? null,
      captainName: cap?.name ?? null,
      playerId: a.playerId,
      playerName: player.name,
      cricheroesUrl: player.cricheroes_url ?? null,
      batting: a.bat?.batted
        ? { position: pos && pos >= 1 ? pos : null, runs: num(a.bat.runs), balls: num(a.bat.balls), notOut: a.bat.not_out === 'Y' }
        : null,
      bowling: a.bowl?.did_bowl
        ? { balls: oversToBalls(num(a.bowl.overs)), runs: num(a.bowl.runs), wickets: num(a.bowl.wickets) }
        : null,
    })
  }
  return out.sort((x, y) => x.gameDate.localeCompare(y.gameDate) || x.matchId.localeCompare(y.matchId))
}
