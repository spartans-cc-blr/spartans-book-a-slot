-- Migration: 061_match_fee_waivers_units
-- Extends match_fee_waivers to record the actual number of fee "shares"
-- (units) an admin assigned a player when fees were applied, not just a
-- boolean waive. The admin fee-apply UI now uses a per-player stepper
-- (0-12 shares) instead of a plain waive checkbox — 0 units is the old
-- "waived" case, 1 unit is the default single share for a recognized
-- batting/bowling role, and >1 covers an additional share (e.g. a guest
-- player riding on a squad member's account). A row is only ever written
-- here when the final unit count diverges from the server-computed
-- default for that player, same "only log what actually diverged"
-- principle the table already used for waivers.

ALTER TABLE match_fee_waivers
  ADD COLUMN IF NOT EXISTS units integer NOT NULL DEFAULT 0 CHECK (units BETWEEN 0 AND 12);

COMMENT ON TABLE match_fee_waivers IS
  'Immutable audit log — one row per player whose fee share (in units) diverged from the server-computed default when a single match''s fee was applied. Never updated or deleted. Distinct from fee_exemptions, which is a standing, date-ranged, player-level flag.';

COMMENT ON COLUMN match_fee_waivers.units IS
  'Final number of fee shares assigned to this player at apply time (0 = excluded, 1 = default single share, >1 = covering additional shares e.g. a guest player).';
