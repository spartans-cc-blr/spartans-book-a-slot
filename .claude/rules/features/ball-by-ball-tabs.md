# Match Tabs: Batting / Bowling / Fielding / Commentary — Feature Summary

**Spartans Hub · Added: October 2026**

---

## 1. Overview

When ball-by-ball commentary has been uploaded for a match (see
`commentary-upload.md`), the scorecard area of a match gains underline tabs:

**Full Scorecard · Insights · Batting · Bowling · Fielding · Commentary**

Full Scorecard is the existing `ScorecardTables`, unchanged. The other five are
built from `ball_by_ball` in the analytics DB. A match with **no** commentary
renders the plain scorecard exactly as before, with no tab bar.

The tabs appear in both places the scorecard is shown:

- the collapsible **SCORECARD** panel on each card in `/matches/history` (retained;
  the tabs sit inside it, so nothing is fetched until the panel is opened);
- the single-match page `/matches/history/[bookingId]`.

Visible to every signed-in, non-expelled member, the same audience as the
scorecard itself.

---

## 2. Where things live

| Piece | Location |
|---|---|
| Tab shell (fetches lazily, hides itself when there is no data) | `src/components/matches/MatchTabs.tsx` |
| Partnerships view (replaces the FoW bars when commentary exists) | `src/components/matches/BallPartnerships.tsx` |
| The four views | `src/components/matches/BallByBallViews.tsx` |
| Pure aggregation, unit-tested | `src/lib/ballByBall.ts`, `ballByBall.test.ts` |
| Data route | `GET /api/matches/history/[bookingId]/commentary` |
| Source | analytics DB view `ball_by_ball_linked` (in `spartans-python`, `scripts/011_ball_by_ball_player_links.sql`) |

`MatchTabs` calls the route once on mount. `{ available: false }` (no match id, no
upload, no analytics client, or a failed read) leaves the plain scorecard. A failed
analytics read is logged and treated as "not available", never an error page.

---

## 3. What each tab shows

"Spartans batting" is the innings where Spartans bat (`batting_side = 'spartans'`);
"Spartans bowling" is the opposition innings (`'opponent'`).

- **Batting**: over-by-over runs as plain bars (the ball-by-ball detail of an over is on the Commentary tab) with one red dot per wicket that fell in that over, so a two-wicket over shows two dots; every column reserves room for the busiest over so the bars share a baseline), runs/wickets/run-rate/dot% by
  phase, a batters table (R, B, SR, 4s, 6s, how out), and dot% and runs (balls) by phase.
- **Bowling**: a runs-and-wickets-by-over chart with a bowler selector (see "Bowling tab: runs and wickets by over" below) and the phase split for the opposition innings, a bowlers table
  (O, M, R, W, Econ, Dot%), boundaries and extras conceded, and each bowler's spell in
  each phase (overs-runs-wickets).
- **Fielding**: catches, caught-behind, stumpings and run-outs per Spartans fielder, plus
  every wicket (over, batter, how out, score).
- **Full Scorecard → Partnerships**: when the match has Spartans-batting commentary, the
  Fall-of-Wickets partnership bars are replaced by `BallPartnerships` (derived by
  `derivePartnerships()` from the balls alone): per stand, both batters' runs (balls), the
  stand total with balls (extras included, `*` = unbroken), and a bar growing out from the
  centre for each batter (red left, teal right) scaled to the biggest single contribution.
  Each stand is a tap target (`aria-expanded`, closed by default) that opens to show the score and overs where it started and ended; nothing else shows them. A batter keeps
  the side he first appeared on for the whole innings (openers left/right in order of
  appearance); a new batter takes the side the dismissed one vacated. A partner who never faced a ball is named from
  the scorecard's batting order (`restOfOrder`). Matches without Spartans-batting commentary
  keep the original bars untouched (`ScorecardTables` `partnershipsSlot` prop).
