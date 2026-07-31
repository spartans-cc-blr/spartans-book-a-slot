// Resolves a match's "top performer(s)" for two distinct, deliberately
// decoupled purposes:
//
//   1. computeTopPerformers() / resolveMatchTopPerformers() — the same
//      highlight already shown to every viewer as gold text in
//      ScorecardTables.tsx (top run-scorer, top wicket-taker, all ties
//      included), also resolved to a Hub player_id so it can be used as an
//      authorization input. Feeds canActOnScorecard() (scorecardAuth.ts) and
//      the standalone match page's canAct check — deliberately kept broad,
//      since it's granting real verify/flag access, not just picking who to
//      message.
//
//   2. computeMatchMVP() — the single match MVP, using the exact same
//      formula spartans-python's MVPCalculator already computes per player
//      per stat category (batting/bowling/fielding mvp_score columns,
//      already synced into match_stats_cache — see
//      features/post-match-scorecard.md). This is what the wrangler-only
//      "Request top performer to verify" share button now uses — a match
//      can have several players tied for top runs or top wickets, but
//      should only ever nudge ONE person. can_verify / canActOnScorecard
//      access is NOT narrowed to this — a tied top batter/bowler who isn't
//      the MVP still keeps verify/flag rights, same as before; only the
//      share list itself is now MVP-scoped.

import { createServiceClient } from '@/lib/supabase'

export interface SquadRef {
  player_id:   string
  player_name: string
  // Optional — callers that only need the auth check (scorecardAuth.ts)
  // never fetch it; callers that build the wrangler-only share message
  // (PerformerShareButton.tsx) do. Never sent to a non-wrangler/admin
  // viewer — see the per-viewer redaction in /api/matches/history.
  whatsapp?:   string | null
}

export type TopPerformerReason = 'top_scorer' | 'top_wicket_taker'

export interface TopPerformer {
  player_id: string | null
  name:      string
  reason:    TopPerformerReason
  statLine:  string
  whatsapp:  string | null
}

// Analytics DB field names aren't part of this repo's schema, so every
// lookup tries a couple of likely keys rather than assuming one exact shape
// — same defensive pattern as ScorecardTables.tsx's pickField/num.
function pickField(row: any, keys: string[]): any {
  for (const k of keys) if (row?.[k] != null) return row[k]
  return null
}

function num(row: any, keys: string[]): number {
  const v = pickField(row, keys)
  return v != null ? Number(v) : 0
}

// Same resolution order as ScorecardTables.tsx's findPlayerId — prefers the
// analytics row's own player_id (set once reconciled, see
// playerIdentityResolution.ts) over a case-insensitive name match against
// this booking's squad. Opponent players and unreconciled rows resolve to
// null and are simply not grantable access. Returns the whole matched
// squad row (not just the id) so callers can also pull whatsapp off it
// without a second lookup.
function resolveSquadMatch(row: any, name: string, squad: SquadRef[]): SquadRef | null {
  const rowPlayerId = pickField(row, ['player_id'])
  if (rowPlayerId) {
    const byId = squad.find(p => p.player_id === rowPlayerId)
    if (byId) return byId
  }
  const byName = squad.find(p => p.player_name?.trim().toLowerCase() === name?.trim().toLowerCase())
  return byName ?? null
}

export function computeTopPerformers(batting: any[], bowling: any[], squad: SquadRef[]): TopPerformer[] {
  const battingRows = (batting ?? []).filter(row =>
    pickField(row, ['dismissal_method']) !== 'did_not_bat' && num(row, ['balls', 'balls_faced']) > 0
  )
  const bowlingRows = (bowling ?? []).filter(row => num(row, ['overs', 'overs_bowled']) > 0)

  const topBatRuns  = battingRows.reduce((max, r) => Math.max(max, num(r, ['runs', 'total_runs'])), 0)
  const topBowlWkts = bowlingRows.reduce((max, r) => Math.max(max, num(r, ['wickets', 'wickets_taken'])), 0)

  const performers: TopPerformer[] = []

  if (topBatRuns > 0) {
    for (const row of battingRows) {
      if (num(row, ['runs', 'total_runs']) !== topBatRuns) continue
      const name  = pickField(row, ['player_name', 'name']) ?? 'Unknown'
      const match = resolveSquadMatch(row, name, squad)
      performers.push({
        player_id: match?.player_id ?? null,
        name,
        reason:    'top_scorer',
        statLine:  `${topBatRuns} runs (${num(row, ['balls', 'balls_faced'])}b)`,
        whatsapp:  match?.whatsapp ?? null,
      })
    }
  }

  if (topBowlWkts > 0) {
    for (const row of bowlingRows) {
      if (num(row, ['wickets', 'wickets_taken']) !== topBowlWkts) continue
      const name  = pickField(row, ['player_name', 'name']) ?? 'Unknown'
      const match = resolveSquadMatch(row, name, squad)
      performers.push({
        player_id: match?.player_id ?? null,
        name,
        reason:    'top_wicket_taker',
        statLine:  `${topBowlWkts}/${num(row, ['runs', 'runs_conceded'])} (${pickField(row, ['overs', 'overs_bowled']) ?? '—'} ov)`,
        whatsapp:  match?.whatsapp ?? null,
      })
    }
  }

  return performers
}

