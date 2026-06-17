ALTER TABLE jersey_orders
  DROP CONSTRAINT jersey_orders_status_check,
  ADD CONSTRAINT jersey_orders_status_check
    CHECK (status IN ('pending','submitted','delivered','received','cancelled'));

-- Also update the partial unique index to exclude cancelled orders
-- so a player can place a new order after cancelling
DROP INDEX idx_jersey_orders_one_active_per_player;
CREATE UNIQUE INDEX idx_jersey_orders_one_active_per_player
  ON jersey_orders(player_id)
  WHERE status IN ('pending','submitted','delivered');