- **Commentary**: a dropdown under the tab picks **Spartans batting** or **Spartans
  bowling**, then each over newest-first as a card laid out like CricHeroes' Overs tab (October 2026): a left
  column with "Ov N" and the score after the over (`131-11`), the middle with bowler to batters and a
  pastel tile per delivery (dot `•` grey, runs grey, 4 amber, 6 teal, WD/NB rose, W red; light/dark
  pairs via Tailwind `dark:` classes), and a right panel with the over's runs (plus wickets if any). The cards use the system sans font (not condensed Rajdhani), full-contrast bowler/batter names, a white card in light mode, slightly darker tile tints so dots and singles stay visible, and a rounded inset runs panel, for legibility closer to CricHeroes, and the dismissal line under any over with a wicket. On **Spartans batting** each over also lists what every batter scored in it, `Name runs (balls)` in the order they faced (wides not counted as balls faced); the bowling innings doesn't show this.

### Definitions (checked against the stored CricHeroes scorecard)

For match 26452955 these reproduced the scorecard exactly: all 6 bowlers (runs, wickets,
dots, 4s, 6s, wides) and all 7 batters (runs, balls, 4s, 6s).

- Balls faced: every delivery except a wide (a no-ball counts).
- Bowler runs: bat runs + wides + no-balls; byes and leg-byes are not charged.
- Bowler dot: a legal ball with nothing charged to the bowler, so a bye or leg-bye is a dot (verified
  on Trumphate v Spartans, 1 Aug 2026, which has one of each; the scorecard counts them that way).
  The Batting tab's dot% counts legal balls with nothing off the bat. Maiden: a completed over with nothing charged.
- Bowler wickets exclude run-outs, retirements, obstructing, handled-ball and timed-out.
- Phases follow the club's per-format definition (`PHASE_PLANS` in `ballByBall.ts`; overs are
  1-based and inclusive): **T20** powerplay 1–6, middle 7–15, death 16–20; **T30** powerplay
  1–8, middle 9–23, death 24–30. Total overs come from the booking's format. Any other length
  (T10, T25, ...) has no club definition, so it is scaled from the T20 proportions (powerplay 6/20,
  death 5/20) and the phase table says so. To change a format's phases, edit `PHASE_PLANS`.
- A stumping carries no separate fielder field, so the fielder is read from the dismissal
  line ("st †Name b Bowler") when the field is empty. Run-outs recorded "A / B" credit both.

---

## 4. Player links

The route reads `ball_by_ball_linked`, whose `*_player_id` columns resolve Spartans
players through each match's `team_list` (so the existing player reconciliation, aliases
and per-match overrides flow through). Spartans players link to `/players/[id]/stats`
via `PlayerNameLink`; opponents are display-only. Players are keyed by name within an
innings and the id is taken from whichever row carries it.

---

## 5. Security and limits

- Route: signed-in and not expelled, same gate as `/api/matches/history/[bookingId]/scorecard`.
  Reads the analytics DB with the service key server-side only; no new env vars.
- ~250 rows (~50KB) per match, one request, and only when the panel is opened. No new
  dependencies; charts are plain CSS (Hobby cost, `limitations.md` H-6).
- Tables are laid out to fit a phone without sideways scrolling; the tab bar scrolls
  horizontally on very narrow screens.

---

## 6. Known gaps

- Batter-vs-bowler matchups and season-wide ball-by-ball stats are deliberately not built
  until more matches have commentary.
