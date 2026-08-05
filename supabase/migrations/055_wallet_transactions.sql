-- Migration: 055_wallet_transactions
-- Reconstructed, not newly applied — this table already exists live in
-- Supabase (referenced by 003_fix_rls.sql's RLS-enable statement and
-- already written to by /api/fees/apply) but its own CREATE TABLE was never
-- checked into this repo. Same drift pattern documented elsewhere in this
-- project (see features/gc-players.md §13, features/post-match-scorecard.md
-- §5/§13) — applied to the live DB directly, not committed at the time.
-- Reconstructed here from the live schema so a fresh environment matches
-- production. IF NOT EXISTS makes this safe to run against the existing
-- live database without effect.
--
-- Design: players.wallet_balance is the live current balance (updated on
-- every change); wallet_transactions is an append-only audit ledger of
-- every change made to it, not a running total to sum from scratch. Both
-- POST /api/wallet/transactions (admin-only wallet adjustments) and
-- /api/fees/apply (match fee debits) write a row here and then update
-- players.wallet_balance to match, in that order — see security.md §10 (S-1).
--
-- Note: an existing view, player_wallet_summary, assumes a different model
-- (wallet_balance as a fixed "seed" plus a summed ledger on top) and is
-- NOT used by any app code (confirmed in 036_security_invoker_audit_wallet_views.sql's
-- own comment) — left alone, not a live dependency, not reconciled here.

CREATE TABLE IF NOT EXISTS wallet_transactions (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  player_id   uuid NOT NULL REFERENCES players(id),
  booking_id  uuid REFERENCES bookings(id),
  type        text NOT NULL CHECK (type IN ('debit', 'credit')),
  amount      numeric NOT NULL,
  reason      text NOT NULL,
  notes       text,
  created_by  text,
  created_at  timestamptz DEFAULT now()
);

-- RLS — same blanket-deny pattern as every other table in this app. Already
-- enabled live via 003_fix_rls.sql; restated here so a fresh environment
-- built from this migration alone ends up in the same state.
ALTER TABLE wallet_transactions ENABLE ROW LEVEL SECURITY;

COMMENT ON TABLE wallet_transactions IS
  'Immutable ledger — one row per wallet_balance change, written by POST /api/wallet/transactions (admin adjustments) and /api/fees/apply (match fee debits). Never updated or deleted.';
