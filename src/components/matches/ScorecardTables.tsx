'use client'

import { PlayerNameLink } from '@/lib/playerLink'
import { computePartnerships } from '@/lib/partnerships'

interface SquadRef {
  player_id:      string
  player_name:    string
  cricheroes_url: string | null
  // Match-specific role designations (squad.is_captain/is_vc/is_wk — the
  // per-match record, not players.is_captain, see
  // features/squad-selection.md §3). Optional: not every caller of
  // ScorecardTables fetches these, and a squad row missing them just shows
  // no role tag, same as a squad-less match shows no tag at all.
  is_captain?:    boolean
  is_vc?:         boolean
  is_wk?:         boolean
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

// Prefers player_id (set once a scorecard name has been reconciled — see
// src/lib/playerIdentityResolution.ts) over the fragile case-insensitive
// name string match, which stays as a fallback for rows synced before
// reconciliation and degrades gracefully rather than showing no link at all.
function findCricHeroesUrl(row: any, name: string, squad?: SquadRef[]): string | null {
  if (!squad) return null
  const playerId = pickField(row, ['player_id'])
  if (playerId) {
    const byId = squad.find(p => p.player_id === playerId)
    if (byId) return byId.cricheroes_url ?? null
  }
  const byName = squad.find(p => p.player_name?.trim().toLowerCase() === name?.trim().toLowerCase())
  return byName?.cricheroes_url ?? null
}

// Same resolution order as findCricHeroesUrl — only ever resolves to a Hub
// player_id for someone in this booking's own squad. Opponent players and
// unreconciled scorecard rows return null and PlayerNameLink falls back to
// the CricHeroes link above instead.
function findPlayerId(row: any, name: string, squad?: SquadRef[]): string | null {
  if (!squad) return null
  const playerId = pickField(row, ['player_id'])
  if (playerId) {
    const byId = squad.find(p => p.player_id === playerId)
    if (byId) return byId.player_id
  }
  const byName = squad.find(p => p.player_name?.trim().toLowerCase() === name?.trim().toLowerCase())
  return byName?.player_id ?? null
}

// Same resolution order as findPlayerId/findCricHeroesUrl — returns the
// full squad row (not just an id) so its role flags can be read.
function findSquadMember(row: any, name: string, squad?: SquadRef[]): SquadRef | null {
  if (!squad) return null
  const playerId = pickField(row, ['player_id'])
  if (playerId) {
    const byId = squad.find(p => p.player_id === playerId)
    if (byId) return byId
  }
  const byName = squad.find(p => p.player_name?.trim().toLowerCase() === name?.trim().toLowerCase())
  return byName ?? null
}

// Match-specific role tag rendered next to a player's name wherever it
// appears in the scorecard — "(C)", "(WK)", or, when a player holds more
// than one role for this match, all of them combined into one tag, e.g.
// "(C, WK)" for a player who is both match captain and wicket-keeper.
function roleLabel(member: SquadRef | null): string | null {
  if (!member) return null
  const tags: string[] = []
  if (member.is_captain) tags.push('C')
  if (member.is_vc) tags.push('VC')
  if (member.is_wk) tags.push('WK')
  return tags.length > 0 ? `(${tags.join(', ')})` : null
}

function RoleTag({ member }: { member: SquadRef | null }) {
  const label = roleLabel(member)
  if (!label) return null
  return <span className="text-[var(--scorecard-text-faint)] font-normal"> {label}</span>
}

// catches + caught_behind (keeper catches are stored separately from
// fielder catches in the analytics DB, but both display as a plain "catch"
// on a scorecard) + stumpings + run_outs (already the total run-outs
// credited to this player, regardless of thrower/collector role).
function fieldingTotal(row: any): number {
  return num(row, ['catches']) + num(row, ['caught_behind']) + num(row, ['stumpings']) + num(row, ['run_outs'])
}

// Same one-line convention PerformerShareButton.tsx already uses for a
// WhatsApp greeting ("Hi Kushal," not "Hi Kushal Vidya,") — here it's for
// fitting two names on one partnership bar rather than a greeting, so kept
// as its own local copy rather than importing (that one isn't exported).
function firstName(name: string): string {
  return name.trim().split(/\s+/)[0]
}

// Converts CricHeroes' own "overs.balls" notation (e.g. 9.2 = 9 overs and
// 2 balls, never a true decimal) into a plain ball count (9*6+2 = 56).
// Parsed as a string rather than done with float math — `over` can arrive
// from Supabase as a numeric-typed string, and subtracting the whole part
// via floating point (9.2 - 9) reintroduces the exact precision error this
// sidesteps (e.g. 0.19999999999999982 instead of 0.2).
function oversToBalls(over: number | string): number {
  const [wholeStr, ballStr] = String(over).split('.')
  const whole = parseInt(wholeStr, 10) || 0
  const ball = ballStr ? parseInt(ballStr[0], 10) || 0 : 0
  return whole * 6 + ball
}

// Always two decimals so right-aligned SR / Eco columns line up neatly.
function formatStrikeRate(v: unknown): string {
  const n = typeof v === 'number' ? v : parseFloat(String(v ?? ''))
  return Number.isFinite(n) ? n.toFixed(2) : '—'
}

export function ScorecardTables({
  batting, bowling, fielding, teamList, fallOfWickets, teamTotal, teamOvers, teamWickets, squad, partnershipsSlot,
}: {
  batting: any[]
  bowling: any[]
  fielding?: any[]
  teamList?: any[]
  fallOfWickets?: any[]
  // The innings' own final score/overs/wickets — lets computePartnerships()
  // close out an unbroken final stand (zero wickets lost, or the innings
  // ended not-all-out mid-partnership) that Fall of Wickets alone can't
  // express, and — via teamWickets — tell that genuine case apart from a
  // match that simply has no Fall of Wickets data synced yet. See
  // src/lib/partnerships.ts's FinalScore doc comment.
  teamTotal?: number | null
  teamOvers?: number | null
  teamWickets?: number | null
  squad?: SquadRef[]
  // Replaces the Fall-of-Wickets partnership bars when the match has ball-by-ball
  // commentary (see BallPartnerships). Omitted = the bars below, exactly as before.
  partnershipsSlot?: React.ReactNode
}) {
  // Players who didn't bat/bowl get a zero-filled row (dismissal_method:
  // 'did_not_bat' for batting; every bowling field 0 for a player who never
  // bowled) so every squad member has a row in each table server-side —
  // filtered out here since they're just clutter in the readout. Balls
  // faced (not runs) is the right batting signal: a player can legitimately
  // score 0 off a ball they actually faced.
  // Sorted by the real batting/bowling order captured off the CricHeroes
  // scorecard (batting_order/bowling_order) — without this, rows render in
  // whatever order Postgres happens to return them in, which is not the
  // same thing and looked shuffled match to match. Rows synced before
  // bowling_order existed carry it as null/0 for every player; num()
  // reads that as 0 and Array.prototype.sort is stable, so those matches
  // just fall back to their pre-existing (unsorted) order rather than
  // breaking — they'll sort correctly once re-synced.
  const battingRows = batting
    .filter(row => pickField(row, ['dismissal_method']) !== 'did_not_bat' && num(row, ['balls', 'balls_faced']) > 0)
    .sort((a, b) => num(a, ['batting_order']) - num(b, ['batting_order']))
  const bowlingRows = bowling
    .filter(row => num(row, ['overs', 'overs_bowled']) > 0)
    .sort((a, b) => num(a, ['bowling_order']) - num(b, ['bowling_order']))

  // Most players in a squad had zero fielding involvement in a given match —
  // only show rows with at least one dismissal, same spirit as filtering
  // out did-not-bat / did-not-bowl rows above.
  const fieldingRows = (fielding ?? []).filter(row => fieldingTotal(row) > 0)

  const topBatRuns  = battingRows.reduce((max, r) => Math.max(max, num(r, ['runs', 'total_runs'])), 0)
  const battingTeamRuns = teamTotal != null && teamTotal > 0
    ? teamTotal
    : battingRows.reduce((sum, r) => sum + num(r, ['runs', 'total_runs']), 0)
  const topBowlWkts = bowlingRows.reduce((max, r) => Math.max(max, num(r, ['wickets', 'wickets_taken'])), 0)
  const totalBowlWkts = bowlingRows.reduce((sum, r) => sum + num(r, ['wickets', 'wickets_taken']), 0)
  const topFieldingTotal = fieldingRows.reduce((max, r) => Math.max(max, fieldingTotal(r)), 0)

  // computePartnerships() logs its own [partnerships] error and returns
  // null on a genuine data-integrity mismatch — nothing further to do here
  // besides not rendering, same as the ordinary "no Fall of Wickets synced
  // yet" [] case just below it.
  const finalScore = teamTotal != null && teamOvers != null ? { total: teamTotal, overs: teamOvers, wickets: teamWickets ?? null } : null
  const partnerships = computePartnerships(batting, fallOfWickets ?? [], finalScore) ?? []
  const topPartnershipRuns = partnerships.reduce((max, p) => Math.max(max, p.runs), 0)

  // The batting table filters out players who didn't bat, so on its own it
  // can't answer "who else was in the squad that day" — team_list (the full
  // playing XI from CricHeroes) fills that gap, mirroring the "Did not bat"
  // line CricHeroes itself shows below the scorecard.
  const battedNames = new Set(
    battingRows.map(row => (pickField(row, ['player_name', 'name']) ?? '').trim().toLowerCase())
  )
  const seenDidNotBat = new Set<string>()
  const didNotBatRows = (teamList ?? [])
    .filter(row => {
      const name = pickField(row, ['player_name', 'name'])
      if (!name) return false
      const key = name.trim().toLowerCase()
      if (battedNames.has(key) || seenDidNotBat.has(key)) return false
      seenDidNotBat.add(key)
      return true
    })

  return (
    <div className="space-y-4">
      <div>
        <p className="font-rajdhani text-xs font-bold tracking-widest uppercase text-[var(--scorecard-text-faint)] mb-2">Batting</p>
        <div className="overflow-x-auto">
          <table className="w-full table-fixed text-xs font-rajdhani">
            <colgroup>
              <col className="w-[38%]" />
              <col className="w-[10%]" />
              <col className="w-[10%]" />
              <col className="w-[10%]" />
              <col className="w-[10%]" />
              <col className="w-[22%]" />
            </colgroup>
            <thead>
              <tr className="text-[var(--scorecard-text-faint)] border-b border-[var(--scorecard-table-border)]">
                <th className="text-left py-1 pr-2">Player</th>
                <th className="text-right px-1">R</th>
                <th className="text-right px-1">B</th>
                <th className="text-right px-1">4s</th>
                <th className="text-right px-1">6s</th>
                <th className="text-right pl-1">SR</th>
              </tr>
            </thead>
            <tbody>
              {battingRows.map((row, i) => {
                const name = pickField(row, ['player_name', 'name']) ?? 'Unknown'
                const runs = num(row, ['runs', 'total_runs'])
                const isTop = topBatRuns > 0 && runs === topBatRuns
                // Contribution bar: this batter's share of the team total
                // (falls back to the sum of batters' runs when the synced
                // total isn't available, e.g. extras excluded).
                const share = battingTeamRuns > 0 ? Math.min(100, (runs / battingTeamRuns) * 100) : 0
                return (
                  <tr key={i} className={`border-b border-[var(--scorecard-table-divider)] ${isTop ? 'text-gold font-semibold' : 'text-[var(--scorecard-text-2)]'}`}>
                    <td className="text-left py-1.5 pr-2 align-middle">
                      <div className="leading-tight">
                        <PlayerNameLink name={name} playerId={findPlayerId(row, name, squad)} cricHeroesUrl={findCricHeroesUrl(row, name, squad)} />
                        {String(pickField(row, ['not_out']) ?? '').toUpperCase() === 'Y' && <span title="Not out">*</span>}
                        <RoleTag member={findSquadMember(row, name, squad)} />
                      </div>
                      <div
                        className="mt-1 h-1 w-full rounded-full bg-[var(--scorecard-divider)] overflow-hidden"
                        title={`${share.toFixed(0)}% of team score`}
                      >
                        <div className="h-full rounded-full bg-[var(--fx-accent)]" style={{ width: `${share}%`, minWidth: runs > 0 ? 2 : 0 }} />
                      </div>
                    </td>
                    <td className="text-right px-1 align-middle">{runs}</td>
                    <td className="text-right px-1 align-middle">{num(row, ['balls', 'balls_faced'])}</td>
                    <td className="text-right px-1 align-middle">{num(row, ['fours', '4s'])}</td>
                    <td className="text-right px-1 align-middle">{num(row, ['sixes', '6s'])}</td>
                    <td className="text-right pl-1 align-middle tabular-nums">{formatStrikeRate(pickField(row, ['strike_rate', 'sr']))}</td>
                  </tr>
                )
              })}
              {battingRows.length === 0 && (
                <tr><td colSpan={6} className="text-[var(--scorecard-text-faint)] py-2">No batting data.</td></tr>
              )}
            </tbody>
          </table>
        </div>
        {didNotBatRows.length > 0 && (
          <p className="font-rajdhani text-xs text-[var(--scorecard-text-faint)] mt-2 flex flex-wrap items-baseline gap-x-1">
            <span className="text-[var(--scorecard-text-faint)]">Did not bat:</span>
            {didNotBatRows.map((row, i) => {
              const name = pickField(row, ['player_name', 'name'])
              return (
                <span key={name}>
                  <PlayerNameLink name={name} playerId={findPlayerId(row, name, squad)} cricHeroesUrl={findCricHeroesUrl(row, name, squad)} />
                  <RoleTag member={findSquadMember(row, name, squad)} />
                  {i < didNotBatRows.length - 1 ? ',' : ''}
                </span>
              )
            })}
          </p>
        )}
      </div>

      {partnershipsSlot}

      {!partnershipsSlot && partnerships.length > 0 && (
        <div>
          <p className="font-rajdhani text-xs font-bold tracking-widest uppercase text-[var(--scorecard-text-faint)] mb-2">Partnerships</p>
          <div className="relative">
            <div className="absolute left-3.5 top-3 bottom-3 w-0.5 -translate-x-1/2 bg-[var(--scorecard-divider)]" aria-hidden />
          <div className="space-y-2">
            {partnerships.map(p => {
              // Bar length already encodes rank, same reasoning
              // BattingPositionLeaders.tsx (the leaderboard's identical
              // single-series magnitude-per-category chart) uses — no
              // separate "biggest stand" highlight needed on top of it.
              // Floored at 6% so a 0-run stand still renders a visible bar
              // (and guards divide-by-zero on the rare innings where every
              // partnership is 0 runs, e.g. a string of wickets in one over).
              const pct = topPartnershipRuns > 0 ? Math.max((p.runs / topPartnershipRuns) * 100, 6) : 6
              return (
                <div key={p.wicketNumber} className="flex items-center gap-2">
                  <span className="relative z-10 flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full border-2 border-[var(--fx-accent)] bg-[var(--scorecard-table-bg)] font-rajdhani text-xs font-bold text-[var(--fx-accent)]">{p.wicketNumber}</span>
                  <div className="flex-1 relative h-7 bg-[var(--scorecard-table-bg)] rounded overflow-hidden">
                    <div className="absolute inset-y-0 left-0 bg-gold/40 rounded" style={{ width: `${pct}%` }} />
                    <div className="absolute inset-0 flex items-center justify-start px-2.5">
                      <span className="font-rajdhani text-xs font-semibold text-[var(--scorecard-heading-text)] truncate text-left">
                        {p.players.map((player, i) => {
                          // player.playerId already comes straight from
                          // batting_stats.player_id — the authoritative,
                          // already-reconciled identity (see
                          // src/lib/partnerships.ts's own header comment).
                          // Used directly rather than routed through
                          // findPlayerId(), which would incorrectly discard
                          // an already-good id if `squad` hasn't loaded yet
                          // (a real, non-hypothetical race here: scorecard
                          // and squad detail fetch in parallel above).
                          // findCricHeroesUrl() is still used for the
                          // fallback link when there's no playerId at all.
                          // First name only, not the full name — a bar this
                          // narrow can't fit two full names plus an "(out)"
                          // tag legibly (see the truncated "Shivashankara
                          // G..." this replaced). The link target and the
                          // CricHeroes lookup below both still use the full
                          // player_name — only the visible label shortens.
                          // No separate "(out)" marker either: the next row
                          // down already carries the survivor forward, so
                          // which of this row's two names was dismissed is
                          // readable from the sequence itself. Same reason
                          // the C/VC/WK role tag shown next to a name in
                          // every other table (RoleTag, above) is
                          // deliberately left off here — two names already
                          // squeeze into this bar; a role tag on top would
                          // push it back into the same truncation problem
                          // this first-name-only change fixed.
                          return (
                            <span key={i}>
                              {i > 0 && ' & '}
                              <PlayerNameLink
                                name={firstName(player.playerName)}
                                playerId={player.playerId}
                                cricHeroesUrl={findCricHeroesUrl({ player_id: player.playerId }, player.playerName, squad)}
                              />
                            </span>
                          )
                        })}
                      </span>
                    </div>
                  </div>
                  {/* Outside the bar, not overlaid — a short bar (a quick
                      dismissal) used to squeeze this text down to nothing.
                      Fixed-width column keeps every row's runs/balls
                      right-aligned to the same edge regardless of bar
                      length. isRetirement gets its own small "ret." marker
                      — unlike a genuine dismissal, the departing player can
                      (and, if returning_player_name is set on a later row,
                      does) reappear in a different row further down, and
                      the usual "no (out) marker, the next row already
                      implies who left" reasoning breaks for exactly that
                      case: without this, the same name resurfacing with no
                      explanation reads like the duplicate-row bug this
                      feature has already had to fix twice, not a real
                      retire-and-return. See src/lib/partnerships.ts's
                      retired-hurt-and-return note. */}
                  <span className="font-rajdhani text-xs font-bold text-gold w-20 flex-shrink-0 text-right">
                    {p.runs}{p.outPlayer == null && '*'}
                    {p.isRetirement && <span className="text-[var(--scorecard-text-faint)] font-normal"> ret.</span>}
                    {' '}<span className="text-[var(--scorecard-text-faint)] font-normal">({oversToBalls(p.overTo) - oversToBalls(p.overFrom)})</span>
                  </span>
                </div>
              )
            })}
            </div>
          </div>
        </div>
      )}

      <div>
        <p className="font-rajdhani text-xs font-bold tracking-widest uppercase text-[var(--scorecard-text-faint)] mb-2">Bowling</p>
        <div className="overflow-x-auto">
          <table className="w-full table-fixed text-xs font-rajdhani">
            <colgroup>
              <col className="w-[38%]" />
              <col className="w-[11%]" />
              <col className="w-[11%]" />
              <col className="w-[11%]" />
              <col className="w-[10%]" />
              <col className="w-[19%]" />
            </colgroup>
            <thead>
              <tr className="text-[var(--scorecard-text-faint)] border-b border-[var(--scorecard-table-border)]">
                <th className="text-left py-1 pr-2">Player</th>
                <th className="text-right px-1">O</th>
                <th className="text-right px-1">Dots</th>
                <th className="text-right px-1">R</th>
                <th className="text-right px-1">W</th>
                <th className="text-right pl-1">Eco</th>
              </tr>
            </thead>
            <tbody>
              {bowlingRows.map((row, i) => {
                const name = pickField(row, ['player_name', 'name']) ?? 'Unknown'
                const wkts = num(row, ['wickets', 'wickets_taken'])
                const isTop = topBowlWkts > 0 && wkts === topBowlWkts
                // Contribution bar: share of all wickets taken by Spartans bowlers.
                const share = totalBowlWkts > 0 ? (wkts / totalBowlWkts) * 100 : 0
                return (
                  <tr key={i} className={`border-b border-[var(--scorecard-table-divider)] ${isTop ? 'text-gold font-semibold' : 'text-[var(--scorecard-text-2)]'}`}>
                    <td className="text-left py-1.5 pr-2 align-middle">
                      <div className="leading-tight">
                        <PlayerNameLink name={name} playerId={findPlayerId(row, name, squad)} cricHeroesUrl={findCricHeroesUrl(row, name, squad)} />
                        <RoleTag member={findSquadMember(row, name, squad)} />
                      </div>
                      <div
                        className="mt-1 h-1 w-full rounded-full bg-[var(--scorecard-divider)] overflow-hidden"
                        title={`${share.toFixed(0)}% of team wickets`}
                      >
                        <div className="h-full rounded-full bg-[var(--fx-accent)]" style={{ width: `${share}%`, minWidth: wkts > 0 ? 2 : 0 }} />
                      </div>
                    </td>
                    <td className="text-right px-1 align-middle tabular-nums">{pickField(row, ['overs', 'overs_bowled']) ?? '—'}</td>
                    <td className="text-right px-1 align-middle tabular-nums">{num(row, ['dots'])}</td>
                    <td className="text-right px-1 align-middle tabular-nums">{num(row, ['runs', 'runs_conceded'])}</td>
                    <td className="text-right px-1 align-middle tabular-nums">{wkts}</td>
                    <td className="text-right pl-1 align-middle tabular-nums">{formatStrikeRate(pickField(row, ['economy', 'eco']))}</td>
                  </tr>
                )
              })}
              {bowlingRows.length === 0 && (
                <tr><td colSpan={6} className="text-[var(--scorecard-text-faint)] py-2">No bowling data.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {fieldingRows.length > 0 && (
        <div>
          <p className="font-rajdhani text-xs font-bold tracking-widest uppercase text-[var(--scorecard-text-faint)] mb-2">Fielding</p>
          <div className="overflow-x-auto">
            <table className="w-full table-fixed text-xs font-rajdhani">
              <colgroup>
                <col className="w-[38%]" />
                <col className="w-[15.5%]" />
                <col className="w-[15.5%]" />
                <col className="w-[15.5%]" />
                <col className="w-[15.5%]" />
              </colgroup>
              <thead>
                <tr className="text-[var(--scorecard-text-faint)] border-b border-[var(--scorecard-table-border)]">
                  <th className="text-left py-1 pr-2">Player</th>
                  <th className="text-right px-1">Ct</th>
                  <th className="text-right px-1">St</th>
                  <th className="text-right px-1">RO</th>
                  <th className="text-right pl-1">Total</th>
                </tr>
              </thead>
              <tbody>
                {fieldingRows.map((row, i) => {
                  const name = pickField(row, ['player_name', 'name']) ?? 'Unknown'
                  const catches = num(row, ['catches']) + num(row, ['caught_behind'])
                  const stumpings = num(row, ['stumpings'])
                  const runOuts = num(row, ['run_outs'])
                  const total = fieldingTotal(row)
                  const isTop = topFieldingTotal > 0 && total === topFieldingTotal
                  return (
                    <tr key={i} className={`border-b border-[var(--scorecard-table-divider)] ${isTop ? 'text-gold font-semibold' : 'text-[var(--scorecard-text-2)]'}`}>
                      <td className="text-left py-1.5 pr-2 align-middle">
                        <PlayerNameLink name={name} playerId={findPlayerId(row, name, squad)} cricHeroesUrl={findCricHeroesUrl(row, name, squad)} />
                        <RoleTag member={findSquadMember(row, name, squad)} />
                      </td>
                      <td className="text-right px-1 align-middle tabular-nums">{catches}</td>
                      <td className="text-right px-1 align-middle tabular-nums">{stumpings}</td>
                      <td className="text-right px-1 align-middle tabular-nums">{runOuts}</td>
                      <td className="text-right pl-1 align-middle tabular-nums">{total}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}
