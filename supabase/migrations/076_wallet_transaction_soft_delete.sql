-- Migration: 076_wallet_transaction_soft_delete
-- Player Payment Ledger — admin ability to remove a wallet_transactions
-- row entirely from a player's statement, without actually breaking this
-- app's append-only ledger convention.
--
-- Reported gap: an admin needed to remove a mistaken entry outright (not
-- just correct its amount/reason via PATCH /api/wallet/transactions),
-- e.g. a duplicate top-up or a debit that should never have existed at
-- all — see features/wallet-ledger.md §3.1.
--
-- Same posture as everywhere else in this app: nothing is ever physically
-- DELETEd from wallet_transactions (that would also cascade-delete any
-- wallet_transaction_edits rows referencing it via ON DELETE CASCADE,
-- destroying its own audit trail). Instead, DELETE /api/wallet/transactions
-- soft-deletes — it stamps deleted_at/deleted_by/delete_reason on the row
-- and reverses its balance effect, but the row itself, and everything it
-- ever said, stays in the database, inspectable directly if ever needed.
-- Every read this app does against wallet_transactions (the player
-- statement, the admin club-wide feed, the opening-balance ledger sum)
-- filters deleted_at IS NULL.

ALTER TABLE wallet_transactions
  ADD COLUMN IF NOT EXISTS deleted_at timestamptz,
  ADD COLUMN IF NOT EXISTS deleted_by text,
  ADD COLUMN IF NOT EXISTS delete_reason text;

COMMENT ON COLUMN wallet_transactions.deleted_at IS
  'Soft-delete marker set by DELETE /api/wallet/transactions (admin-only). The row is never physically removed — its balance effect is reversed and it is filtered out of every statement/feed read, but it remains inspectable directly. NULL = active (the default for every row).';
