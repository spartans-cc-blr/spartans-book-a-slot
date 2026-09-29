-- 082_match_stats_cache_extras.sql
-- Hub-side cache mirror of the analytics DB's new match_stats.extras_*
-- columns (analytics-db/migrations/009_match_extras.sql) — the Extras
-- breakdown Spartans conceded while bowling (byes / leg byes / wides /
-- no-balls / total), parsed from the opponent innings' own "Extras:" line.
--
-- Five plain integer columns rather than one jsonb blob, matching how
-- team_total/team_wickets/etc. already live directly on this table rather
-- than nested — match_stats_cache mirrors match_stats' own per-match
-- (not per-player) shape 1:1 for these fields, unlike batting/bowling/
-- fielding/team_list/fall_of_wickets, which are arrays and so live as
-- jsonb columns instead.
--
-- Nullable, no backfill — an existing booking's cache row simply has NULL
-- here until its next re-sync, same "code merged ≠ history re-run"
-- posture as every other column added to this table. See
-- .claude/rules/features/scorecard-raw-data-capture.md.

ALTER TABLE match_stats_cache
  ADD COLUMN IF NOT EXISTS extras_byes     integer,
  ADD COLUMN IF NOT EXISTS extras_leg_byes integer,
  ADD COLUMN IF NOT EXISTS extras_wides    integer,
  ADD COLUMN IF NOT EXISTS extras_no_balls integer,
  ADD COLUMN IF NOT EXISTS extras_total    integer;

COMMENT ON COLUMN match_stats_cache.extras_byes IS
  'Mirrors analytics DB match_stats.extras_byes — byes conceded by Spartans while bowling (opponent innings). NULL until the booking is (re-)synced with this column live.';

COMMENT ON COLUMN match_stats_cache.extras_leg_byes IS
  'Mirrors analytics DB match_stats.extras_leg_byes.';

COMMENT ON COLUMN match_stats_cache.extras_wides IS
  'Mirrors analytics DB match_stats.extras_wides — a match-level aggregate, distinct from any per-bowler figure.';

COMMENT ON COLUMN match_stats_cache.extras_no_balls IS
  'Mirrors analytics DB match_stats.extras_no_balls — a match-level aggregate, distinct from any per-bowler figure.';

COMMENT ON COLUMN match_stats_cache.extras_total IS
  'Mirrors analytics DB match_stats.extras_total — the opponent innings'' own stated total extras figure.';
