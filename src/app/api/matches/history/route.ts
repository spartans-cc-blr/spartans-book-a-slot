// GET /api/matches/history
// Signed-in members only — the detail route this list feeds into surfaces
// player names (with CricHeroes links), so unlike /schedule this isn't
// public. Reads still go through the service-role client (consistent with
// the rest of the app — no client-side Supabase reads).
//
// Keyset (cursor) pagination ordered by (game_date desc, slot_time desc, id
// desc) — the latest game played (not just the latest date; a date can have
// up to 3 slots) sits on top. Chosen over month-based paging because the
// "I Played" / "I Led" / tournament / venue / format / result filters below
// can shrink the result set to a handful of matches spread across years,
// which month-by-month browsing would make tedious. `cursor` is
// `${game_date}_${slot_time}_${booking_id}` of the last row already seen;
// strictly validated before use since it's interpolated into a raw
// PostgREST `.or()` filter string. `slot_time` is a Postgres enum whose
// declared order (07:30 < 10:30 < 12:30 < 14:30) already matches
// chronological order, so `.lt()`/`.eq()` on it behave correctly.
//
// Query params:
//   cursor        — opaque pagination cursor from a previous response
//   limit         — page size, default 15, max 50
//   tournament_id — exact match
//   ground_id     — resolves to bookings via the UNION of (a) its
//                   tournament's linked ground (tournaments.ground_id) and
//                   (b) its own free-text venue matching that ground's name
//                   (case-insensitive) — same two-signal pattern as
//                   getScopedMatchIds()/getPlayerBookingContextStats() in
//                   src/lib/playerStats.ts. Fixes a real undercount: a
//                   ground filter built from raw bookings.venue text alone
//                   split "Blendin Cricket Ground" and "Blendin Cricket
//                   Ground, Bengaluru (Bangalore)" into two buckets even
//                   though both are the same physical ground.
//   venue         — exact match on bookings.venue — fallback for genuine
//                   one-off venues with no grounds-table row; the client
//                   only sends this for options in filters' `venues` list,
//                   never for anything that resolved to a `grounds` entry
//   format        — 'T20' | 'T30'
//   result        — 'WON' | 'LOST' (whatever match_stats_cache.match_result
//                   values actually exist) — requires a synced scorecard;
//                   matches with no synced result are excluded when this is set
//   mine=1        — only matches where the signed-in player is in the squad
//   led=1         — only matches where the signed-in player was squad-level
//                   captain or vice-captain (squad.is_captain / squad.is_vc —
//                   never players.is_captain, which is the permanent
//                   club-level flag, not a per-match record)
//   month=YYYY-MM — jump straight to one calendar month (the month chip
//                   strip on the client); ANDs with every filter above and
//                   is completely independent of `cursor` — picking a month
//                   never disturbs the other filters, and vice versa

import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { createServiceClient } from '@/lib/supabase'
import { computeTopPerformers, type SquadRef } from '@/lib/matchTopPerformers'

const DEFAULT_LIMIT = 15
const MAX_LIMIT = 50
const CURSOR_RE = /^(\d{4}-\d{2}-\d{2})_(\d{2}:\d{2})_([0-9a-fA-F-]{36})$/
const MONTH_RE  = /^(\d{4})-(\d{2})$/

function nextMonthStr(month: string): string {
  const [y, m] = month.split('-').map(Number)
  return m === 12 ? `${y + 1}-01` : `${y}-${String(m + 1).padStart(2, '0')}`
}

// Analytics DB field names aren't part of this repo's schema, so every
// lookup tries a couple of likely keys rather than assuming one exact shape.
function pickField(row: any, keys: string[]): any {
  for (const k of keys) if (row?.[k] != null) return row[k]
  return null
}

function num(row: any, keys: string[]): number {
  const v = pickField(row, keys)
  return v != null ? Number(v) : 0
}