export function topPerformerPlayerIds(performers: TopPerformer[]): Set<string> {
  return new Set(performers.filter(p => p.player_id).map(p => p.player_id as string))
}

// Server-side resolver for routes that only have a booking_id in hand (the
// verify-scorecard / flag-reconciliation auth check) — pages that already
// fetched match_stats_cache + squad for their own rendering (the standalone
// match page, the history list) should call computeTopPerformers directly
// on that data instead of paying for a second round trip here.
export async function resolveMatchTopPerformers(
  supabase: ReturnType<typeof createServiceClient>,
  bookingId: string
): Promise<TopPerformer[]> {
  const [{ data: statsRow }, { data: squadRows }] = await Promise.all([
    supabase.from('match_stats_cache').select('batting, bowling').eq('booking_id', bookingId).maybeSingle(),
    supabase.from('squad').select('player_id, players(name)').eq('booking_id', bookingId),
  ])
  if (!statsRow) return []

  const squad: SquadRef[] = (squadRows ?? []).map((r: any) => ({
    player_id:   r.player_id,
    player_name: r.players?.name ?? '',
  }))

  return computeTopPerformers(statsRow.batting ?? [], statsRow.bowling ?? [], squad)
}

// ── Match MVP (single performer) ────────────────────────────────────────
//
// Sums the mvp_score column spartans-python's MVPCalculator already writes
// per player per stat category (batting_stats.mvp_score,
// bowling_stats.mvp_score, fielding_stats.mvp_score — see
// utils/mvp_calculator.py and utils/csv_writers.py in spartans-python),
// mirroring MVPCalculator.calculate_match_mvp()'s
// batting_mvp + bowling_mvp + fielding_mvp exactly rather than re-deriving
// the underlying formula in TypeScript — that formula is intricate (batting
// position strength, strike-rate bonuses, wicket-value-by-match-type,
// multi-wicket bonuses, fielding assist multipliers) and already computed
// once, correctly, at parse time; duplicating it here would be a second
// place for it to drift out of sync.
//
// IMPORTANT — max first, resolve second (fixed 31 Jul 2026): totals are
// grouped and maxed by the raw scorecard player_name (normalised), exactly
// like computeTopPerformers() above, and player_id resolution only happens
// afterward on the winner(s). An earlier version filtered candidates down
// to "already squad-resolved" BEFORE taking the max — that produced a
// wrong-but-confident answer on a real match (a Blendin practice game,
// 12 Apr): the true MVP by total score had scorecard names ("Keshav",
// "Aarit S") that don't byte-match their full Hub squad names ("Keshav
// Renganathan", "Aarit Srivatsava") because this booking's
// match_stats_cache predates their player_identity-resolution.md
// reconciliation (same stale-cache class as the incident documented in
// post-match-scorecard.md §15), so pre-filtering silently dropped both of
// them and picked the highest score among whichever handful of players
// happened to have an exact squad-name match — a real, verifiably wrong
// "MVP". Resolving after the max (like computeTopPerformers()) means an
// unresolvable winner now correctly yields no share target rather than
// substituting a lesser candidate. Squad-only opponents are handled the
// same way this already worked for computeTopPerformers(): they simply
// resolve to player_id: null and produce no grantable/messageable target
// — never a fabricated winner.
function pickReason(battingMvp: number, bowlingMvp: number): TopPerformerReason {
  return battingMvp >= bowlingMvp ? 'top_scorer' : 'top_wicket_taker'
}

