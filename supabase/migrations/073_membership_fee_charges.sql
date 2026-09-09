-- Migration: 073_membership_fee_charges
-- Quarterly membership fee (₹250) — see src/lib/membershipFee.ts and
-- features/wallet-ledger.md §13 for the full design.
--
-- One row per player per calendar quarter they were charged in.
-- UNIQUE(player_id, year, quarter) is the real idempotency guard — the
-- charge row is inserted (a plain INSERT, never upsert) before any wallet
-- debit happens, so a concurrent or duplicate scorecard sync can't double-
-- charge: only the insert that doesn't hit the unique violation is allowed
-- to proceed to actually touch players.wallet_balance.
--
-- wallet_transaction_id links to the ledger row this charge produced —
-- nullable because the charge row is claimed first, before that ledger row
-- exists yet (see membershipFee.ts's chargeOnePlayer()).
--
-- booking_id records which match triggered the charge (informational only —
-- this table's own FK, not the wallet_transactions row's, which
-- deliberately omits booking_id to avoid colliding with
-- /api/fees/apply's "has this booking's fee already been applied" guard).

CREATE TABLE IF NOT EXISTS membership_fee_charges (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  player_id             uuid NOT NULL REFERENCES players(id),
  booking_id            uuid REFERENCES bookings(id) ON DELETE SET NULL,
  wallet_transaction_id uuid REFERENCES wallet_transactions(id) ON DELETE SET NULL,
  year                  integer NOT NULL,
  quarter               integer NOT NULL CHECK (quarter BETWEEN 1 AND 4),
  amount                numeric NOT NULL,
  created_at            timestamptz NOT NULL DEFAULT now(),
  UNIQUE (player_id, year, quarter)
);

-- RLS — same blanket-deny pattern as every other table in this app.
ALTER TABLE membership_fee_charges ENABLE ROW LEVEL SECURITY;

COMMENT ON TABLE membership_fee_charges IS
  'One row per player per calendar quarter charged the quarterly membership fee. UNIQUE(player_id, year, quarter) is the idempotency guard — see src/lib/membershipFee.ts.';
