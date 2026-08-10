-- Migration: 062_scorecard_uploads_fees_reconciled_externally
-- Every match before the 8 Aug 2026 weekend had its fees already collected
-- through the legacy Hub Google Sheets export/import process, never through
-- the Hub's own wallet system — POST /api/fees/apply and wallet_transactions
-- only went live for real starting that weekend. Without this flag, the
-- "Apply Match Fee" shortcut (dashboard Past tab + the fees-only view of
-- /admin/bookings/[id]) would offer to apply fees on ~92 already-settled
-- historic matches going back to April 2025, which would double-charge
-- every player on every one of them.
--
-- fees_reconciled_externally is independent of `status` — a match can be
-- `synced` (scorecard parsed fine) and still be ineligible for Hub fee
-- application because the money already moved outside the Hub. Checked by
-- POST /api/fees/apply (blocks both the dry-run preview and the real
-- apply) and by the admin UI (hides the checklist/Apply button and the
-- dashboard shortcut), so a direct URL/API hit can't bypass the same rule
-- the button's absence implies.

ALTER TABLE scorecard_uploads
  ADD COLUMN IF NOT EXISTS fees_reconciled_externally boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN scorecard_uploads.fees_reconciled_externally IS
  'True when this match''s fees were already collected outside the Hub (legacy Google Sheets reconciliation) — blocks POST /api/fees/apply and hides the Apply Match Fee shortcut, regardless of scorecard status. Backfilled true for every booking before the 8 Aug 2026 cutover weekend; false (default) for anything from that weekend onward.';

-- One-time, deterministic backfill — every past booking strictly before the
-- cutover weekend is marked externally reconciled. 8/9 Aug 2026 itself and
-- everything after stays eligible (false, the column default).
UPDATE scorecard_uploads su
SET fees_reconciled_externally = true
FROM bookings b
WHERE b.id = su.booking_id
  AND b.game_date < '2026-08-08';
