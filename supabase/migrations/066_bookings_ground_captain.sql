-- Migration: 066_bookings_ground_captain
--
-- Adds per-booking ground_id and captain_id, both nullable FKs, independently
-- overridable per game. Previously ground and captain were only ever resolved
-- by joining through the booking's tournament (tournaments.ground_id /
-- tournaments.captain_id) — fine for a normal tournament, which plays every
-- game at one ground with one captain, but wrong for the "Practice games"
-- umbrella tournament (features/leaderboard.md §10, is_practice), which plays
-- a different ground every time and has no single default.
--
-- Each booking snapshots its own ground/captain rather than always live-
-- joining to the tournament's *current* values — so a tournament's ground or
-- captain changing later never silently rewrites history for games already
-- booked/played, and an aggregator-style tournament spanning many grounds
-- just becomes "override per booking," no special-casing by tournament type.
--
-- The client (admin booking form) is responsible for defaulting these to the
-- tournament's own ground_id/captain_id at booking time — this migration only
-- backfills existing rows the same way, as a one-time snapshot.

ALTER TABLE bookings
  ADD COLUMN ground_id  uuid REFERENCES grounds(id),
  ADD COLUMN captain_id uuid REFERENCES captains(id);

-- Backfill every existing booking from its tournament as it stands today.
UPDATE bookings b
SET ground_id = t.ground_id
FROM tournaments t
WHERE b.tournament_id = t.id
  AND t.ground_id IS NOT NULL
  AND b.ground_id IS NULL;

UPDATE bookings b
SET captain_id = t.captain_id
FROM tournaments t
WHERE b.tournament_id = t.id
  AND t.captain_id IS NOT NULL
  AND b.captain_id IS NULL;

-- bookings.venue (free text) is superseded by ground_id going forward. Left
-- in place, unmigrated, purely as inert historical display for rows created
-- before this migration — see features/... for why an ilike-name-match
-- fallback was retired rather than kept (it was already silently broken for
-- most existing rows: venue text carries a ", City (Region)" suffix that
-- never matches grounds.name).
COMMENT ON COLUMN bookings.venue IS
  'Deprecated — free-text ground name from before ground_id existed. No longer written to by the app; retained only for historical display of rows created before migration 066. Use ground_id instead.';
