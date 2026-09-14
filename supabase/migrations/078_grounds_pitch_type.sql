-- Migration: 078_grounds_pitch_type
--
-- Adds a pitch-type dimension to grounds (Matted / Astro / Turf) so it can
-- be used as a Team Record filter/split dimension — see
-- features/team-stats.md §6 ("Pitch Type").
--
-- Backfill: a ground counts as Turf if any tournament whose name contains
-- "Turf" was played there — checked both via the tournament's own default
-- ground_id and via every one of that tournament's bookings' own ground_id
-- (bookings can override a tournament's default ground, migration 066).
-- At the time of writing this is exactly two grounds: "MSB Turf Ground"
-- (from "MSB Turf T30 Champions Trophy Season-6") and "Sara Turf Ground"
-- (from "Sara Inaugural Turf") — confirmed every booking under either
-- tournament used that same ground, no exceptions.
--
-- Every other ground is left NULL ("not set") rather than guessed between
-- Matted and Astro — that distinction needs real-world knowledge of each
-- ground the data has no signal for, so it isn't safe to infer. A
-- wrangler/admin classifies the rest from /wrangler/grounds, which gained
-- a Pitch Type field in the same pass as this migration.

ALTER TABLE grounds
  ADD COLUMN IF NOT EXISTS pitch_type text CHECK (pitch_type IN ('Matted', 'Astro', 'Turf'));

COMMENT ON COLUMN grounds.pitch_type IS
  'Matted, Astro or Turf — NULL means not yet classified. Set from /wrangler/grounds (wrangler/GC/admin); see features/team-stats.md §6.';

UPDATE grounds SET pitch_type = 'Turf'
WHERE pitch_type IS NULL
  AND id IN (
    SELECT ground_id FROM tournaments
    WHERE name ILIKE '%turf%' AND ground_id IS NOT NULL
    UNION
    SELECT b.ground_id FROM bookings b
    JOIN tournaments t ON t.id = b.tournament_id
    WHERE t.name ILIKE '%turf%' AND b.ground_id IS NOT NULL
  );
