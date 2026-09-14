-- Migration: 079_move_pitch_type_to_tournaments
--
-- Moves the pitch-type dimension (Matted / Astro / Turf, added by migration
-- 078_grounds_pitch_type.sql) from grounds to tournaments — see
-- features/team-stats.md §6.
--
-- Why: a ground's physical surface can change over time (resurfacing), so
-- a static grounds.pitch_type would eventually go stale and, once
-- corrected, silently repaint every historical match ever played there —
-- including ones played before the resurfacing. A tournament runs on one
-- surface for its whole duration, so it's the right place to snapshot
-- "what pitch type these matches were actually played on", immune to a
-- later change at the ground itself. The one exception (the "Practice
-- games" umbrella tournament, which deliberately rotates across many
-- grounds/surfaces) is moot — practice matches are excluded from Team
-- Record by default and pitch type is meaningless for them either way.
--
-- Backfill:
--   - Turf: same name-based rule the original grounds.pitch_type backfill
--     used ("MSB Turf T30 Champions Trophy Season-6", "Sara Inaugural
--     Turf"), applied directly to the tournament now instead of via ground
--     indirection.
--   - Matted: carries forward a real, manually-entered classification an
--     admin had set on "Macushala Cricket Ground" via /wrangler/grounds
--     after the ground-level feature shipped (not part of the original
--     name-based backfill). Confirmed via direct query that all three
--     tournaments played there ("Champions Trophy Ed-3 (T30 - White
--     Ball)", "Extreme Cricket Champions Tourney Ed-6 (White Ball -
--     T30)", "Extreme Cricket Summer Cup Season 1") only ever used that
--     one ground, so there's no ambiguity moving the classification up.
--   - Every other tournament is left NULL — same "don't guess" posture as
--     the original migration.

ALTER TABLE tournaments
  ADD COLUMN IF NOT EXISTS pitch_type text CHECK (pitch_type IN ('Matted', 'Astro', 'Turf'));

COMMENT ON COLUMN tournaments.pitch_type IS
  'Matted, Astro or Turf — NULL means not yet classified. Set from /admin/tournaments (admin only); see features/team-stats.md §6. Practice tournaments are never classified — pitch type is meaningless for a tournament that rotates grounds.';

UPDATE tournaments
SET pitch_type = 'Turf'
WHERE pitch_type IS NULL
  AND name ILIKE '%turf%';

UPDATE tournaments
SET pitch_type = 'Matted'
WHERE id IN (
  'a884141a-f048-4822-bd8d-3c88ba34f4a0', -- Champions Trophy Ed-3 (T30 - White Ball)
  'edf10520-1a44-4cc3-abd4-78592ca14f36', -- Extreme Cricket Champions Tourney Ed-6 (White Ball - T30)
  '1dbc65e2-b116-4d49-9e71-232d49258c95'  -- Extreme Cricket Summer Cup Season 1
);

ALTER TABLE grounds DROP COLUMN IF EXISTS pitch_type;
