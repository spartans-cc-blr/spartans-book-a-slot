// Derives batting partnerships from two already-synced analytics facts:
// batting order (batting_stats.batting_order) and Fall of Wickets
// (fall_of_wickets — see analytics-db/migrations/005_fall_of_wickets.sql
// and features/partnerships.md). Never stored — recomputed at read time
// from whatever match_stats_cache currently holds, same "raw facts in,
// derived view out" split as matchTopPerformers.ts.
//
// The crease-pointer algorithm: seed the two lowest-batting_order players
// as "at the crease", walk each Fall of Wickets entry in wicket_number
// order, credit the runs since the previous entry to the current pair,
// remove whichever one the entry names as dismissed, bring in the next
// batter by batting_order. See features/partnerships.md §4 for the full
// worked example this was validated against (FCC-Rockers, 6 real innings
// across 3 match PDFs, zero mismatches).
//
// Deliberately does NOT use matchTopPerformers.ts's resolveSquadMatch()
// pattern. That function exists because a top-performer row's own
// player_id can be null pre-reconciliation, so it falls back to a squad
// name match. Here, both the partnership's two players and the Fall of
// Wickets entry's dismissed name are matched against the SAME batting[]
// array passed in — there is no second, independent source to fall back
// to, and batting_stats.player_id is already the authoritative,
// already-reconciled identity for that scorecard name (see
// features/player-identity-resolution.md). A null player_id here just
// means this player hasn't been reconciled yet, same as anywhere else
// that reads batting_stats directly.

export interface PartnershipPlayer {
  playerId:   string | null
  playerName: string
}

export interface Partnership {
  wicketNumber: number
  runs:         number
  overFrom:     number   // over of the previous wicket, 0 for the first partnership
  overTo:       number   // over this partnership ended (this wicket's own over)
  players:      [PartnershipPlayer, PartnershipPlayer]
  outPlayer:    PartnershipPlayer   // whichever of players[] this wicket's entry names as dismissed
}

interface BattingRow {
  player_name:       string
  batting_order?:    number | null
  player_id?:        string | null
  batted?:           boolean
  dismissal_method?: string | null
}

interface FallOfWicketRow {
  wicket_number: number
  team_score:    number
  over:          number
  player_name:   string
}

function normalize(name: string | null | undefined): string {
  return (name ?? '').trim().toLowerCase()
}

// Returns null when the Fall of Wickets data doesn't self-consistently
// resolve against the batting order it was supposedly derived from — e.g.
// an entry names a player who isn't one of the two currently at the
// crease. Against genuinely correct data this should never happen (see
// the cross-checks features/partnerships.md §3 documents), so it's
// treated as a real data-integrity signal worth surfacing, never
// silently patched over with a guess.
//
// Returns [] (not null) for the ordinary "nothing to show yet" cases: no
// Fall of Wickets synced for this match, or fewer than two players with
// a real batting_order to seed the crease from (both expected on a
// booking whose scorecard predates this feature, or hasn't been
// re-synced since — see features/partnerships.md §5's "Nullable on
// nothing" note).
export function computePartnerships(
  batting: BattingRow[] | null | undefined,
  fallOfWickets: FallOfWicketRow[] | null | undefined
): Partnership[] | null {
  const fow = (fallOfWickets ?? []).slice().sort((a, b) => a.wicket_number - b.wicket_number)
  if (fow.length === 0) return []

  // Real batters only, in true batting order — a placeholder "did not
  // bat" row (batting_order 0, see spartans-python's BattingStatsWriter)
  // is never part of the crease sequence.
  const order = (batting ?? [])
    .filter(row => row.batted !== false && row.dismissal_method !== 'did_not_bat' && (row.batting_order ?? 0) > 0)
    .slice()
    .sort((a, b) => (a.batting_order ?? 0) - (b.batting_order ?? 0))

  if (order.length < 2) return []

  const toPlayer = (row: BattingRow): PartnershipPlayer => ({
    playerId:   row.player_id ?? null,
    playerName: row.player_name,
  })

  const crease: BattingRow[] = [order[0], order[1]]
  let nextIn = 2
  let prevScore = 0
  let prevOver = 0
  const partnerships: Partnership[] = []

  for (const entry of fow) {
    const outIdx = crease.findIndex(p => normalize(p.player_name) === normalize(entry.player_name))
    if (outIdx === -1) {
      console.error(
        `[partnerships] Fall of Wickets entry names "${entry.player_name}" (wicket ${entry.wicket_number}) ` +
        `but neither current crease occupant matches (${crease.map(p => p.player_name).join(', ')}) — ` +
        `dropping partnership derivation for this match rather than guessing.`
      )
      return null
    }

    partnerships.push({
      wicketNumber: entry.wicket_number,
      runs:         entry.team_score - prevScore,
      overFrom:     prevOver,
      overTo:       entry.over,
      players:      [toPlayer(crease[0]), toPlayer(crease[1])],
      outPlayer:    toPlayer(crease[outIdx]),
    })

    crease.splice(outIdx, 1)
    if (nextIn < order.length) {
      crease.push(order[nextIn])
      nextIn += 1
    }
    prevScore = entry.team_score
    prevOver  = entry.over
  }

  return partnerships
}
