-- 003_batting_bowling_innings_flags.sql
-- Analytics DB (separate Supabase project — ANALYTICS_SUPABASE_URL/KEY).
-- NOT part of supabase/migrations/ (the Hub DB) — apply directly to the
-- analytics project. See analytics-db/migrations/README.md and the
-- "Repo/DB drift note" pattern in features/post-match-scorecard.md §5:
-- a file existing here is not proof it has been applied to the live
-- analytics project — cross-check with list_migrations after applying.
--
-- Purpose: a player who is in a match's team_list can still have zero
-- batting or bowling "innings" for that match — they were in the squad but
-- never got a knock, or were never given the ball. batting_stats and
-- bowling_stats already carry a row for every squad member regardless
-- (spartans-python writes a zero-filled placeholder row rather than
-- omitting the player), so "did they actually get an innings" previously
-- had to be inferred: batting_stats.dismissal_method = 'did_not_bat' (a
-- real sentinel, but overloading a column that's meant to describe how a
-- batter got out) or bowling_stats.overs = 0 (no sentinel at all — pure
-- heuristic, confirmed lossy: one existing row has overs = 0 with other
-- bowling fields non-zero).
--
-- batted / did_bowl replace those inferences with explicit ground truth,
-- written at parse time by spartans-python's BattingStatsWriter /
-- BowlingStatsWriter (both already branch on "does this player have a
-- real stat line" at the row-write point — see utils/csv_writers.py).
-- Named did_bowl, not bowled — bowling_stats already has an integer
-- `bowled` column (the bowled-dismissal count).
--
-- Backfilled from the exact same heuristics these columns replace, so
-- historical rows are unchanged in effective behaviour — this is a
-- forward-looking correctness/robustness improvement, not a data fix.
-- Consumed by src/lib/playerStats.ts to compute battingInnings/
-- bowlingInnings distinct from matches (team_list count) — see
-- features/player-availability.md-adjacent player stats page.

ALTER TABLE batting_stats ADD COLUMN IF NOT EXISTS batted   boolean NOT NULL DEFAULT true;
ALTER TABLE bowling_stats ADD COLUMN IF NOT EXISTS did_bowl boolean NOT NULL DEFAULT true;

UPDATE batting_stats SET batted   = false WHERE dismissal_method = 'did_not_bat';
UPDATE bowling_stats SET did_bowl = false WHERE overs = 0;

COMMENT ON COLUMN batting_stats.batted IS
  'True if the player actually had a batting innings this match. False for zero-filled placeholder rows written for squad members who did not bat. Backfilled from dismissal_method = ''did_not_bat''; written explicitly going forward by spartans-python''s BattingStatsWriter.';
COMMENT ON COLUMN bowling_stats.did_bowl IS
  'True if the player actually bowled this match. False for zero-filled placeholder rows written for squad members who never bowled. Backfilled from overs = 0; written explicitly going forward by spartans-python''s BowlingStatsWriter. Not named "bowled" — that column already holds the bowled-dismissal count.';
