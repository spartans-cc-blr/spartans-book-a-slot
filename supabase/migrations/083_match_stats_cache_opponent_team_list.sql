-- Migration: 083_match_stats_cache_opponent_team_list
-- Adds match_stats_cache.opponent_team_list — the Hub-side cached copy of
-- the analytics DB's new opponent_team_list table (see
-- analytics-db/migrations/011_opponent_team_list.sql and
-- .claude/rules/features/scorecard-raw-data-capture.md §6). Same
-- jsonb-array-per-analytics-table pattern 044_match_stats_cache.sql /
-- 071_match_stats_cache_fall_of_wickets.sql / 081_match_stats_cache_opponent_fall_of_wickets.sql
-- already established — one more column, not a new table.
--
-- Raw facts only — batting hand (RHB/LHB) for every opponent player in
-- the Playing XI, not just the ones dismissed (opponent_fall_of_wickets
-- only ever has a row per wicket). No derivation, no UI reads this yet.
--
-- Additive, nullable, no backfill: existing rows simply have NULL here
-- until that booking is next re-synced (same "code merged ≠ history
-- re-run" posture as every other column added to this table).

ALTER TABLE match_stats_cache
  ADD COLUMN IF NOT EXISTS opponent_team_list jsonb;

COMMENT ON COLUMN match_stats_cache.opponent_team_list IS
  'Cached copy of the analytics DB''s opponent_team_list rows for this match_id — one row per opponent player in the full Playing XI, each carrying batting_style ("RHB"/"LHB") read directly off the scorecard name annotation, independent of Fall of Wickets. NULL for a booking not yet re-synced since this column was added, or a match with no data. Raw facts only — no UI reads this column yet.';
