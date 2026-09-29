-- 007_opponent_fall_of_wickets.sql
-- Analytics DB (separate Supabase project — ANALYTICS_SUPABASE_URL/KEY).
-- NOT part of supabase/migrations/ (the Hub DB) — apply directly to the
-- analytics project. See analytics-db/migrations/README.md and the
-- "Repo/DB drift note" pattern in features/post-match-scorecard.md §5:
-- a file existing here is not proof it has been applied to the live
-- analytics project — cross-check with list_migrations after applying.
--
-- Purpose: the OPPONENT's own Fall of Wickets, one row per wicket, each
-- credited to whichever Spartans bowler dismissed that batter. This is
-- the mirror image of 005_fall_of_wickets.sql (Spartans' own innings only)
-- — that table still has no opponent-side data and never will; this is a
-- separate table, not a widened version of it, because the two answer
-- different questions with different join keys (fall_of_wickets resolves
-- its player_name against our own batting_stats; this table's player_name
-- is an opponent batter with no Hub player_id at all — only bowler_name
-- resolves to one, via the existing bowling_stats.player_name alias path).
--
-- Written by spartans-python's OpponentFallOfWicketsWriter
-- (utils/csv_writers.py) — no new PDF parsing needed. bowler_name is
-- derived from the same per-batter "how out" text
-- (DismissalParser.parse_batting_dismissal()) that BowlingStatsWriter
-- already reads to build the aggregate bowled/caught/caught_behind/lbw/
-- stumping/other counts on the Spartans bowler's own bowling_stats row —
-- this table just keeps the per-batter link that aggregation step
-- discards, instead of collapsing it away.
--
-- Raw facts only — which Spartans bowler broke which opponent partnership
-- is derived at read time from this table plus the opponent's own batting
-- order (team_list), the same way src/lib/partnerships.ts already derives
-- Spartans' own partnerships from fall_of_wickets. No such derivation is
-- built yet on the Hub side, and there is deliberately no UI for this —
-- see features/partnerships.md §11's own scope note. This migration only
-- makes the underlying facts capturable and queryable.
--
-- bowler_name is nullable: a run out, a retirement, or dismissal text
-- DismissalParser can't parse (method 'other') credits no bowler.
--
-- Nullable on nothing — every existing match will simply have zero rows
-- here until it's next re-synced (same "code merged is not the same as
-- history re-run" caveat as 004_bowling_order.sql / 005_fall_of_wickets.sql).

CREATE TABLE IF NOT EXISTS opponent_fall_of_wickets (
  match_id      text    NOT NULL REFERENCES match_stats(match_id),
  wicket_number integer NOT NULL,
  team_score    integer NOT NULL,
  over          numeric NOT NULL,
  player_name   text    NOT NULL,
  bowler_name   text,
  created_at    timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (match_id, wicket_number)
);

ALTER TABLE opponent_fall_of_wickets ENABLE ROW LEVEL SECURITY;
-- No anon/authenticated policies — service role only, same blanket-deny
-- pattern as every other table in this database.

COMMENT ON COLUMN opponent_fall_of_wickets.player_name IS
  'The opponent batter dismissed at this wicket, already normalized via ScorecardConfig.strip_name_annotations() at parse time. Opponent players have no Hub player_id anywhere in this schema — this column is display-only, never a join key into a Hub-side table.';

COMMENT ON COLUMN opponent_fall_of_wickets.bowler_name IS
  'The Spartans bowler credited with this dismissal, parsed from the same batting.status "how out" text (e.g. "c Fielder b Bowler") that already feeds bowling_stats''s aggregate bowled/caught/caught_behind/lbw/stumping/other counts. NULL for a run out, a retirement, or dismissal text the parser could not classify (method ''other''). Matches bowling_stats.player_name for the same match_id byte-for-byte, so it resolves to a Hub player_id the same way every other Spartans player_name in this database already does — no separate alias/override path.';
