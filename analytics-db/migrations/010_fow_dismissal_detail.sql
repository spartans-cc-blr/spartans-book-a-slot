-- 010_fow_dismissal_detail.sql
-- Analytics DB (separate Supabase project — ANALYTICS_SUPABASE_URL/KEY).
-- NOT part of supabase/migrations/ (the Hub DB) — apply directly to the
-- analytics project. See analytics-db/migrations/README.md and the
-- "Repo/DB drift note" pattern in features/post-match-scorecard.md §5.
--
-- Purpose: dismissal_type/bowler_name/fielder_name on BOTH Fall of Wickets
-- tables (005_fall_of_wickets.sql's Spartans-only table, and 007's
-- opponent_fall_of_wickets), so a FOW row answers "how, and by whom" as
-- well as "who, at what score/over" — not just data this app happens to
-- use today, but raw scorecard fact this pipeline had already parsed and
-- was discarding before it reached a table (same shape as 007/009).
--
-- No new PDF parsing. Every value here is DismissalParser.parse_batting_
-- dismissal()'s existing return shape ({'method', 'bowler', 'fielder'}),
-- re-run against the dismissed batter's own already-extracted batting.status
-- text — opponent_fall_of_wickets already ran this exact call to get
-- bowler_name (007); this migration is what stops bowler_name being the
-- only field of that call's result kept. fall_of_wickets (Spartans' own
-- side) never ran this lookup at all before this pass — spartans-python's
-- FallOfWicketsWriter now also takes the Spartans player_statistics dict
-- (the same one BattingStatsWriter already reads) to look each wicket's
-- own batter up in.
--
-- Considered and deliberately NOT added: a fielder identity gap was
-- originally flagged as an open item in features/scorecard-raw-data-
-- capture.md, then corrected — no metric in the plan document needs a
-- fielder tied to a specific wicket, only a per-match aggregate, which
-- fielding_stats already provides in full (see that doc's §3.1). This
-- migration adds fielder_name anyway, per an explicit later request to
-- capture what's available from the scorecard even without a current UI
-- use — "not to lose data" for a future need, not because a metric
-- requires it today.
--
-- dismissal_type ('bowled'/'caught'/'caught_behind'/'lbw'/'stumping'/
-- 'run_out'/'retired_hurt'/'retired_out'/'other'/'not_out') mirrors
-- batting_stats.dismissal_method's own vocabulary (same DismissalParser
-- call), named distinctly since this is a different table at a different
-- grain (one row per wicket, not per player).
--
-- fielder_name is the raw parser output, unsplit — for a run out this can
-- be a "Thrower/Collector" combined string (same shape
-- DismissalParser.parse_fielders_from_runout() already knows how to split
-- further, on the read side, if a future consumer needs individual
-- credit); this migration is raw capture only, no derivation.
--
-- All nullable, no defaults, no CHECK constraint — same "code merged ≠
-- history re-run" posture as 007/009: every existing row is NULL here
-- until its match is next re-synced.

ALTER TABLE fall_of_wickets
  ADD COLUMN IF NOT EXISTS dismissal_type text,
  ADD COLUMN IF NOT EXISTS bowler_name    text,
  ADD COLUMN IF NOT EXISTS fielder_name   text;

ALTER TABLE opponent_fall_of_wickets
  ADD COLUMN IF NOT EXISTS dismissal_type text,
  ADD COLUMN IF NOT EXISTS fielder_name   text;

COMMENT ON COLUMN fall_of_wickets.dismissal_type IS
  'How this Spartans batter was dismissed (bowled/caught/caught_behind/lbw/stumping/run_out/retired_hurt/retired_out/other), parsed from the same batting.status "how out" text batting_stats.dismissal_method already derives — this is the per-wicket copy of that same fact, at FOW''s own (match_id, wicket_number) grain. NULL if the batter could not be resolved against this match''s Spartans batting stats.';

COMMENT ON COLUMN fall_of_wickets.bowler_name IS
  'The bowler who took this wicket (Spartans'' own dismissal — an opponent bowler), parsed from the same "how out" text. NULL for a run out, a retirement, or dismissal text the parser could not classify.';

COMMENT ON COLUMN fall_of_wickets.fielder_name IS
  'The fielder(s) involved in this dismissal (catcher, keeper on a stumping/caught-behind, or run-out fielder(s), raw and unsplit -- "Thrower/Collector" for an assisted run out). NULL for a bowled/lbw dismissal, which has no fielder.';

COMMENT ON COLUMN opponent_fall_of_wickets.dismissal_type IS
  'How this opponent batter was dismissed -- same vocabulary and source as fall_of_wickets.dismissal_type above, from the identical DismissalParser call that already produces this table''s bowler_name.';

COMMENT ON COLUMN opponent_fall_of_wickets.fielder_name IS
  'The Spartans fielder(s) involved in this dismissal -- same raw, unsplit shape as fall_of_wickets.fielder_name above. NULL for a bowled/lbw dismissal.';
