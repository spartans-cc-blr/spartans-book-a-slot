-- Migration: 051_scorecard_verification_reconciliation
-- Lets a captain/VC (own booking) or wrangler/admin (any booking) do two
-- independent, orthogonal things after eyeballing a synced scorecard
-- against the real CricHeroes page:
--   1. Mark it verified — a confidence flag, no reprocessing.
--   2. Flag it for reconciliation with a note explaining what looks wrong —
--      this re-queues the booking into the existing scorecard backfill
--      pipeline (see src/lib/scorecardBackfill.ts) regardless of its
--      current status, INCLUDING fees_applied (fees themselves are never
--      touched or reversed by this).
--
-- Both are layered on top of the existing forward-only
-- pending_parse -> parsed -> synced -> fees_applied status column, which is
-- left completely untouched by this migration.

ALTER TABLE scorecard_uploads
  ADD COLUMN verified                  boolean NOT NULL DEFAULT false,
  ADD COLUMN verified_by               uuid REFERENCES players(id) ON DELETE SET NULL,
  ADD COLUMN verified_at               timestamptz,
  ADD COLUMN needs_reconciliation      boolean NOT NULL DEFAULT false,
  ADD COLUMN reconciliation_note       text,
  ADD COLUMN reconciliation_flagged_by uuid REFERENCES players(id) ON DELETE SET NULL,
  ADD COLUMN reconciliation_flagged_at timestamptz;

-- Immutable audit trail — same insert-only pattern as availability_audit.
-- Survives across repeated flag/resolve cycles on the same booking, which
-- the single-row columns above can't (they only ever hold the latest state).
CREATE TABLE IF NOT EXISTS scorecard_reconciliation_log (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id  uuid NOT NULL REFERENCES bookings(id) ON DELETE CASCADE,
  action      text NOT NULL CHECK (action IN ('flagged', 'resolved')),
  note        text,
  actor_id    uuid REFERENCES players(id) ON DELETE SET NULL, -- null = system (auto-resolved by a successful re-sync)
  created_at  timestamptz NOT NULL DEFAULT now()
);

-- RLS — same blanket-deny pattern as every other table in this app (see
-- 046_enable_rls_scorecard_tables.sql). No anon/authenticated policies;
-- every read/write goes through createServiceClient() in API routes only.
ALTER TABLE scorecard_reconciliation_log ENABLE ROW LEVEL SECURITY;

COMMENT ON COLUMN scorecard_uploads.needs_reconciliation IS
  'Set by a captain/VC/wrangler/admin after manually checking synced stats against CricHeroes and finding a discrepancy. Widens scorecard backfill eligibility (cron + admin page) to reprocess this booking regardless of status. Auto-cleared by scorecardBackfill.ts on the next successful re-sync.';
