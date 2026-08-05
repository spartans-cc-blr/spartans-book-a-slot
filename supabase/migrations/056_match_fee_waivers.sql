-- Migration: 056_match_fee_waivers
-- A per-booking, per-player fee waiver — deliberately separate from
-- fee_exemptions (player-level, date-ranged, standing) because "this
-- player wasn't given a role in this specific match" is a subjective,
-- one-off judgment call made at the moment fees are applied for that one
-- booking, not a durable fact about the player. Using a date-ranged
-- fee_exemptions row for this would either leak into future matches (if
-- left open-ended) or require fiddly date-bounding every time — see
-- features/post-match-scorecard.md §16.
--
-- Scoped strictly to (booking_id, player_id) — can never affect any other
-- match's fee application. Immutable audit log, same insert-only pattern
-- as booking_rule_overrides / wallet_transactions / scorecard_reconciliation_log.

CREATE TABLE IF NOT EXISTS match_fee_waivers (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id       uuid NOT NULL REFERENCES bookings(id) ON DELETE CASCADE,
  player_id        uuid NOT NULL REFERENCES players(id),
  reason           text NOT NULL CHECK (char_length(reason) BETWEEN 3 AND 300),
  -- waived_by is nullable for the same reason overridden_by is nullable on
  -- booking_rule_overrides: isAdmin comes from ADMIN_EMAILS, not a players
  -- row, so an admin's Gmail isn't guaranteed to match a players.id.
  -- waived_by_email is always present as the durable identity either way.
  waived_by        uuid REFERENCES players(id) ON DELETE SET NULL,
  waived_by_email  text NOT NULL,
  created_at       timestamptz NOT NULL DEFAULT now(),
  UNIQUE(booking_id, player_id)
);

CREATE INDEX IF NOT EXISTS idx_match_fee_waivers_booking_id
  ON match_fee_waivers(booking_id);

-- RLS — same blanket-deny pattern as every other table in this app. No
-- anon/authenticated policies; every read/write goes through
-- createServiceClient() in /api/fees/apply only.
ALTER TABLE match_fee_waivers ENABLE ROW LEVEL SECURITY;

COMMENT ON TABLE match_fee_waivers IS
  'Immutable audit log — one row per player waived from a single match''s fee application (e.g. announced but never batted/bowled). Never updated or deleted. Distinct from fee_exemptions, which is a standing, date-ranged, player-level flag.';
