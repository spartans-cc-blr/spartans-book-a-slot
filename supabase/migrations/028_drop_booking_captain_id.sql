-- 028_drop_booking_captain_id.sql
-- Remove captain_id from bookings. Captain is now derived via tournament join.
-- R2 validation uses tournaments.captain_id instead of bookings.captain_id.

-- 1. Drop the DB constraints that reference captain_id
ALTER TABLE bookings DROP CONSTRAINT IF EXISTS confirmed_requires_fields;
ALTER TABLE bookings DROP CONSTRAINT IF EXISTS soft_block_no_captain;

-- 2. Drop the FK and column
ALTER TABLE bookings DROP COLUMN IF EXISTS captain_id;

-- 3. Rewrite confirmed_requires_fields without captain_id
--    Confirmed bookings now require: format + tournament_id
ALTER TABLE bookings ADD CONSTRAINT confirmed_requires_fields
  CHECK (
    status != 'confirmed' OR (
      format IS NOT NULL AND
      tournament_id IS NOT NULL
    )
  );

-- 4. soft_block_no_captain is now vacuous (no captain_id column) — not needed
--    No replacement constraint required.

COMMENT ON TABLE bookings IS
  'captain_id removed June 2026. Captain is now derived via bookings.tournament_id → tournaments.captain_id. '
  'Match-day captain is set via squad.is_captain during squad announcement.';
