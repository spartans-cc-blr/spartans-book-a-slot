-- Migration: 081_match_stats_cache_opponent_fall_of_wickets
-- Adds match_stats_cache.opponent_fall_of_wickets — the Hub-side cached
-- copy of the analytics DB's new opponent_fall_of_wickets table (see
-- analytics-db/migrations/007_opponent_fall_of_wickets.sql and
-- features/partnerships.md §11). Same jsonb-array-per-analytics-table
-- pattern 044_match_stats_cache.sql / 071_match_stats_cache_fall_of_wickets.sql
-- already established — one more column, not a new table.
--
-- Raw facts only, same as fall_of_wickets — no "which bowler broke which
-- partnership" derivation is computed or stored here, and there is
-- deliberately no UI reading this column yet.
--
-- Additive, nullable, no backfill: existing rows simply have NULL here
-- until that booking is next re-synced (same "code merged ≠ history
-- re-run" posture as fall_of_wickets/bowling_order before it).

ALTER TABLE match_stats_cache
  ADD COLUMN IF NOT EXISTS opponent_fall_of_wickets jsonb;

COMMENT ON COLUMN match_stats_cache.opponent_fall_of_wickets IS
  'Cached copy of the analytics DB''s opponent_fall_of_wickets rows for this match_id, ordered by wicket_number -- the opponent''s own Fall of Wickets, each row additionally carrying bowler_name (the Spartans bowler credited with that dismissal). NULL for a booking not yet re-synced since this column was added, or a match with no data. Raw facts only -- no partnership/breakthrough derivation exists yet, and there is no UI reading this column.';
