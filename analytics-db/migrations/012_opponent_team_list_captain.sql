-- 012_opponent_team_list_captain.sql
-- Analytics DB (separate Supabase project — ANALYTICS_SUPABASE_URL/KEY).
-- NOT part of supabase/migrations/ (the Hub DB) — apply directly to the
-- analytics project. See analytics-db/migrations/README.md and the
-- "Repo/DB drift note" pattern in features/post-match-scorecard.md §5.
--
-- Purpose: flag which row in opponent_team_list is the opponent's own
-- captain, per match.
--
-- Not asked for as a new PDF field to parse -- the club's own review of
-- Working Order item #8 (per-player captain/WK flags) pointed out that
-- Spartans' captain is already managed entirely on the Hub side
-- (players.is_captain / squad.is_captain, via Captains' Corner) and needs
-- no CricHeroes-side capture at all. The opponent side has no such Hub
-- concept -- match_stats.opponent_captain already exists as a single
-- match-level name STRING (see the 'Squad/Player — Captain' row in
-- features/scorecard-raw-data-capture.md §2), extracted from the PDF's
-- Match Officials section by MatchDetailsExtractor._extract_captains(),
-- but nothing before this migration ever cross-referenced it against the
-- opponent's own Playing XI roster (opponent_team_list, added by
-- 011_opponent_team_list.sql) to say WHICH of those players it refers to.
--
-- No new PDF parsing -- match_stats.opponent_captain was already being
-- extracted; this just stops discarding the cross-reference between that
-- name and the opponent roster table. See
-- features/scorecard-raw-data-capture.md §7 for the real-PDF casing
-- mismatch ('Chethu Cs' vs 'Chethu CS') this needed a normalized name
-- match (not a bare string equality) to close correctly.

ALTER TABLE opponent_team_list
  ADD COLUMN IF NOT EXISTS is_captain boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN opponent_team_list.is_captain IS
  'True for the one row (if any) whose player_name matches match_stats.opponent_captain, via a case/punctuation-normalized comparison (spartans-python BaseCSVWriter._names_match()) -- the two names come from different PDF sections (Match Officials vs. the Playing Squad list) and can differ in capitalisation. False (never NULL) when the Match Officials section yielded no captain name at all, or matched no roster row.';

-- Nullable on nothing — every existing row simply has is_captain=false
-- (the column default) until its match is next re-synced, same
-- "code merged ≠ history re-run" posture as every other column added in
-- this file's series.
