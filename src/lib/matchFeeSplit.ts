// Shared per-player match fee split computation — extracted from
// POST /api/fees/apply so PATCH /api/fees/apply (match fee correction,
// see features/post-match-scorecard.md §6.1) can recompute the identical
// split against the *current* squad/exemption/units state without a second,
// drifting copy of the eligibility logic. Pure computation only — never
// writes anything; both routes still own their own writes.

import { createServiceClient } from '@/lib/supabase'

// Analytics DB field names aren't part of this repo's schema, so every
// lookup tries a couple of likely keys — same tolerance as ScorecardTables.tsx.
function pickField(row: any, keys: string[]): any {
  for (const k of keys) if (row?.[k] != null) return row[k]
  return null
}
function num(row: any, keys: string[]): number {
  const v = pickField(row, keys)
  return v != null ? Number(v) : 0
}

export interface FeeSquadRow {
  player_id:     string
  name:          string
  exempt:        boolean
  batted:        boolean
  bowled:        boolean
  units:         number
  default_units: number
  fee:           number
}

export interface MatchFeeSplitResult {
  baseFee:          number
  totalUnits:       number
  unitPrice:        number
  squad:            FeeSquadRow[]
  includedCount:    number
  totalCollectable: number
  totalSquad:       number
  // Rows whose final share diverges from the server-computed default —
  // the only ones that need a logged reason and a match_fee_waivers row.
  adjustedRows:     FeeSquadRow[]
}

export interface MatchFeeSplitError {
  error:  string
  status: number
}

export async function computeMatchFeeSplit(
  supabase: ReturnType<typeof createServiceClient>,
  bookingId: string,
  playerUnits: Record<string, number>
): Promise<MatchFeeSplitResult | MatchFeeSplitError> {
  // Derive fee server-side — never trust client input
  const { data: bookingRow } = await supabase
    .from('bookings')
    .select('match_id, match_fee_override, tournament:tournaments(match_fee)')
    .eq('id', bookingId)
    .single()

  const baseFee: number | null =
    (bookingRow as any)?.match_fee_override ??
    (bookingRow as any)?.tournament?.match_fee ??
    null

  if (!baseFee) {
    return { error: 'No match fee configured for this booking', status: 400 }
  }

  // Fetch announced squad with live exemption data
  const { data: squad } = await supabase
    .from('squad')
    .select('player_id, players(id, name, wallet_balance, fee_exemptions(start_date, end_date))')
    .eq('booking_id', bookingId)
    .eq('status', 'announced')

  if (!squad?.length) {
    return { error: 'No announced squad for this booking', status: 400 }
  }

  // Unit overrides must actually be for players in this booking's own
  // squad — never trust a client-supplied player_id beyond that.
  const squadIds = new Set(squad.map(row => row.player_id))
  const unitOverrideIds = Object.keys(playerUnits)
  if (unitOverrideIds.some(id => !squadIds.has(id))) {
    return { error: "One or more players are not in this booking's announced squad", status: 400 }
  }

  const today = new Date().toISOString().split('T')[0]
  const isExempt = (row: any) =>
    (row.players?.fee_exemptions ?? []).some(
      (e: any) => e.start_date <= today && (e.end_date === null || e.end_date >= today)
    )

  // Batting/bowling involvement — the "did they actually get a role" signal
  // for the waiver checklist. Same did-not-bat/bowl convention as
  // ScorecardTables.tsx. Best-effort: if the match isn't synced yet or a
  // scorecard name hasn't been reconciled to a player_id, this just comes
  // back empty rather than blocking anything.
  const battedIds = new Set<string>()
  const bowledIds = new Set<string>()
  if (bookingRow?.match_id) {
    const { data: statsRow } = await supabase
      .from('match_stats_cache')
      .select('batting, bowling')
      .eq('match_id', bookingRow.match_id)
      .maybeSingle()
    const nameToId = new Map(
      squad.map(row => [((row.players as any)?.name ?? '').trim().toLowerCase(), row.player_id])
    )
    for (const row of (statsRow as any)?.batting ?? []) {
      if (pickField(row, ['dismissal_method']) === 'did_not_bat' || num(row, ['balls', 'balls_faced']) <= 0) continue
      const pid = pickField(row, ['player_id']) ?? nameToId.get((pickField(row, ['player_name', 'name']) ?? '').trim().toLowerCase())
      if (pid) battedIds.add(pid)
    }
    for (const row of (statsRow as any)?.bowling ?? []) {
      if (num(row, ['overs', 'overs_bowled']) <= 0) continue
      const pid = pickField(row, ['player_id']) ?? nameToId.get((pickField(row, ['player_name', 'name']) ?? '').trim().toLowerCase())
      if (pid) bowledIds.add(pid)
    }
  }

  // Default share count for a player who wasn't given an explicit override:
  // 0 for a standing exemption (never overridable) or a squad member with
  // no recorded batting/bowling role, 1 for a recognized role.
  const defaultUnits = (row: any): number => {
    if (isExempt(row)) return 0
    return battedIds.has(row.player_id) || bowledIds.has(row.player_id) ? 1 : 0
  }

  // Final units per player: the caller's override if one was sent for that
  // player, clamped 0-12 (already enforced by the schema), else the
  // server-computed default. A standing exemption always wins regardless of
  // what the caller sent.
  const finalUnits = (row: any): number =>
    isExempt(row) ? 0 : (playerUnits[row.player_id] ?? defaultUnits(row))

  const squadDetail = squad.map(row => ({
    player_id:     row.player_id,
    name:          (row.players as any)?.name ?? 'Unknown',
    exempt:        isExempt(row),
    batted:        battedIds.has(row.player_id),
    bowled:        bowledIds.has(row.player_id),
    units:         finalUnits(row),
    default_units: defaultUnits(row),
  }))

  const totalUnits = squadDetail.reduce((sum, row) => sum + row.units, 0)
  const unitPrice = totalUnits > 0 ? Math.ceil(baseFee / totalUnits) : 0
  const squadWithFee: FeeSquadRow[] = squadDetail.map(row => ({ ...row, fee: unitPrice * row.units }))
  const includedCount = squadWithFee.filter(row => row.units > 0).length
  const totalCollectable = squadWithFee.reduce((sum, row) => sum + row.fee, 0)
  const adjustedRows = squadWithFee.filter(row => row.units !== row.default_units)

  return {
    baseFee,
    totalUnits,
    unitPrice,
    squad: squadWithFee,
    includedCount,
    totalCollectable,
    totalSquad: squad.length,
    adjustedRows,
  }
}
