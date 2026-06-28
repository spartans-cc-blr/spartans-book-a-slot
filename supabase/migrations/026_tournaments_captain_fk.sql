-- 026_tournaments_captain_fk.sql
-- Add captain_id to tournaments table.
-- This is the primary captain for the tournament — drives auto-population on booking forms.
-- bookings.captain_id is still written on every booking (derived or overridden) for SCD history.
ALTER TABLE tournaments
  ADD COLUMN IF NOT EXISTS captain_id uuid REFERENCES captains(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_tournaments_captain_id ON tournaments(captain_id);
COMMENT ON COLUMN tournaments.captain_id IS
  'Primary captain for this tournament. Auto-populates bookings.captain_id on booking creation. '
  'bookings.captain_id can be overridden per-booking for one-off exceptions without changing this field.';
