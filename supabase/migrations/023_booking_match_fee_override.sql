ALTER TABLE bookings ADD COLUMN IF NOT EXISTS match_fee_override integer;
COMMENT ON COLUMN bookings.match_fee_override IS
  'Per-game override of tournament.match_fee. NULL = use tournament default.
   Set by admin when this specific game has a different organiser fee.';