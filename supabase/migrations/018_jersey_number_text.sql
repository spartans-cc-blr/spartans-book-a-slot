-- Migration 018: Change jersey_number to text to support leading zeros (e.g. 01, 007)

-- Players table
ALTER TABLE players
  ALTER COLUMN jersey_number TYPE text USING jersey_number::text;

ALTER TABLE players
  ADD CONSTRAINT players_jersey_number_format
    CHECK (jersey_number ~ '^[0-9]{1,3}$');

-- jersey_orders table
ALTER TABLE jersey_orders
  DROP CONSTRAINT IF EXISTS jersey_orders_jersey_number_check;

ALTER TABLE jersey_orders
  ALTER COLUMN jersey_number TYPE text USING jersey_number::text;

ALTER TABLE jersey_orders
  ADD CONSTRAINT jersey_orders_jersey_number_format
    CHECK (jersey_number ~ '^[0-9]{1,3}$');