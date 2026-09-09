-- Migration: 074_wallet_transfers
-- Player-to-player wallet transfers — admin-recorded sponsorships (a
-- player covers another player's dues/fees out of their own wallet). See
-- src/app/api/wallet/transfers/route.ts and features/wallet-ledger.md §14.
--
-- Every transfer produces exactly two wallet_transactions rows — a debit
-- on the sponsor, a credit on the beneficiary, same amount — same as
-- every other wallet change in this app, never a raw balance edit. This
-- table exists purely to link those two ledger rows together as one
-- logical event (mirrors membership_fee_charges linking its own charge
-- row to the wallet_transactions row it produced) — nothing reads it to
-- derive a balance; players.wallet_balance and wallet_transactions stay
-- the sole source of truth for money.
--
-- Admin-only, like every other wallet-balance-changing action in this
-- app — no player has ever been able to move money themselves, including
-- their own, and this doesn't change that.

CREATE TABLE IF NOT EXISTS wallet_transfers (
  id                         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sponsor_player_id          uuid NOT NULL REFERENCES players(id),
  beneficiary_player_id      uuid NOT NULL REFERENCES players(id),
  amount                     numeric NOT NULL,
  reason                     text NOT NULL,
  sponsor_transaction_id     uuid REFERENCES wallet_transactions(id) ON DELETE SET NULL,
  beneficiary_transaction_id uuid REFERENCES wallet_transactions(id) ON DELETE SET NULL,
  created_by                 text NOT NULL,
  created_at                 timestamptz NOT NULL DEFAULT now(),
  CHECK (sponsor_player_id != beneficiary_player_id)
);

-- RLS — same blanket-deny pattern as every other table in this app.
ALTER TABLE wallet_transfers ENABLE ROW LEVEL SECURITY;

COMMENT ON TABLE wallet_transfers IS
  'Admin-recorded player-to-player wallet transfers (sponsorships) — links the debit (sponsor) and credit (beneficiary) wallet_transactions rows a transfer produces. Never itself a source of balance truth.';
