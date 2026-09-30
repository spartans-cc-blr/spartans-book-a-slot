# Player Match Performance View (analytics DB)

**Spartans Hub · Added: September 2026 · Status: applied to the analytics DB (2026-09-30)**

---

## 1. Overview

`player_match_performance` is a Postgres view in the **analytics DB** — one row per
`(match_id, player_id)` for every reconciled Spartans player in a match's Playing XI
(`team_list`). It flattens match context, participation, batting, bowling and fielding
facts, plus derived rates (boundary %, team run share, dot-ball %, bowling average and
strike rate, wickets per over, win/loss margin). Migration:
`analytics-db/migrations/013_player_match_performance_view.sql`.

## 2. Why the analytics DB

The stat tables, toss and result all live there, and its `player_id` is the live
reconciled identity (Hub's `match_stats_cache` copies go stale — see
`post-match-scorecard.md` §15). The two projects can't be joined, so Hub-only fields
are deliberately left out (§4).

## 3. Design decisions

- **Spine is `team_list`**, deduped. Every batter appears in it. `fielding_stats` only
  holds players with dismissals, so it can't define "played".
- **Alias duplicates are collapsed.** Ten `(match_id, player_id)` pairs carry two rows
  per stat table (two scorecard spellings). Batting/bowling keep the row with real
  participation; fielding is summed.
- **`security_invoker = true`** and `REVOKE` from anon/authenticated, so the view
  honours the base tables' blanket-deny RLS instead of running as owner.
- **Margin** is derived from toss + totals (same logic as `computeMatchMargin()`),
  `margin_type` is `runs`/`wickets`, NULL for NR or missing toss.
- `fielded_dismissal` is "had a catch/stumping/run out", not "took the field".

## 4. Not in the view (Hub-only)

`format` (T20/T30), `opponent_id`, canonical ground, tournament, `is_practice`,
`stage_type`. `match_stats.match_type` is the **stage** (League/Final/…), exposed as
`stage`, not the format. Join on `match_id` in the app, or add a `match_dimensions`
mirror written by `syncMatchStatsForBooking()` (would need a refresh hook when an
opponent is linked later).

## 5. Verified against live data (read-only, rolled back)

3,706 rows, all unique per `(match_id, player_id)`; 2,656 batting rows equals the raw
`batted` count (dedupe lost nobody); no bowling row with a bad ball count; no innings
with runs above the team total. 24 rows (2 matches) have NULL `match_date` and no toss
data, so their margin is NULL.

## 6. Pending

- ~~Apply the migration~~ Done (2026-09-30, project `bpkaapmbgbwxsmjkfjii`).
- Decided: format, `opponent_id`, venue and practice flag come from the Hub DB, joined in app code on `match_id` (no mirror table).
- Unreconciled names (`player_id IS NULL`) and pre-Hub matches carry no Hub identity.

---

*Maintained by: Spartans CC BLR*
