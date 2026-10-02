# Opponent Scouting — `/captains-corner/opponent-scouting`

**Spartans Hub · Added: October 2026**

---

## 1. Overview

A pre-match page for captains. Pick an upcoming game and it shows what
happened every time we met that opponent, and how each player who has
marked **Y / O / E** for the game did against them.

Built on ball-by-ball commentary (`commentary-upload.md`, `ball-by-ball-tabs.md`),
so only past meetings that have commentary uploaded can be broken down.
Meetings without it still count in the "met N times, won/lost" line.

**Access:** `isCaptain || isGC || isAdmin` (hard redirect otherwise, same gate
as `/captains-corner`). Read-only, no write path, no migration.

**Nav:** 🔍 Opponent Scouting in **Captains' Corner ▾** (desktop) and the
Captains' Corner section of the mobile More sheet (`activePage="captains-scouting"`).

---

## 2. What it shows

- **Header** — the opponent, date/slot/format/tournament, record, and how many
  meetings have ball-by-ball data. A pill row switches between the next 15
  upcoming confirmed games that have an opponent set (`?booking=<id>`,
  defaults to the soonest).
- **What stood out** — rule-based pointers (§4).
- **Every meeting** — date (links to the match), result, scores, our top
  scorer and theirs.
- **Phase tables** — our batting and our bowling by Powerplay / Middle / Death,
  summed over all meetings (runs, balls, RPO, wickets, dot %). Phases use the
  club's per-format definition (`PHASE_PLANS` in `ballByBall.ts`).
- **Their batters to watch** — top 5 by runs across meetings, with innings,
  strike rate and times out.
- **How wickets fell** — wickets lost/taken by type, and which of their
  bowlers took our wickets.
- **Available players** — one card per Y/O/E player with history against them:
  batting (innings, runs, SR, average, positions used with runs at each, runs by
  phase, an innings log with how out) and bowling (overs, runs, wickets, economy,
  by phase), plus pointers. Players with no ball-by-ball history against the
  opponent are listed by name.

---

## 3. Data

`src/lib/opponentScoutingData.ts` (server-only) `getScoutingContext()`:

1. Upcoming confirmed bookings with an `opponent_name` (picker + selection).
2. History: `getTeamMatches()` filtered to the same opponent, matched by master
   `opponent_id` **or** normalised spelling (the same rule as the Captains'
   Corner → Team Record link), practice games excluded.
3. Ball rows for those `match_id`s from the analytics view
   `ball_by_ball_linked`, paged with `fetchAllRows()` (PostgREST caps a
   response at 1000 rows, and several matches exceed that).
4. `availability` rows with `response IN ('Y','O','E')` for the booking,
   expelled players dropped.

`src/lib/opponentScouting.ts` (pure, client-safe, `opponentScouting.test.ts`)
does the aggregation by reusing `phaseSplit()`, `summariseBatters()` and
`summariseBowlers()` from `ballByBall.ts`.

**Batting position** is the batter's order of first appearance at the crease in
that innings (ball-by-ball has no separate position column), so a batter who
walks in at the same time as an opener's retirement may differ from the
scorecard number. **Player identity** uses the view's `*_player_id` columns,
which are resolved only for Spartans players; opponents are matched by name.

---

## 4. Pointers are rules, not opinion

Every line quotes the numbers it came from, and thresholds are constants in
`opponentScouting.ts`:

| Pointer | Fires when |
|---|---|
| Slowest batting phase | Phase has ≥30 balls and runs ≥1 an over below our overall rate |
| Wickets clustered | ≥6 wickets lost and ≥45% in one phase |
| Dot balls | ≥120 balls and ≥45% dots |
| Leakiest bowling phase | Phase has ≥30 balls and ≥1 an over above our overall economy |
| Where we hurt them | ≥6 wickets taken and ≥45% in one phase |
| Repeated dismissal type | ≥6 dismissals and ≥50% the same type |
| Their bowler | Took ≥3 of our wickets across meetings |
| Their key batter | ≥40 runs across meetings |
| Player: phase spread | Both phases ≥10 balls and SRs ≥30 apart |
| Player: nemesis | Dismissed by the same bowler ≥2 times |
| Player: small sample | <20 balls batting / <24 balls bowling |

One meeting only gets an explicit "treat these as hints" line. The page says the
pointers are rule-based. If a captain wants softer language or different
thresholds, change the constants and the table above.

---

## 5. Security

| Check | Status |
|---|---|
| Page gate `isCaptain \|\| isGC \|\| isAdmin` server-side before any data fetch | ✅ |
| Read-only; no new API route, table or migration | ✅ |
| Analytics DB read server-side only (`ANALYTICS_SUPABASE_KEY`) | ✅ |
| Only match stats and availability responses already visible to captains in Captains' Corner; no wallet or contact data | ✅ |

---

## 6. File map

| File | Role |
|---|---|
| `src/app/captains-corner/opponent-scouting/page.tsx` | The page |
| `src/lib/opponentScoutingData.ts` | Server fetch (§3) |
| `src/lib/opponentScouting.ts` (+ `.test.ts`) | Pure aggregation and pointers |
| `src/components/ui/SiteNav.tsx`, `src/components/ui/MobileTabBar.tsx` | Nav entries, `captains-scouting` added to the highlight list |

## 7. Not built (ideas)

- Batter-vs-bowler matchups (which of their bowlers troubled which of our batters). The data supports it.
- Bowling-vs-their-batting-hand, and where opponents score (shot/direction).
- Suggested batting order / bowling plan from the above.
- Fielding and extras conceded per meeting.
- Falling back to scorecard-level stats for meetings with no commentary.

---

*Maintained by: Spartans CC BLR*
