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
// across 3 match PDFs, zero mismatches). If the caller supplies the
// innings' final score/overs, one closing "unbroken" partnership is also
// emitted when the crease still holds two never-separated batters once
// Fall of Wickets is exhausted — covering both a team that lost no
// wickets at all, and any innings that ends not-all-out mid-stand.
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
  overTo:       number   // over this partnership ended (this wicket's own over) — or the innings' final over, if unbroken
  players:      [PartnershipPlayer, PartnershipPlayer]
  // Whichever of players[] this wicket's entry names as dismissed — null
  // means this stand was never separated (the innings ended first: overs
  // ran out, the chase was won, or the team finished with zero wickets
  // down at all). See FinalScore below for why this can only be populated
  // when the caller supplies one.
  outPlayer:    PartnershipPlayer | null
}

// The innings' final total/overs — needed to close out an unbroken
// partnership, since fall_of_wickets alone has no way to express "the
// innings just ended," only "a wicket fell." Without this, two real cases
// silently produced zero information about the batters actually at the
// crease when the innings finished: a team that lost no wickets at all
// (fallOfWickets is empty even though a real opening stand happened), and
// any innings that ends not-all-out mid-partnership (overs run out, or a
// chase is completed) — the last, often match-deciding stand was simply
// never emitted.
export interface FinalScore {
  total: number
  overs: number
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
  fallOfWickets: FallOfWicketRow[] | null | undefined,
  finalScore?: FinalScore | null
): Partnership[] | null {
  const fow = (fallOfWickets ?? []).slice().sort((a, b) => a.wicket_number - b.wicket_number)

  // Real batters only, in true batting order — a placeholder "did not
  // bat" row (batting_order 0, see spartans-python's BattingStatsWriter)
  // is never part of the crease sequence.
  const order = (batting ?? [])
    .filter(row => row.batted !== false && row.dismissal_method !== 'did_not_bat' && (row.batting_order ?? 0) > 0)
    .slice()
    .sort((a, b) => (a.batting_order ?? 0) - (b.batting_order ?? 0))

  if (order.length < 2) return []
  // No wickets fell AND no final score supplied — genuinely nothing
  // computable (not even the opening stand's runs). A caller that does
  // supply finalScore still gets the unbroken-opening-stand entry below,
  // even though fow itself is empty.
  if (fow.length === 0 && !finalScore) return []

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

    // The incoming batter fills the vacated slot (outIdx) rather than
    // always landing at index 1 — crease.splice()+push() would shift the
    // survivor down to fill the gap whenever index 0 was the one dismissed,
    // making them silently swap sides from one partnership to the next
    // (e.g. "Keshav & Darshan" reads as a new pairing even though Darshan
    // was already there, continuing). Keeping the survivor's index stable
    // means the same name visually persists in the same column across
    // consecutive rows, and only the incoming name changes each time.
    if (nextIn < order.length) {
      crease[outIdx] = order[nextIn]
      nextIn += 1
    } else {
      crease.splice(outIdx, 1) // no one left to bring in — last wicket of the innings
    }
    prevScore = entry.team_score
    prevOver  = entry.over
  }

  // Unbroken closing partnership — the innings ended (overs ran out, or
  // the chase was completed) with two batters never separated. This is
  // the same check for both extremes: zero wickets lost at all (the loop
  // above never ran, so crease is still exactly the two openers,
  // untouched) and any innings that finishes not-all-out partway through
  // a stand (crease still holds whoever was in when the last wicket fell,
  // if a partner was still available in `order`). `finalScore.total >
  // prevScore` is what distinguishes a real unbroken stand from an
  // innings that genuinely ended exactly on the last recorded wicket —
  // it also guards against ever emitting a negative-runs row.
  if (crease.length === 2 && finalScore && finalScore.total > prevScore) {
    partnerships.push({
      wicketNumber: fow.length + 1,
      runs:         finalScore.total - prevScore,
      overFrom:     prevOver,
      overTo:       finalScore.overs,
      players:      [toPlayer(crease[0]), toPlayer(crease[1])],
      outPlayer:    null,
    })
  }

  return partnerships
}
