-- 008_batting_style.sql
-- Analytics DB (separate Supabase project — ANALYTICS_SUPABASE_URL/KEY).
-- NOT part of supabase/migrations/ (the Hub DB) — apply directly to the
-- analytics project. See analytics-db/migrations/README.md and the
-- "Repo/DB drift note" pattern in features/post-match-scorecard.md §5.
--
-- Purpose: batting handedness ("RHB"/"LHB"), for both Spartans batters
-- (batting_stats) and dismissed opponent batters (opponent_fall_of_wickets).
--
-- No new PDF parsing needed — the raw scorecard name already carries this
-- as its own parenthetical annotation (e.g. "Sunil Reddy (c & wk) (RHB)"),
-- same "already parsed, just discarded" shape as 007's bowler_name:
-- ScorecardExtractor.strip_name_annotations() has always blindly regex-
-- stripped every parenthetical group off a player's name before it's used
-- as a dict key — this annotation included. spartans-python's
-- ScorecardConfig.extract_batting_style() now reads it off the raw name
-- BEFORE stripping, for every batter on both teams (the extraction pass
-- is symmetric — see analytics-db/migrations/007_opponent_fall_of_wickets.sql's
-- own note on why FOW itself could be captured for both sides for free).
--
-- 'RHB'/'LHB', normalized uppercase, or NULL when the PDF carried no such
-- annotation for that player (batting_stats) or the dismissed batter
-- (opponent_fall_of_wickets) — no CHECK constraint, since CricHeroes'
-- export format for this annotation hasn't been audited across every
-- house/season the way FALL_OF_WICKET_PATTERN's line-wrap sub-cases have,
-- and a constraint violation on an unexpected raw value would fail a
-- whole scorecard sync over a single cosmetic field.
--
-- batting_stats.batting_style is only ever populated for a player with a
-- real batting-card row (batted, or listed "Yet to Bat") — same scoping
-- every other batting_stats column already has; a genuinely did-not-bat
-- row stays NULL, same as every other stat on that row.
--
-- Nullable on nothing new — every existing row simply has NULL here until
-- its match is next re-synced, same "code merged ≠ history re-run"
-- posture as every prior column added to these two tables.

ALTER TABLE batting_stats
  ADD COLUMN IF NOT EXISTS batting_style text;

ALTER TABLE opponent_fall_of_wickets
  ADD COLUMN IF NOT EXISTS batting_style text;

COMMENT ON COLUMN batting_stats.batting_style IS
  'RHB / LHB, parsed from the raw scorecard name''s own "(RHB)"/"(LHB)" annotation before strip_name_annotations() discards it, or NULL when the PDF carried none for this player. Populated for every synced Spartans batter with a real batting-card row.';

COMMENT ON COLUMN opponent_fall_of_wickets.batting_style IS
  'RHB / LHB for the dismissed opponent batter named in player_name, same source and NULL convention as batting_stats.batting_style. Feeds a "% of wickets by batting style" breakdown at read time -- no such breakdown is computed or stored here.';
