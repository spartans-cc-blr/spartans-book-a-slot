-- Migration: 006_fall_of_wickets_retirement
--
-- Adds support for a batter retiring hurt (not a genuine dismissal) and
-- later returning to the crease — a real cricket occurrence
-- computePartnerships()'s crease-pointer walk (src/lib/partnerships.ts)
-- previously had no way to express at all. See features/partnerships.md §4.4.
--
-- is_retirement: this row records a retirement, not a real wicket falling.
-- The retiring player still leaves the crease exactly like any other
-- departure (the next batting-order player takes their spot, unless a
-- later row's returning_player_name says otherwise) — this flag only
-- excludes the row from the real-wicket count computePartnerships()
-- compares against match_stats.team_wickets (the §4.3 completeness check).
--
-- returning_player_name: set on a LATER row (any row — a real wicket or
-- another retirement) to say a previously-retired player fills the
-- vacancy THIS row creates, instead of the next not-yet-used
-- batting_order player. There is no way to infer either of these columns
-- from CricHeroes' own PDF text — no textual "retired hurt" marker exists
-- in this export format, only an ambiguous reused wicket_number — so both
-- always have to be supplied by a human who knows what actually happened
-- in the match, same as any other fall_of_wickets correction in this
-- table's history.

ALTER TABLE fall_of_wickets
  ADD COLUMN is_retirement boolean NOT NULL DEFAULT false,
  ADD COLUMN returning_player_name text;
