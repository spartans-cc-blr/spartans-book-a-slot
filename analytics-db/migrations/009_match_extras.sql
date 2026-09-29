-- 009_match_extras.sql
-- Analytics DB (separate Supabase project — ANALYTICS_SUPABASE_URL/KEY).
-- NOT part of supabase/migrations/ (the Hub DB) — apply directly to the
-- analytics project. See analytics-db/migrations/README.md and the
-- "Repo/DB drift note" pattern in features/post-match-scorecard.md §5.
--
-- Purpose: the Extras breakdown (byes / leg byes / wides / no-balls /
-- total) Spartans CONCEDED while bowling — i.e. what the opponent's own
-- innings "Extras:" line on the scorecard shows.
--
-- Deliberately one-directional, scoped to match the actual ask: extras
-- Spartans received while batting (their own innings' Extras line) are
-- not captured here — spartans-python's ScorecardExtractor.extract_extras()
-- reads both sides symmetrically (same shape as extract_fall_of_wickets()),
-- but CSVWriterFactory.write_all() only ever picks the opponent's side,
-- same "extractor stays symmetric, the writer decides what to persist"
-- pattern 007's opponent_fall_of_wickets table already established.
--
-- wides/no_balls here are match-level AGGREGATES, distinct from (and in
-- addition to) the existing per-bowler bowling_stats.wides/no_balls
-- columns — cricket doesn't charge byes/leg-byes to any individual
-- bowler at all, so those two only ever exist at this match level; wides
-- and no-balls are captured at both granularities for the one line-item
-- that's already right there in the same "Extras:" text.
--
-- All five nullable, no defaults, no CHECK constraint — same "code merged
-- ≠ history re-run" posture as every other column added to this table:
-- every existing row is NULL here until its match is next re-synced.
-- extras_total is the scorecard's own stated total, not a computed sum —
-- the extractor cross-checks the two and logs a warning on mismatch, but
-- always trusts the PDF's own printed total over its own arithmetic.

ALTER TABLE match_stats
  ADD COLUMN IF NOT EXISTS extras_byes     integer,
  ADD COLUMN IF NOT EXISTS extras_leg_byes integer,
  ADD COLUMN IF NOT EXISTS extras_wides    integer,
  ADD COLUMN IF NOT EXISTS extras_no_balls integer,
  ADD COLUMN IF NOT EXISTS extras_total    integer;

COMMENT ON COLUMN match_stats.extras_byes IS
  'Byes conceded by Spartans while bowling (opponent innings), parsed from that innings'' own "Extras:" line. NULL until the match is (re-)synced with this column live.';

COMMENT ON COLUMN match_stats.extras_leg_byes IS
  'Leg byes conceded by Spartans while bowling (opponent innings), same source as extras_byes.';

COMMENT ON COLUMN match_stats.extras_wides IS
  'Match-level total wides conceded by Spartans while bowling (opponent innings) — an aggregate distinct from the per-bowler bowling_stats.wides column, sourced from the same "Extras:" line rather than summed from it.';

COMMENT ON COLUMN match_stats.extras_no_balls IS
  'Match-level total no-balls conceded by Spartans while bowling (opponent innings) — an aggregate distinct from the per-bowler bowling_stats.no_balls column, sourced from the same "Extras:" line rather than summed from it.';

COMMENT ON COLUMN match_stats.extras_total IS
  'The opponent innings'' own stated total extras figure (byes + leg byes + wides + no-balls, as printed on the scorecard) — not recomputed from the four columns above, though the extractor logs a warning if they disagree.';
