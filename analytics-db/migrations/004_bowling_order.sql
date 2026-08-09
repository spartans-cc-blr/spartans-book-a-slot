-- Migration: 004_bowling_order
-- Adds bowling_order to bowling_stats — the counterpart to the pre-existing
-- batting_stats.batting_order column. Previously absent entirely: the PDF
-- extractor read each row's real "No" position off CricHeroes' own bowling
-- table but discarded it, and BowlingStatsWriter (spartans-python) wrote
-- bowlers out in team_players (batting lineup) order instead of bowling
-- order, so the analytics DB never had any usable order signal for bowlers.
--
-- Nullable — existing rows from before this shipped have no value here and
-- will not get one until that match is re-synced (see
-- .claude/rules/features/post-match-scorecard.md for the general
-- stale-`match_stats_cache` pattern this project already knows about).

ALTER TABLE bowling_stats
  ADD COLUMN IF NOT EXISTS bowling_order integer;
