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

- **Batting**: over-by-over runs, each bar stacked ball by ball (a block per scoring ball, first ball at the bottom, amber four / green six / rose extra / gold other runs, hover for the ball; dot balls have no height) with one red dot per wicket that fell in that over, so a two-wicket over shows two dots; every column reserves room for the busiest over so the bars share a baseline), runs/wickets/run-rate/dot% by
  phase, a batters table (R, B, SR, 4s, 6s, how out), and dot% and runs (balls) by phase.
- **Bowling**: the same bars and phase split for the opposition innings, a bowlers table
  (O, M, R, W, Econ, Dot%), boundaries and extras conceded, and each bowler's spell in
  each phase (overs-runs-wickets).
- **Fielding**: catches, caught-behind, stumpings and run-outs per Spartans fielder, plus
  every wicket (over, batter, how out, score).
- **Commentary**: a dropdown under the tab picks **Spartans batting** or **Spartans
  bowling**, then each over newest-first (like CricHeroes): bowler to batters, runs and
  wickets, the score after the over, a coloured chip per delivery (dot grey, 4 amber,
  6 green, wide/no-ball rose, wicket red), and the dismissal line under any over with a wicket.

### Definitions (checked against the stored CricHeroes scorecard)

For match 26452955 these reproduced the scorecard exactly: all 6 bowlers (runs, wickets,
dots, 4s, 6s, wides) and all 7 batters (runs, balls, 4s, 6s).

- Balls faced: every delivery except a wide (a no-ball counts).
- Bowler runs: bat runs + wides + no-balls; byes and leg-byes are not charged.
- Bowler dot: a legal ball with no runs at all. Maiden: a completed over with nothing charged.
- Bowler wickets exclude run-outs, retirements, obstructing, handled-ball and timed-out.
- Phases: powerplay is the first 30% of the innings capped at 6 overs (T20/T25/T30: 1–6,
  T10: 1–3); death is the last 4 overs (the last 2 in a short game). Total overs come from
  the booking's format.
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
