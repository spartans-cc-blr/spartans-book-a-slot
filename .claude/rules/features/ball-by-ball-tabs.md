# Match Tabs: Batting / Bowling / Fielding / Commentary — Feature Summary

**Spartans Hub · Added: October 2026**

---

## 1. Overview

When ball-by-ball commentary has been uploaded for a match (see
`commentary-upload.md`), the scorecard area of a match gains underline tabs:

**Full Scorecard · Batting · Bowling · Fielding · Commentary**

Full Scorecard is the existing `ScorecardTables`, unchanged. The other four are
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
- **Bowling**: the same bars and phase split for the opposition innings, a bowlers table
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
  bowling**, then each over newest-first (like CricHeroes): bowler to batters, runs and
  wickets, the score after the over, a coloured chip per delivery (dot grey, 4 amber,
  6 green, wide/no-ball rose, wicket red), and the dismissal line under any over with a wicket. On **Spartans batting** each over also lists what every batter scored in it, `Name runs (balls)` in the order they faced (wides not counted as balls faced); the bowling innings doesn't show this.

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
