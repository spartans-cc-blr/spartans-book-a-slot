-- Allow jersey_size to be null for v2 orders
-- v2 orders use jersey_half_sleeve_size and jersey_full_sleeve_size instead
ALTER TABLE jersey_orders
  ALTER COLUMN jersey_size DROP NOT NULL;