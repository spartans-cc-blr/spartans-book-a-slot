-- 028_drop_booking_captain_id.sql
-- Remove captain_id from bookings. Captain is now derived via tournament join.
-- R2 validation uses tournaments.captain_id instead of bookings.captain_id.

-- 1. Drop the RLS policy on squad that references bookings.captain_id
DROP POLICY IF EXISTS captain_manage_own_squad ON squad;

-- 2. Drop the DB constraints that reference captain_id
ALTER TABLE bookings DROP CONSTRAINT IF EXISTS confirmed_requires_fields;
ALTER TABLE bookings DROP CONSTRAINT IF EXISTS soft_block_no_captain;

-- 3. Drop the FK and column
ALTER TABLE bookings DROP COLUMN IF EXISTS captain_id;

-- 4. Rewrite confirmed_requires_fields without captain_id
--    Confirmed bookings now require: format + tournament_id
ALTER TABLE bookings ADD CONSTRAINT confirmed_requires_fields
  CHECK (
    status != 'confirmed' OR (
      format IS NOT NULL AND
      tournament_id IS NOT NULL
    )
  );

-- 5. Recreate captain_manage_own_squad using tournament captain path:
--    booking → tournament → captains → players (is_captain)
CREATE POLICY captain_manage_own_squad ON squad
  FOR ALL
  USING (
    EXISTS (
      SELECT 1
      FROM bookings b
      JOIN tournaments t  ON t.id  = b.tournament_id
      JOIN captains   c  ON c.id  = t.captain_id
      JOIN players    p  ON p.id  = c.player_id
      WHERE b.id = squad.booking_id
        AND p.gmail_id   = (auth.jwt() ->> 'email')
        AND p.is_captain = true
        AND p.active     = true
    )
  );

-- 6. soft_block_no_captain is now vacuous (no captain_id column) — not needed.

COMMENT ON TABLE bookings IS
  'captain_id removed June 2026. Captain is now derived via bookings.tournament_id → tournaments.captain_id. '
  'Match-day captain is set via squad.is_captain during squad announcement.';
