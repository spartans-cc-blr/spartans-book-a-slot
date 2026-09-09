-- Migration: 075_match_fee_corrections
-- Audit trail for PATCH /api/fees/apply — correcting an already-applied
-- match's fee split at the match level (recomputing the per-player share
-- and adjusting every affected squad member's wallet), rather than an
-- admin manually editing one player's wallet_transactions row at a time
-- via PATCH /api/wallet/transactions.
--
-- One row per correction *event* — not per player. Each affected player's
-- own before/after is captured in the `changes` jsonb array here, and
-- separately as its own self-descriptive adjusting wallet_transactions row
-- (a fresh debit/credit for exactly the difference, booking_id-tagged —
-- never a mutation of the original debit rows, keeping the ledger
-- append-only). This table is the "why was this match's fee revisited"
-- record; wallet_transactions stays the source of truth for money moved.
--
-- See features/post-match-scorecard.md §6.1.

CREATE TABLE IF NOT EXISTS match_fee_corrections (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id          uuid NOT NULL REFERENCES bookings(id) ON DELETE CASCADE,
  base_fee            numeric NOT NULL,
  total_before        numeric NOT NULL,
  total_after         numeric NOT NULL,
  -- Array of { player_id, name, old_fee, new_fee, action } — one entry per
  -- player whose share actually changed in this correction pass.
  changes             jsonb NOT NULL,
  -- corrected_by is nullable for the same reason overridden_by is nullable
  -- on booking_rule_overrides / waived_by is nullable on match_fee_waivers:
  -- isAdmin comes from ADMIN_EMAILS, not a players row, so an admin's
  -- Gmail isn't guaranteed to match a players.id. corrected_by_email is
  -- always present as the durable identity either way.
  corrected_by        uuid REFERENCES players(id) ON DELETE SET NULL,
  corrected_by_email  text NOT NULL,
  correction_reason   text NOT NULL CHECK (char_length(correction_reason) BETWEEN 3 AND 300),
  created_at          timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_match_fee_corrections_booking_id
  ON match_fee_corrections(booking_id);

-- RLS — same blanket-deny pattern as every other table in this app. No
-- anon/authenticated policies; every read/write goes through
-- createServiceClient() in /api/fees/apply only.
ALTER TABLE match_fee_corrections ENABLE ROW LEVEL SECURITY;

COMMENT ON TABLE match_fee_corrections IS
  'Immutable audit log — one row per match-level fee correction event (PATCH /api/fees/apply). Never updated or deleted. The per-player adjusting entries this produces live in wallet_transactions itself; this table is the summary of why the correction happened.';
