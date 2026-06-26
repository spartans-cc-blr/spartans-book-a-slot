ALTER TABLE tournaments ADD COLUMN IF NOT EXISTS match_fee integer;
COMMENT ON COLUMN tournaments.match_fee IS
  'Total organiser fee (₹) for a standard match in this tournament. Divided equally
   among non-exempt announced squad members to derive fee_per_player.';