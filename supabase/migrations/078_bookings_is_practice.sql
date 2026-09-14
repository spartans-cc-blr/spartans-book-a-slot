-- Migration: 078_bookings_is_practice
--
-- Adds a per-booking practice-game override, additive to the existing
-- tournaments.is_practice flag (migration 054_tournament_is_practice.sql).
--
-- Until now, "is this a practice game" was decided entirely at the
-- tournament level — a match only counted as practice if it was booked
-- under the single "Practice games" umbrella tournament. That meant a
-- one-off scrimmage played under a real tournament (e.g. a warm-up game
-- ahead of a real fixture) had no way to be excluded from real-match
-- aggregates (leaderboard, Team Record, milestones, the quarterly
-- membership fee, availability-nudge leaderboard recognition) without
-- either miscategorising it as a real match or rebooking it under the
-- umbrella tournament, losing its real tournament association.
--
-- bookings.is_practice closes that gap: any single game, under any
-- tournament, can now be individually flagged practice. Every code path
-- that used to read only tournaments.is_practice now treats a booking as
-- practice when EITHER this flag or its tournament's flag is set — see
-- isPracticeMatch() in src/types/index.ts and features/practice-games.md
-- for the full list of call sites.
--
-- NOT NULL DEFAULT false — every existing booking is unaffected (false),
-- same "additive, zero behaviour change until explicitly set" posture as
-- every other flag added to this table (stage_type, ground_id/captain_id).

ALTER TABLE bookings
  ADD COLUMN IF NOT EXISTS is_practice boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN bookings.is_practice IS
  'Per-booking practice-game override, additive to tournaments.is_practice. A booking counts as practice when EITHER this flag or its tournament''s is_practice flag is true — see isPracticeMatch() in src/types/index.ts and features/practice-games.md.';