export function computeMatchMVP(batting: any[], bowling: any[], fielding: any[], squad: SquadRef[]): TopPerformer[] {
  interface Agg {
    name:        string
    total:       number
    battingMvp:  number
    bowlingMvp:  number
    battingLine: string | null
    bowlingLine: string | null
    bestRow:     any // prefers a row carrying a resolved player_id, for resolveSquadMatch below
  }

  // Keyed by normalised player_name — the analytics DB's own
  // UNIQUE(match_id, player_name) constraint on each stat table means this
  // is exactly the same identity key those tables already use.
  const totals = new Map<string, Agg>()

  function ensure(name: string, row: any): Agg {
    const key = name.trim().toLowerCase()
    let agg = totals.get(key)
    if (!agg) {
      agg = { name, total: 0, battingMvp: 0, bowlingMvp: 0, battingLine: null, bowlingLine: null, bestRow: row }
      totals.set(key, agg)
    } else if (!pickField(agg.bestRow, ['player_id']) && pickField(row, ['player_id'])) {
      agg.bestRow = row
    }
    return agg
  }

  const battingRows = (batting ?? []).filter(row =>
    pickField(row, ['dismissal_method']) !== 'did_not_bat' && num(row, ['balls', 'balls_faced']) > 0
  )
  for (const row of battingRows) {
    const name = pickField(row, ['player_name', 'name']) ?? 'Unknown'
    const agg = ensure(name, row)
    const mvp = num(row, ['mvp_score'])
    agg.total += mvp
    agg.battingMvp += mvp
    agg.battingLine = `${num(row, ['runs', 'total_runs'])} runs (${num(row, ['balls', 'balls_faced'])}b)`
  }

  const bowlingRows = (bowling ?? []).filter(row => num(row, ['overs', 'overs_bowled']) > 0)
  for (const row of bowlingRows) {
    const name = pickField(row, ['player_name', 'name']) ?? 'Unknown'
    const agg = ensure(name, row)
    const mvp = num(row, ['mvp_score'])
    agg.total += mvp
    agg.bowlingMvp += mvp
    agg.bowlingLine = `${num(row, ['wickets', 'wickets_taken'])}/${num(row, ['runs', 'runs_conceded'])} (${pickField(row, ['overs', 'overs_bowled']) ?? '—'} ov)`
  }

  for (const row of (fielding ?? [])) {
    const name = pickField(row, ['player_name', 'name']) ?? 'Unknown'
    const agg = ensure(name, row)
    agg.total += num(row, ['mvp_score'])
  }

  const maxTotal = Array.from(totals.values()).reduce((max, a) => Math.max(max, a.total), 0)
  if (maxTotal <= 0) return []

  // Ties are only ever a genuine exact-float match — realistically rare
  // given the formula's SR/position/maiden bonuses, but handled the same
  // way computeTopPerformers() handles a tied top score, for consistency.
  return Array.from(totals.values())
    .filter(a => Math.abs(a.total - maxTotal) < 0.005)
    .map(a => {
      const match = resolveSquadMatch(a.bestRow, a.name, squad)
      return {
        player_id: match?.player_id ?? null,
        name:      match?.player_name || a.name,
        reason:    pickReason(a.battingMvp, a.bowlingMvp),
        statLine:  [a.battingLine, a.bowlingLine].filter(Boolean).join(' & ') || `MVP score ${maxTotal.toFixed(1)}`,
        whatsapp:  match?.whatsapp ?? null,
      }
    })
}

// Server-side resolver mirroring resolveMatchTopPerformers() above, for any
// future caller that only has a booking_id in hand and needs the MVP pick
// rather than the tie-inclusive top-scorer/top-wicket-taker set. The
// history list route (/api/matches/history/route.ts) already has
// batting/bowling/fielding + squad in memory per booking and calls
// computeMatchMVP() directly instead of paying for this extra round trip.
export async function resolveMatchMVP(
  supabase: ReturnType<typeof createServiceClient>,
  bookingId: string
): Promise<TopPerformer[]> {
  const [{ data: statsRow }, { data: squadRows }] = await Promise.all([
    supabase.from('match_stats_cache').select('batting, bowling, fielding').eq('booking_id', bookingId).maybeSingle(),
    supabase.from('squad').select('player_id, players(name, whatsapp)').eq('booking_id', bookingId),
  ])
  if (!statsRow) return []

  const squad: SquadRef[] = (squadRows ?? []).map((r: any) => ({
    player_id:   r.player_id,
    player_name: r.players?.name ?? '',
    whatsapp:    r.players?.whatsapp ?? null,
  }))

  return computeMatchMVP(statsRow.batting ?? [], statsRow.bowling ?? [], statsRow.fielding ?? [], squad)
}
