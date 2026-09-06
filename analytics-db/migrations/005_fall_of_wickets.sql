-- 005_fall_of_wickets.sql
-- Analytics DB (separate Supabase project — ANALYTICS_SUPABASE_URL/KEY).
-- NOT part of supabase/migrations/ (the Hub DB) — apply directly to the
-- analytics project. See analytics-db/migrations/README.md and the
-- "Repo/DB drift note" pattern in features/post-match-scorecard.md §5:
-- a file existing here is not proof it has been applied to the live
-- analytics project — cross-check with list_migrations after applying.
--
-- Purpose: one row per wicket that fell in a match, sourced from the
-- scorecard PDF's own "Fall of Wickets" section (team score + over +
-- dismissed player, in wicket order). Written by spartans-python's new
-- FallOfWicketsWriter (utils/csv_writers.py) — extraction lives in
-- ScorecardExtractor.extract_fall_of_wickets() (utils/field_extractors.py).
-- This is the raw-facts table a partnership view is derived from at read
-- time on the Hub side; no partnership/pairing is computed or stored here.
--
-- Spartans innings only — CSVWriterFactory.write_all()'s existing
-- is_team_spartans branch decides which side to persist here, same as
-- batting_stats/bowling_stats/fielding_stats/team_list. The opponent's own
-- Fall of Wickets is never written; nothing else in this database tracks
-- an opponent's individual performance either.
--
-- No player_id column here, unlike the other four tables. Every wicket
-- named in this table already has its own row in batting_stats for the
-- same match_id (a player can't fall without having batted) — a reader
-- resolves player_name -> player_id by joining to that already-reconciled
-- batting_stats row rather than through a second, independent alias/
-- override path. player_name is written already normalized via
-- ScorecardConfig.strip_name_annotations() (the same stripping
-- batting_stats.player_name goes through), so the join is a plain
-- byte-for-byte string match, not a fuzzy one.
--
-- Nullable on nothing — every existing match will simply have zero rows
-- here until it's re-synced (same "code merged is not the same as history
-- re-run" caveat as 004_bowling_order.sql), rather than a NULL/sentinel
-- column on an existing table.

CREATE TABLE IF NOT EXISTS fall_of_wickets (
  match_id      text    NOT NULL REFERENCES match_stats(match_id),
  wicket_number integer NOT NULL,
  team_score    integer NOT NULL,
  over          numeric NOT NULL,
  player_name   text    NOT NULL,
  created_at    timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (match_id, wicket_number)
);

ALTER TABLE fall_of_wickets ENABLE ROW LEVEL SECURITY;
-- No anon/authenticated policies — service role only, same blanket-deny
-- pattern as match_stats/batting_stats/bowling_stats/fielding_stats/team_list.

COMMENT ON COLUMN fall_of_wickets.player_name IS
  'The batter dismissed at this wicket, already normalized via ScorecardConfig.strip_name_annotations() at parse time — matches batting_stats.player_name for the same match_id byte-for-byte. This is the join key a reader uses to resolve a Hub player_id; there is no independent alias/override table for this data.';
