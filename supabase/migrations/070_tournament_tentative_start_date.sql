-- Migration: 070_tournament_tentative_start_date
--
-- Lets an admin declare when a tournament is expected to start, before its
-- first booking exists. Used purely as an input to the suggestion engines
-- in src/lib/suggestedSlots.ts (computeSuggestionWindow()):
--
--   - When set and still in the future, suggestions are anchored to the
--     first Sat/Sun on or after this date instead of the default "next
--     Saturday after today."
--   - Combined with `total_league_games`, the suggestion horizon also
--     extends past the flat 16-week default to roughly
--     (total_league_games / 2) months out — the club's own "2 league
--     games a month" pace (e.g. 9 games ~= 4.5 months from the start
--     date).
--
-- A start date that's today or already in the past is treated the same as
-- "not set" — see features/tournament-planner.md §3.2.
ALTER TABLE tournaments
  ADD COLUMN tentative_start_date date;

COMMENT ON COLUMN tournaments.tentative_start_date IS
  'Admin-declared expected start date, used only to anchor and size the suggestion window in src/lib/suggestedSlots.ts (computeSuggestionWindow()) for a tournament with zero confirmed bookings yet. Ignored once it is today or in the past.';
