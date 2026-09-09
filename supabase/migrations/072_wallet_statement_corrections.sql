-- Migration: 072_wallet_statement_corrections
-- Player Payment Ledger — bank-statement view + admin correction tooling.
--
-- Two additions layered on top of the existing wallet_transactions ledger
-- (055_wallet_transactions.sql) without weakening its append-only design:
--
-- 1. Opening balance ("Brought Forward"). wallet_transactions only ever
--    covers changes made since the ledger route shipped (or since
--    /api/fees/apply started writing to it) — a player's balance before
--    that point has no ledger rows behind it. GET /api/wallet/transactions
--    computes a default opening balance as
--    players.wallet_balance - sum(this player's wallet_transactions), so
--    the statement always ties out by construction with zero admin input.
--    wallet_opening_balance lets an admin override that computed default
--    (e.g. if it doesn't match their own paper/spreadsheet reconciliation,
--    or they want to attach a human-readable note) — NULL means "use the
--    computed default", which is the state for every player until an
--    admin explicitly sets one via PATCH /api/wallet/opening-balance.
--
-- 2. Historic corrections. wallet_transactions rows stay insert-only —
--    PATCH /api/wallet/transactions never does a raw, untracked UPDATE.
--    edited_at/edited_by mark a row as corrected; every edit's pre-edit
--    values are preserved in wallet_transaction_edits, mirroring the
--    availability_audit / scorecard_reconciliation_log convention already
--    used elsewhere in this app for "correctable in practice, immutable on
--    paper" records — see features/wallet-ledger.md.

ALTER TABLE players
  ADD COLUMN IF NOT EXISTS wallet_opening_balance numeric,
  ADD COLUMN IF NOT EXISTS wallet_opening_balance_note text,
  ADD COLUMN IF NOT EXISTS wallet_opening_balance_set_by text,
  ADD COLUMN IF NOT EXISTS wallet_opening_balance_set_at timestamptz;

ALTER TABLE wallet_transactions
  ADD COLUMN IF NOT EXISTS edited_at timestamptz,
  ADD COLUMN IF NOT EXISTS edited_by text;

CREATE TABLE IF NOT EXISTS wallet_transaction_edits (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  transaction_id uuid NOT NULL REFERENCES wallet_transactions(id) ON DELETE CASCADE,
  edited_by      text NOT NULL,
  edit_reason    text NOT NULL,
  old_type       text NOT NULL,
  old_amount     numeric NOT NULL,
  old_reason     text NOT NULL,
  old_notes      text,
  old_created_at timestamptz NOT NULL,
  created_at     timestamptz NOT NULL DEFAULT now()
);

-- RLS — same blanket-deny pattern as every other table in this app.
ALTER TABLE wallet_transaction_edits ENABLE ROW LEVEL SECURITY;

COMMENT ON COLUMN players.wallet_opening_balance IS
  'Admin override for the wallet statement''s "Brought Forward" line. NULL = auto-computed as wallet_balance minus the sum of this player''s wallet_transactions (the default for every player).';

COMMENT ON TABLE wallet_transaction_edits IS
  'Immutable audit trail for admin corrections to wallet_transactions rows (PATCH /api/wallet/transactions) — one row per edit, capturing pre-edit values. wallet_transactions itself is never deleted or blindly overwritten; edited_at/edited_by on the row just flag it as corrected, same posture as scorecard_reconciliation_log.';
