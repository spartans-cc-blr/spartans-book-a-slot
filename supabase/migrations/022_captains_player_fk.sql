-- 022_captains_player_fk.sql
-- Link captains table to players for SCD history while keeping players as the source of truth.
-- player_id is nullable to preserve all legacy captains rows without requiring backfill.
ALTER TABLE captains
  ADD COLUMN IF NOT EXISTS player_id uuid REFERENCES players(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_captains_player_id ON captains(player_id);
COMMENT ON COLUMN captains.player_id IS
  'FK to players.id. Enables CricHeroes URL, photo, and identity joins. '
  'Nullable for legacy rows predating this migration. '
  'When set, this captains row is the SCD anchor for that player.';