- A fielder recorded as "A / B" (assisted run-out) is not linked to a profile.
- Matches uploaded before the parser filled in stumping fielders rely on the text fallback
  above (fine for display; the keeper's Hub link comes from their other rows).


## 7. SQL-side state

A per-delivery `match_state` view, `ball_by_ball_validation` and `match_coverage` now exist in the analytics DB — see `cricket-intelligence-foundation.md`. Phase boundaries are duplicated in `phase_definitions`; change `PHASE_PLANS` and that table together.


## Partnership partner order and glued dismissal lines (October 2026)

A partner who has not yet faced a ball is now chosen by the **scorecard batting order** (`restOfOrder`), with first appearance in the commentary only as a tie-break; before, an opener who first faced after wicket 1 was replaced by whoever faced next (a match showed one batter as everyone's partner). The microservice also now drops ball text glued in front of a dismissal line ("X to Y, OUT LBW Z lbw b X"), which had made the wrong batter leave the crease.


## Glued `dismissed_batter` repair (October 2026)

A comparison of ball-by-ball against `fall_of_wickets` / `opponent_fall_of_wickets` (20 matches with both) found scores and wicket counts agree everywhere except one run-out (match `11985431`, FOW 109 vs ball-by-ball 108), plus a parser artifact: for some run-outs and hit-wickets the commentary parser stores the whole ball line in `ball_by_ball.dismissed_batter` (e.g. `Abhishek Yadav to Santosh, 1 run, OUT Run out ... Muthukumar R` in match `19946624`, a hit-wicket line in `7635509`). Left alone, that creates a phantom batter row on the Batting tab and makes `derivePartnerships()` blame the striker.

`repairDismissedBatters()` (`src/lib/ballByBall.ts`, unit-tested) is the Hub-side guard: a value that looks like a commentary line is replaced by the known batter of that innings named latest in it (longest wins a tie, word-boundary match), else the striker on the ball; `dismissed_player_id` is taken from that batter. Plain names, and arrays with nothing to repair, are returned untouched. It runs in the commentary route and in `getPlanningContext()`. Limit: a non-striker run out who never faced a ball isn't a known batter, so the striker is used. The proper fix is in the parser (`spartans-python`), not yet made.


## Scorecard vs commentary spelling of a batter (October 2026)

Match `7948742` showed a phantom "Manoj B 0 (0)" as every stand's partner: the scorecard had the opener as `Manoj B` (unreconciled, `player_id` NULL) while the commentary named him `Manoj Balaji`. `derivePartnerships()` matched names exactly, treated them as two people, and `fillPartner()` kept seating the never-facing `Manoj B` (rank 0 in `restOfOrder`).

Fix: `sameBatter()` (first name equal, one surname a prefix of the other, so an initial matches) folds a `restOfOrder` name into a commentary name when **exactly one** commentary name fits; ambiguous cases are left alone. Unit-tested in `ballByBall.test.ts`. Data: a per-match `match_name_overrides` row for `7948742:Manoj B` → Manoj Balaji and `player_id` backfilled in the analytics stat tables and `match_stats_cache`. A per-match override, not a global alias, because "Manoj B" is also Manoj Borse in other matches (e.g. `22868515`).


## Insights tab: run-rate worm and required-rate line (October 2026)

A new **Insights** tab (second, after Full Scorecard) draws a run-rate worm: cumulative runs by over for each innings as inline SVG (no chart library), wickets as open circles on the line, and the powerplay and death overs shaded (`phaseBounds()`). Spartans are teal, the opposition red.

- **Required rate:** a constant dashed line from (0, 0) to (total overs, target), labelled "Target N". Target is the first innings total + 1 (the scorecard total when the page has it, else the sum of the commentary), and the legend gives the required rate (target / total overs). Above the dashed line, the chasing side is ahead of the rate needed from ball one. It is not the changing required rate during the chase.
- **Batting order** comes from the toss (`deriveBattedFirst()`), passed to `MatchTabs` as `battedFirst` by both callers (`MatchHistoryClient.tsx` and `/matches/history/[bookingId]`). With no toss data both worms still draw but there is no target line, and the tab says so.
- **One innings uploaded:** that worm draws alone; if only the chase is missing the target line still shows.
- Maths is pure in `src/lib/matchInsights.ts` (`wormPoints()`, `buildWorm()`, `requiredLineAt()`, unit-tested in `matchInsights.test.ts`). The chart is `src/components/matches/MatchInsights.tsx`. No new route, table or migration; the tab only exists when commentary exists, like the others.
- **Wicket hover (October 2026):** each wicket circle shows who and how on hover (native `<title>` tooltip), and on keyboard focus or tap a readout line under the chart gives `W3 Siva c Rohit b Kumar · 45/3 at 7.2 ov`. Wicket details (`WicketNote`: batter, how out via `howOut()`, score, ball via `ballLabel()`) come from `wormPoints()`. Several wickets in one over stack above the point.
- **Current vs required rate (October 2026):** for the chase, a second chart plots current run rate (runs / overs) against the changing required rate, `(target − scored) / (total overs − over)`, starting at target / total overs. The line stops when the target is reached; at the last over the required rate is undefined and left out. The y-axis is capped at 32 (a multiple of 4, so gridlines are whole numbers) and the line clipped there.
- **Chase by over:** a collapsed table (`<details>`) under the rate chart: runs in the over, score/wickets, runs still needed, required and current rate. Series come from `chaseSeries()` in `matchInsights.ts`.
- **Hover or tap any over (October 2026):** on both charts, moving the pointer across the plot (or tapping and dragging on a phone) picks the nearest whole over, draws a guide line and dots, and fills a readout below. The worm shows each innings' score after that over and how many it scored off it, plus **who batted** (Spartans batting: each batter's runs and balls in that over) or **who bowled** (Spartans bowling; more than one name if the over was shared). Spartans players link to their stats. The rate chart shows current rate, required rate, runs needed and overs left, wickets, and the same who-batted/who-bowled for the chase. The readout stays after the pointer leaves, so the player links can be tapped. Per-over data comes from `wormPoints()` (`batters`, `bowlers`, `runsInOver`, `wicketsAfter`).
- **Where the two rates meet:** `rateCrossings()` interpolates where current and required rate cross between overs. The point is marked on the rate chart (hover or tap it to jump to the nearest over) and listed under it, e.g. "Lines meet at about over 6.3 (10.4 an over): current rate fell below the required rate". A chase can cross more than once.
- Both charts appear only when the chasing innings has commentary and the batting order is known from the toss.
- More Insights (momentum, win probability, etc.) can go on this tab later.


## Bowling tab: runs and wickets by over (October 2026)

The Bowling tab's plain over-by-over bars were replaced by `BowlingOverChart` (`src/components/matches/BowlingOverChart.tsx`), inline SVG like the Insights charts.

- **Bars and dots:** one slot per over across the whole innings (`totalOvers`, or longer if it ran on). Bars are runs conceded, dark dots above them are wickets. Overs the selected bowler did not bowl show a faint tick, so the innings length stays visible.
- **Bowler selector:** a dropdown of every Spartans bowler (with his spell, e.g. `4.0-32-2`) plus **Entire innings (all bowlers)**. The signed-in player is pre-selected, marked "(you)", when `bowler_player_id` matches their `playerId` (from `useSession()`); otherwise the entire innings shows. Picking another option sticks for that view.
- **What counts (`bowlingOverSeries()`):** for one bowler, runs charged to him (bat runs, wides, no-balls, the same as the Bowlers table, not byes) and wickets credited to him (not run-outs). For the entire innings, every run (byes included) and every wicket, so it adds up to the innings score. Names match loosely on case and spaces.
- **CRR and RRR (`overContexts()`):** two lines on the same axis (both are runs per over). They are the batting side's rates **going into each over**, the position the bowler faced when he took the ball, so a bar under the RRR line means he kept them below the rate they needed. This differs from the Insights rate chart, which uses the rate after each over. Over 1 has no CRR yet.
  - **Spartans defending** (batted first, from the toss): CRR and RRR, target = Spartans total + 1 (scorecard total, else the commentary sum). The RRR line stops once the target would have been passed, and is clipped at the axis cap (32).
  - **Spartans bowled first**, or batting order unknown: CRR only, with a note saying why.
- **Hover or tap and drag any over:** highlights the over and shows who bowled it, the selected bowler's runs, wickets and economy (or "did not bowl this over"), and the batting side's score, CRR, RRR, runs needed and overs left going in, with "under / over the required rate" for his economy. Spartans bowlers link to their stats.
- `BowlingView` gets `battedFirst`, `spartansTotal` and `opponentName` from `MatchTabs`. No new route, table or migration.
