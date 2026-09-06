-- Migration: 071_match_stats_cache_fall_of_wickets
-- Adds match_stats_cache.fall_of_wickets — the Hub-side cached copy of the
-- analytics DB's new fall_of_wickets table (see
-- analytics-db/migrations/005_fall_of_wickets.sql and
-- features/partnerships.md). Same jsonb-array-per-analytics-table pattern
-- 044_match_stats_cache.sql already established for batting/bowling/
-- fielding/team_list — one more column, not a new table.
--
-- Additive, nullable, no backfill: existing rows simply have NULL here
-- until that booking is next re-synced (same "code merged ≠ history
-- re-run" posture as bowling_stats.bowling_order in
-- analytics-db/migrations/004_bowling_order.sql).

ALTER TABLE match_stats_cache
  ADD COLUMN IF NOT EXISTS fall_of_wickets jsonb;

COMMENT ON COLUMN match_stats_cache.fall_of_wickets IS
  'Cached copy of the analytics DB''s fall_of_wickets rows for this match_id, ordered by wicket_number. NULL for a booking not yet re-synced since this column was added, or for a match with no Fall of Wickets data at all. Raw facts only -- partnership pairing is derived at read time (src/lib/partnerships.ts), never stored here.';
