-- Migration 019: jersey_number_override + quantity fields on jersey_orders

-- Allow per-order jersey number override (same format as jersey_number)
ALTER TABLE jersey_orders
  ADD COLUMN jersey_number_override text
    CHECK (jersey_number_override ~ '^[0-9]{1,3}$');

-- Quantity per item type — default 1, max 3
ALTER TABLE jersey_orders
  ADD COLUMN jersey_half_sleeve_qty integer NOT NULL DEFAULT 1
    CHECK (jersey_half_sleeve_qty BETWEEN 1 AND 3),
  ADD COLUMN jersey_full_sleeve_qty integer NOT NULL DEFAULT 1
    CHECK (jersey_full_sleeve_qty BETWEEN 1 AND 3),
  ADD COLUMN tracks_qty integer NOT NULL DEFAULT 1
    CHECK (tracks_qty BETWEEN 1 AND 3);