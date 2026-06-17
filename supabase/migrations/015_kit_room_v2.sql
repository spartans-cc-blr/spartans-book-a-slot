ALTER TABLE jersey_orders
  -- Replace jersey_size with sleeve-specific fields
  ADD COLUMN jersey_half_sleeve_size text
    CHECK (jersey_half_sleeve_size IN ('XS','S','M','L','XL','XXL','XXXL')),
  ADD COLUMN jersey_full_sleeve_size text
    CHECK (jersey_full_sleeve_size IN ('XS','S','M','L','XL','XXL','XXXL')),
  ADD COLUMN tracks_size text
    CHECK (tracks_size IN ('XS','S','M','L','XL','XXL','XXXL')),
  -- Rename jersey_name to allow override without touching profile
  ADD COLUMN jersey_name_override text CHECK (char_length(jersey_name_override) <= 10);

-- At least one item must be ordered (enforced at API level, not DB)
-- jersey_size column retained for backward compatibility with existing orders
-- New orders will use the new columns; jersey_size will be null for v2 orders