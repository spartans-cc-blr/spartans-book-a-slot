# Cricket Intelligence Foundation — match context, validation & match state

**Spartans Hub · Added: October 2026 · Status: foundation layer + `player_match_context` built; commentary-needed panel live on `/wrangler/commentary`; no AI**

---

## 1. Why

A build roadmap (Supabase → contextual analytics → ontology → Captain AI) needs a trustworthy
base before any UI or AI. A coverage audit on 3 Oct 2026 showed where the real gap is:

| Finding | Number |
|---|---|
| Matches in the analytics DB | 314 (112 in 2026) |
| Matches with ball-by-ball | **7** (14 innings) |
| Innings that reconcile to the scorecard (runs and wickets) | **14 of 14** |

Data quality is fine; **volume is the gap**. Contextual stats by situation need far more
matches, so wrangler commentary uploads (`commentary-upload.md`) are the bottleneck, not
modelling. The layers below make that visible and give later work one place to build on.

## 2. What was added (analytics DB, migration `015_cricket_intelligence_foundation.sql`)

| Object | Purpose |
|---|---|
| `match_dimensions` | Hub context per match: format, `total_overs`, stage, practice flag, tournament, ground, opponent, booking. Mirrored here so SQL needs no cross-project join. The Hub DB stays the source of truth. |
| `phase_definitions` | Phase boundaries as data (`T20`: 1–6 / 7–15 / 16–20, `T30`: 1–8 / 9–23 / 24–30). **Mirrors `PHASE_PLANS` in `src/lib/ballByBall.ts`: change both together.** |
| `ball_by_ball_validation` (view) | Per match + innings: ball-by-ball runs/wickets vs scorecard, status `reconciled` / `mismatch` / `no_scorecard`, upload warning count. |
| `match_coverage` (view) | Every match with `bbb_status` (`none` / `partial` / `complete` / `mismatch`), `hub_linked`, format. The "what still needs a commentary upload" list. |
| `match_state` (view) | One row per delivery: state **after** that ball. Score, wickets, legal balls bowled/remaining, wickets remaining, run rate, target, runs required, required rate, phase. Derived from `ball_by_ball`, never stored. |

Conventions in `match_state`: overs are 1-based; legal balls drive balls remaining; wickets
remaining assumes 10; target and required rate exist only for innings 2 and use the scorecard
total of the side that batted first (so they work even if innings 1 commentary is missing);
`phase`/`total_overs` are NULL when a match has no `match_dimensions` row or its length has no
`phase_definitions` row (anything but T20/T30). All views are `security_invoker` and revoked
from anon/authenticated; both tables have RLS on with no policies.

## 3. Keeping `match_dimensions` current

`syncMatchStatsForBooking()` (`src/lib/matchStatsSync.ts`) upserts the row on every manual or
automated sync, best-effort (an error is logged, never fails the sync). `total_overs` comes from
the booking format (`T20` → 20), `is_practice` ORs the booking and tournament flags, and ground
falls back to the tournament's. The 7 matches that already had ball-by-ball were backfilled once
by SQL (all T20; 26452955 is a knockout). Other matches get a row the next time they sync, and
until then `match_coverage.hub_linked` is false for them.

## 4. Applying the migration

Apply `015_cricket_intelligence_foundation.sql` to the analytics project. It was applied live on
3 Oct 2026 in pieces (tables, then each view) because a single large migration call timed out.
The file is the source of truth and is safe to re-run (`CREATE ... IF NOT EXISTS`, `DROP VIEW IF
EXISTS`); a re-run of the views needs `DROP VIEW` first if their column lists change.

## 5. `player_match_context` (migration `016_player_match_context.sql`)

One row per batter per innings with ball-by-ball: the innings state at **entry** (before the
first ball faced) and **exit**, plus runs, balls, fours, sixes, strike rate, how out, and
`team_runs_while_in` / `team_wickets_while_in`. Built on `match_state` and `ball_by_ball_linked`,
so `player_id` is filled for Spartans batters. Entry/exit have phase, required rate (innings 2)
and balls; `position_by_appearance` is order of first ball faced, not the scorecard number.

Definitions and known limits:
- **Entry is the first ball faced, not the walk-in.** A batter who comes in at a wicket but
  faces a few balls later shows the later score (e.g. wicket at 32/3, next batter's entry 37/3).
  Non-strikers who never face a ball do not appear.
- **Exit** is the dismissal delivery (matched on `dismissed_batter`), else the end of the innings.
- **Boundaries** count only outcomes the commentary marks FOUR/SIX; a ball run for 4 is not one.
- **Bye guard:** the commentary parser can record "(no ball) bye, 4 runs" as 4 bat runs; the view
  counts any outcome mentioning a bye as 0 bat runs. The parser itself (spartans-python) should be
  fixed so `ball_by_ball.runs_bat` is right at source; the innings totals are unaffected.
- Required rate near the last ball is huge (e.g. 129.00 with 1 ball left); consumers should cap
  or ignore it.

**Verified** against `batting_stats` for every Spartans batter with ball-by-ball (54 of 54): runs,
balls faced, fours, sixes and out/not-out all match. Opponent rows have names only (no ids).

## 6. "Commentary needed" panel

`/wrangler/commentary` now reads `match_coverage` (best-effort; if unreadable the page works as
before without status). A collapsible panel lists matches that are not complete (none / one
innings / needs re-upload) with a CricHeroes link from the booking and an Upload button that
selects the match in the form; the dropdown marks complete matches with a tick. Logic:
`matchesNeedingCommentary()` in `src/lib/commentary.ts` (unit-tested).

## 7. Not built yet (next steps from the roadmap)

- Situation definitions and `player_situation_stats`, with minimum-sample rules. With 7 matches
  these will mostly be below threshold; start with phase and wickets-down bands.
- Opponent player identity (opponents are names only), and an automatic `match_dimensions`
  refresh when an opponent is linked later.
- No live-match data exists: ball-by-ball arrives post-match from uploaded PDFs, so live captain
  context is out of reach until a live source exists.

## 8. Security

Read-only analytics objects in the analytics DB, service-role access only (same blanket-deny
posture as the other analytics tables). No new API route, no client-reachable input. The Hub
write uses the existing server-side analytics client.

## 9. File map

| File | Role |
|---|---|
| `analytics-db/migrations/015_cricket_intelligence_foundation.sql` | Tables and views above |
| `analytics-db/migrations/016_player_match_context.sql` | `player_match_context` view |
| `src/app/wrangler/commentary/page.tsx`, `src/components/wrangler/CommentaryClient.tsx` | Coverage read and the "Commentary needed" panel |
| `src/lib/commentary.ts` (+ `.test.ts`) | `BbbStatus`, `matchesNeedingCommentary()` |
| `src/lib/matchStatsSync.ts` | Upserts `match_dimensions` on every sync |
| `src/lib/ballByBall.ts` | `PHASE_PLANS` (TS copy of `phase_definitions`) |

---

*Maintained by: Spartans CC BLR*