// Derives a light top-bat/top-bowl summary server-side so the list response
// stays small — the full batting/bowling arrays are only sent by the
// dedicated scorecard endpoint when a card is expanded.
function summarizeStats(row: any) {
  const battingArr = Array.isArray(row.batting) ? row.batting : []
  const bowlingArr = Array.isArray(row.bowling) ? row.bowling : []

  const topBat = battingArr.reduce((best: any, cur: any) => {
    const runs = num(cur, ['runs', 'total_runs'])
    const bestRuns = best ? num(best, ['runs', 'total_runs']) : -1
    return runs > bestRuns ? cur : best
  }, null)

  const topBowl = bowlingArr.reduce((best: any, cur: any) => {
    const wkts = num(cur, ['wickets', 'wickets_taken'])
    const bestWkts = best ? num(best, ['wickets', 'wickets_taken']) : -1
    if (wkts !== bestWkts) return wkts > bestWkts ? cur : best
    const conceded = num(cur, ['runs', 'runs_conceded'])
    const bestConceded = best ? num(best, ['runs', 'runs_conceded']) : Infinity
    return conceded < bestConceded ? cur : best
  }, null)

  return {
    match_result:     row.match_result ?? null,
    team_total:       row.team_total ?? null,
    team_wickets:     row.team_wickets ?? null,
    team_overs:       row.team_overs ?? null,
    opponent_total:   row.opponent_total ?? null,
    opponent_wickets: row.opponent_wickets ?? null,
    opponent_overs:   row.opponent_overs ?? null,
    top_bat: topBat ? {
      name:  pickField(topBat, ['player_name', 'name']),
      runs:  num(topBat, ['runs', 'total_runs']),
      balls: num(topBat, ['balls', 'balls_faced']),
    } : null,
    top_bowl: topBowl ? {
      name:    pickField(topBowl, ['player_name', 'name']),
      wickets: num(topBowl, ['wickets', 'wickets_taken']),
      runs:    num(topBowl, ['runs', 'runs_conceded']),
      overs:   num(topBowl, ['overs', 'overs_bowled']),
    } : null,
  }
}

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions)
  const user = session?.user as any
  if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
  if (user?.playerStatus === 'expelled') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const today = new Date().toISOString().split('T')[0]
  const params = req.nextUrl.searchParams

  const limitParam = parseInt(params.get('limit') ?? '', 10)
  const limit = Number.isFinite(limitParam) ? Math.min(Math.max(limitParam, 1), MAX_LIMIT) : DEFAULT_LIMIT

  const tournamentId = params.get('tournament_id') || null
  const groundId     = params.get('ground_id') || null
  const venue        = params.get('venue') || null
  const format       = params.get('format') || null
  const result       = params.get('result') || null
  const mine         = params.get('mine') === '1'
  const led          = params.get('led') === '1'
  const cursor       = params.get('cursor') || null
  const monthParam   = params.get('month') || null

  const supabase = createServiceClient()

  // "I Played" / "I Led" / "result" all narrow the result set to specific
  // booking IDs via a separate table lookup rather than a join on the main
  // query — mirrors the existing mine/led pattern. When more than one of
  // these is active, intersect rather than overwrite.
  let restrictToBookingIds: string[] | null = null
  if (mine || led) {
    if (!user?.playerId) return NextResponse.json({ matches: [], nextCursor: null, totalCount: 0 })
    let squadQuery = supabase.from('squad').select('booking_id').eq('player_id', user.playerId)
    if (led) squadQuery = squadQuery.or('is_captain.eq.true,is_vc.eq.true')
    const { data: squadRows, error: squadErr } = await squadQuery
    if (squadErr) return NextResponse.json({ error: squadErr.message }, { status: 500 })
    restrictToBookingIds = Array.from(new Set((squadRows ?? []).map(r => r.booking_id)))
    if (restrictToBookingIds.length === 0) return NextResponse.json({ matches: [], nextCursor: null, totalCount: 0 })
  }

  if (result) {
    const { data: resultRows, error: resultErr } = await supabase
      .from('match_stats_cache')
      .select('booking_id')
      .eq('match_result', result)
      .not('booking_id', 'is', null)
    if (resultErr) return NextResponse.json({ error: resultErr.message }, { status: 500 })
    const resultBookingIds = new Set((resultRows ?? []).map((r: any) => r.booking_id))
    restrictToBookingIds = restrictToBookingIds
      ? restrictToBookingIds.filter(id => resultBookingIds.has(id))
      : Array.from(resultBookingIds)
    if (restrictToBookingIds.length === 0) return NextResponse.json({ matches: [], nextCursor: null, totalCount: 0 })
  }

  // Ground filter — resolved to booking IDs via the same union-of-signals
  // pattern as getScopedMatchIds() (src/lib/playerStats.ts), not a raw
  // `.eq('venue', ...)` on the main query — see the header comment above.
  if (groundId) {
    const [{ data: ground, error: groundErr }, { data: groundTournaments, error: tErr }] = await Promise.all([
      supabase.from('grounds').select('name').eq('id', groundId).maybeSingle(),
      supabase.from('tournaments').select('id').eq('ground_id', groundId),
    ])
    if (groundErr) return NextResponse.json({ error: groundErr.message }, { status: 500 })
    if (tErr) return NextResponse.json({ error: tErr.message }, { status: 500 })

    const groundTournamentIds = (groundTournaments ?? []).map((t: any) => t.id)
    const groundName = ground?.name ?? null

    const [byTournament, byVenue] = await Promise.all([
      groundTournamentIds.length
        ? supabase.from('bookings').select('id').eq('status', 'confirmed').lt('game_date', today).in('tournament_id', groundTournamentIds)
        : Promise.resolve({ data: [] as { id: string }[], error: null }),
      groundName
        ? supabase.from('bookings').select('id').eq('status', 'confirmed').lt('game_date', today).ilike('venue', groundName)
        : Promise.resolve({ data: [] as { id: string }[], error: null }),
    ])
    if (byTournament.error) return NextResponse.json({ error: byTournament.error.message }, { status: 500 })
    if (byVenue.error) return NextResponse.json({ error: byVenue.error.message }, { status: 500 })

    const groundBookingIds = new Set<string>()
    for (const b of byTournament.data ?? []) groundBookingIds.add(b.id)
    for (const b of byVenue.data ?? []) groundBookingIds.add(b.id)

    restrictToBookingIds = restrictToBookingIds
      ? restrictToBookingIds.filter(id => groundBookingIds.has(id))
      : Array.from(groundBookingIds)
    if (restrictToBookingIds.length === 0) return NextResponse.json({ matches: [], nextCursor: null, totalCount: 0 })
  }

  // Never trust the client's month blindly — strictly shaped before use.
  const monthMatch = monthParam?.match(MONTH_RE)

  // Filters shared between the row fetch and the total-count query below —
  // deliberately excludes `cursor`, since the count must reflect the whole
  // current filter set, not just what's left after the page already loaded.
  function applySharedFilters(q: any) {
    q = q.eq('status', 'confirmed').lt('game_date', today)
    if (tournamentId)         q = q.eq('tournament_id', tournamentId)
    if (venue)                q = q.eq('venue', venue)
    if (format)               q = q.eq('format', format)
    if (restrictToBookingIds) q = q.in('id', restrictToBookingIds)
    if (monthMatch) {
      q = q.gte('game_date', `${monthMatch[0]}-01`).lt('game_date', `${nextMonthStr(monthMatch[0])}-01`)
    }
    return q
  }

  const { count: totalCount, error: countErr } = await applySharedFilters(
    supabase.from('bookings').select('id', { count: 'exact', head: true })
  )
  if (countErr) return NextResponse.json({ error: countErr.message }, { status: 500 })

  let query = applySharedFilters(
    supabase
      .from('bookings')
      .select('id, game_date, slot_time, match_time, opponent_name, format, tournament_id, venue, cricheroes_url, tournament:tournaments(name, ball_type, ground:grounds(name, maps_url, hospital_url))')
  )
    .order('game_date', { ascending: false })
    .order('slot_time', { ascending: false })
    .order('id', { ascending: false })
    .limit(limit)

  // Never trust the client's cursor blindly — it's about to be interpolated
  // into a raw filter string, so it must match this exact shape first.
  const cursorMatch = cursor?.match(CURSOR_RE)
  if (cursorMatch) {
    const [, cursorDate, cursorSlot, cursorId] = cursorMatch
    query = query.or(
      `game_date.lt.${cursorDate},` +
      `and(game_date.eq.${cursorDate},slot_time.lt.${cursorSlot}),` +
      `and(game_date.eq.${cursorDate},slot_time.eq.${cursorSlot},id.lt.${cursorId})`
    )
  }

  const { data, error } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const bookingIds = (data ?? []).map((b: any) => b.id)

  // Scorecard upload status, cached stats summary, (for the signed-in
  // player) which of these bookings they led, and squad role coverage —
  // batched into one round-trip each rather than per-row, and merged in JS
  // below. Role coverage drives whether the Squad collapsible even needs to
  // be shown on a card that already has synced stats (see roles_complete).
  const [uploadsRes, statsRes, ledRes, rolesRes, rosterRes] = bookingIds.length ? await Promise.all([
    supabase.from('scorecard_uploads').select('booking_id, status, uploaded_at, verified, needs_reconciliation, reconciliation_note, reconciliation_flagged_by, reconciliation_flagged_at').in('booking_id', bookingIds),
    supabase.from('match_stats_cache').select('booking_id, match_result, team_total, team_wickets, team_overs, opponent_total, opponent_wickets, opponent_overs, batting, bowling').in('booking_id', bookingIds),
    user?.playerId
      ? supabase.from('squad').select('booking_id').eq('player_id', user.playerId).in('booking_id', bookingIds).or('is_captain.eq.true,is_vc.eq.true')
      : Promise.resolve({ data: [] as { booking_id: string }[], error: null }),
    supabase.from('squad').select('booking_id, is_captain, is_vc, is_wk').in('booking_id', bookingIds),
    // Squad roster (player_id + name + whatsapp) per booking — feeds
    // top-performer name→player_id resolution below
    // (matchTopPerformers.ts). Batched once for the whole page rather
    // than per-card, same pattern as rolesRes just above. whatsapp is
    // fetched here regardless of viewer — it's redacted per-viewer below,
    // right before the response is built, same posture as can_upload/
    // can_verify being derived per-viewer from data fetched once.
    supabase.from('squad').select('booking_id, player_id, players(name, whatsapp)').in('booking_id', bookingIds),
  ]) : [{ data: [] as any[], error: null }, { data: [] as any[], error: null }, { data: [] as any[], error: null }, { data: [] as any[], error: null }, { data: [] as any[], error: null }]

  const uploadByBooking = new Map((uploadsRes.data ?? []).map((r: any) => [r.booking_id, r]))
  const statsByBooking  = new Map((statsRes.data ?? []).map((r: any) => [r.booking_id, r]))
  const ledBookingIds   = new Set((ledRes.data ?? []).map((r: any) => r.booking_id))

  const canSeeWhatsapp = !!user?.isWrangler || !!user?.isAdmin

  const squadByBooking = new Map<string, SquadRef[]>()
  for (const row of (rosterRes.data ?? [])) {
    const list = squadByBooking.get((row as any).booking_id) ?? []
    list.push({
      player_id:   (row as any).player_id,
      player_name: (row as any).players?.name ?? '',
      whatsapp:    (row as any).players?.whatsapp ?? null,
    })
    squadByBooking.set((row as any).booking_id, list)
  }

  // scorecard_uploads has several FK columns to players (uploaded_by,
  // fees_applied_by, verified_by, reconciliation_flagged_by) — an embedded
  // `players(...)` select would hit the FK-ambiguity error documented in
  // security.md, so flagger names are resolved via this separate batched
  // lookup instead, same pattern as the ledRes/rolesRes queries above.
  const flaggedByIds = Array.from(new Set(
    (uploadsRes.data ?? []).map((r: any) => r.reconciliation_flagged_by).filter(Boolean)
  ))
  const { data: flaggers } = flaggedByIds.length
    ? await supabase.from('players').select('id, name').in('id', flaggedByIds)
    : { data: [] as { id: string; name: string }[] }
  const flaggerName = new Map((flaggers ?? []).map((p: any) => [p.id, p.name]))

  // roles_complete: at least one squad row for the booking has is_captain,
  // one has is_vc, and one has is_wk. Computed per-booking from the flat
  // rolesRes rows rather than a groupBy, since Supabase JS has no groupBy.
  const rolesByBooking = new Map<string, { captain: boolean; vc: boolean; wk: boolean }>()
  for (const row of (rolesRes.data ?? [])) {
    const entry = rolesByBooking.get(row.booking_id) ?? { captain: false, vc: false, wk: false }
    if (row.is_captain) entry.captain = true
    if (row.is_vc) entry.vc = true
    if (row.is_wk) entry.wk = true
    rolesByBooking.set(row.booking_id, entry)
  }

  const matches = (data ?? []).map((b: any) => {
    const upload = uploadByBooking.get(b.id)
    const statsRow = statsByBooking.get(b.id)
    // Top scorer / top wicket-taker for this match, resolved to a Hub
    // player_id where possible — same isTop logic already shown as gold
    // text on the scorecard tables. Feeds can_verify below (auth) and
    // top_performers (the wrangler-only share button's data). Empty when
    // stats haven't synced yet — nothing to compute against.
    const performers = statsRow
      ? computeTopPerformers(statsRow.batting ?? [], statsRow.bowling ?? [], squadByBooking.get(b.id) ?? [])
      : []
    const canUpload = !!user?.isWrangler || !!user?.isAdmin || ledBookingIds.has(b.id)
    return {
      booking_id:      b.id,
      game_date:       b.game_date,
      slot_time:       b.slot_time,
      match_time:      b.match_time,
      opponent_name:   b.opponent_name,
      format:          b.format,
      tournament_id:   b.tournament_id,
      tournament_name: (b.tournament as any)?.name ?? null,
      ball_type:       (b.tournament as any)?.ball_type ?? null,
      venue:           b.venue,
      ground:          (b.tournament as any)?.ground ?? null,
      cricheroes_url:  b.cricheroes_url,
      scorecard_status:      upload?.status ?? null,
      scorecard_uploaded_at: upload?.uploaded_at ?? null,
      // Never trust the client — eligibility is derived from the session's
      // own role flags plus a server-side squad lookup, never client params.
      can_upload: canUpload,
      // Same audience as can_upload, plus this viewer if they're this
      // match's own resolved top performer — see matchTopPerformers.ts.
      // Deliberately NOT folded into can_upload itself: a top performer
      // gets verify/flag rights only, never upload/sync rights.
      can_verify: canUpload || (!!user?.playerId && performers.some(p => p.player_id === user.playerId)),
      // whatsapp is never sent to a non-wrangler/admin viewer — the share
      // button itself is also gated to that audience, but the API
      // response is redacted independently rather than relying on the
      // client to just not render it.
      top_performers: performers.map(p => ({
        player_id: p.player_id, name: p.name, reason: p.reason, statLine: p.statLine,
        whatsapp: canSeeWhatsapp ? p.whatsapp : null,
      })),
      verified:                       upload?.verified ?? false,
      needs_reconciliation:           upload?.needs_reconciliation ?? false,
      reconciliation_note:            upload?.reconciliation_note ?? null,
      reconciliation_flagged_at:      upload?.reconciliation_flagged_at ?? null,
      reconciliation_flagged_by_name: upload?.reconciliation_flagged_by ? (flaggerName.get(upload.reconciliation_flagged_by) ?? null) : null,
      stats: statsRow ? summarizeStats(statsRow) : null,
      roles_complete: (() => {
        const r = rolesByBooking.get(b.id)
        return !!r && r.captain && r.vc && r.wk
      })(),
    }
  })

  const last = matches[matches.length - 1]
  const nextCursor = matches.length === limit && last
    ? `${last.game_date}_${last.slot_time}_${last.booking_id}`
    : null

  return NextResponse.json({ matches, nextCursor, totalCount: totalCount ?? 0 })
}
