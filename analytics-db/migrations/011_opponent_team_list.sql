-- 011_opponent_team_list.sql
-- Analytics DB (separate Supabase project — ANALYTICS_SUPABASE_URL/KEY).
-- NOT part of supabase/migrations/ (the Hub DB) — apply directly to the
-- analytics project. See analytics-db/migrations/README.md and the
-- "Repo/DB drift note" pattern in features/post-match-scorecard.md §5.
--
-- Purpose: batting hand (RHB/LHB) for EVERY opponent batter who appears
-- on the scorecard's batting card, not just the ones who were dismissed.
--
-- This is NOT a Fall-of-Wickets-derived capture, and the earlier framing
-- of this gap (features/scorecard-raw-data-capture.md's original
-- Working Order item #9, "needs a new opponent-side roster table") as
-- something FOW-adjacent was itself corrected by a direct question: the
-- (RHB)/(LHB) annotation sits right next to a batter's name on the raw
-- scorecard, read by ScorecardExtractor._extract_batting_stats() the
-- moment that name is parsed -- before dismissal is even known, for
-- whichever team is batting on that page, both teams. The value has
-- always been computed in memory for every opponent batter (dismissed or
-- not-out); the actual gap was purely that nothing ever wrote it down for
-- a batter who wasn't dismissed, since opponent_fall_of_wickets only ever
-- has a row per wicket and opponent_stats' full batting card was never
-- persisted anywhere.
--
-- No new PDF parsing -- same "already parsed, just needed keeping" story
-- as 007/008/010. Deliberately scoped to batting_style only, not a wider
-- opponent_batting_stats table with runs/balls/etc. -- that wasn't asked
-- for, though the same player_stats dict this reads from already has
-- everything a future pass would need for that too.
--
-- One row per opponent player in the full Playing XI for that match
-- (mirrors the Spartans-only team_list table's own grain), not just
-- those with a batting-card row -- a tail-ender who never got to bat
-- simply has a NULL batting_style, same convention as every other
-- nullable column in this pipeline.

CREATE TABLE IF NOT EXISTS opponent_team_list (
  match_id      text NOT NULL REFERENCES match_stats(match_id),
  player_name   text NOT NULL,
  batting_style text,
  created_at    timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (match_id, player_name)
);

ALTER TABLE opponent_team_list ENABLE ROW LEVEL SECURITY;
-- No anon/authenticated policies — service role only, same blanket-deny
-- pattern as every other table in this database.

COMMENT ON COLUMN opponent_team_list.player_name IS
  'An opponent player in the full Playing XI for this match, already normalized via ScorecardConfig.strip_name_annotations(). Opponent players have no Hub player_id anywhere in this schema — this column is display-only, never a join key into a Hub-side table.';

COMMENT ON COLUMN opponent_team_list.batting_style IS
  '"RHB"/"LHB", read directly off this player''s raw scorecard name annotation at parse time — the same source and mechanism batting_stats.batting_style (Spartans) and opponent_fall_of_wickets.batting_style (dismissed opponents only) already use. NULL for a player who never got a batting-card row at all (didn''t get to bat), or whose name carried no annotation.';

-- Nullable on nothing — every existing match will simply have zero rows
-- here until it's next re-synced (same "code merged ≠ history re-run"
-- caveat as every other table added in this file's series).
