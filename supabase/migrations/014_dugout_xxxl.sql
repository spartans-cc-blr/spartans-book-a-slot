-- Extend jersey_size check constraint to include XXXL
ALTER TABLE jersey_orders
  DROP CONSTRAINT jersey_orders_jersey_size_check,
  ADD CONSTRAINT jersey_orders_jersey_size_check
    CHECK (jersey_size IN ('XS','S','M','L','XL','XXL','XXXL'));