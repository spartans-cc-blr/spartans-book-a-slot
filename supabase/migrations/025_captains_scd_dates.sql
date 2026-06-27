-- 025_captains_scd_dates.sql
-- Add SCD date tracking to captains table.
-- captain_since: date the player was promoted as captain (defaults to created_at date)
-- inactive_since: date the captain was marked inactive (null while active)

ALTER TABLE captains
  ADD COLUMN IF NOT EXISTS captain_since date,
  ADD COLUMN IF NOT EXISTS inactive_since date;

-- Backfill captain_since from created_at for existing rows
UPDATE captains SET captain_since = created_at::date WHERE captain_since IS NULL;

COMMENT ON COLUMN captains.captain_since IS 'Date the player was promoted as captain. Defaults to today on creation.';
COMMENT ON COLUMN captains.inactive_since IS 'Date the captain was marked inactive. NULL while active.';