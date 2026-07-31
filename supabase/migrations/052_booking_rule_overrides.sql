-- Migration: 052_booking_rule_overrides
-- Immutable audit log for admin-only overrides of the R1-R6 booking rules
-- engine (src/lib/validation.ts). Admins book every game themselves, and a
-- real rule conflict can legitimately need to be pushed through ahead of an
-- organiser confirming a clashing game's removal (e.g. a knockout/semifinal
-- that's certain to happen, booked in the same day/slot family as a game
-- still pending cancellation) — this table captures *why* whenever that
-- happens, per rule, per booking. One row per overridden rule per booking
-- (a single confirm action can override more than one rule at once).

CREATE TABLE IF NOT EXISTS booking_rule_overrides (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id          uuid NOT NULL REFERENCES bookings(id) ON DELETE CASCADE,
  rule                text NOT NULL CHECK (rule IN ('R1','R2','R3','R4','R5','R6')),
  rule_message        text NOT NULL,   -- the exact rule-engine message that was overridden, frozen at override time
  reason              text NOT NULL CHECK (char_length(reason) BETWEEN 3 AND 500),
  -- overridden_by is nullable: isAdmin is derived from ADMIN_EMAILS (see
  -- security.md), not from a players row, so an admin's Gmail is not
  -- guaranteed to have a matching players.id. overridden_by_email is always
  -- present as the durable identity for this audit trail either way.
  overridden_by       uuid REFERENCES players(id) ON DELETE SET NULL,
  overridden_by_email text NOT NULL,
  created_at          timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_booking_rule_overrides_booking_id
  ON booking_rule_overrides(booking_id);

-- RLS — same blanket-deny pattern as every other table in this app (see
-- 046_enable_rls_scorecard_tables.sql / 051_scorecard_verification_reconciliation.sql).
-- No anon/authenticated policies; every read/write goes through
-- createServiceClient() in API routes only.
ALTER TABLE booking_rule_overrides ENABLE ROW LEVEL SECURITY;

COMMENT ON TABLE booking_rule_overrides IS
  'Immutable audit log — one row per R1-R6 rule an admin knowingly overrode while creating or editing a booking, with the reason they gave. Never updated or deleted except via booking cascade.';
