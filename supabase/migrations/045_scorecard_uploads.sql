-- Migration: 045_scorecard_uploads
-- Tracks scorecard upload/parse/sync/fee lifecycle per booking, whether the
-- scorecard arrived via manual upload or the automated CricHeroes fetch
-- pipeline (see scorecardBackfill.ts). One row per booking. Status
-- progresses forward-only: pending_parse -> parsed -> synced -> fees_applied.
--
-- Reconstructed from the live schema — this migration was applied directly
-- via Supabase MCP on 2026-07-14 and was never checked into this repo until
-- now. See 044_match_stats_cache.sql for the same note.

CREATE TYPE scorecard_status AS ENUM (
  'pending_parse',   -- PDF sent to microservice, awaiting parse
  'parsed',          -- stats written to analytics DB, awaiting sync
  'synced',          -- stats synced into match_stats_cache (manual admin
                      -- action, or automatic when the backfill/cron path
                      -- parsed it — see matchStatsSync.ts)
  'fees_applied'      -- admin applied match fees, wallets debited — always
                      -- a separate, explicit, manual action; never automated
);

CREATE TABLE IF NOT EXISTS scorecard_uploads (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id      uuid NOT NULL REFERENCES bookings(id) ON DELETE CASCADE,
  match_id        text,                          -- from bookings.match_id

  status          scorecard_status NOT NULL DEFAULT 'pending_parse',

  uploaded_by     uuid REFERENCES players(id) ON DELETE SET NULL,
  uploaded_at     timestamptz NOT NULL DEFAULT now(),
  fees_applied_at timestamptz,
  fees_applied_by uuid REFERENCES players(id) ON DELETE SET NULL,

  error_message   text,          -- populated if the parse or sync step fails

  UNIQUE (booking_id)            -- one upload record per match
);

COMMENT ON TABLE scorecard_uploads IS
  'Tracks the lifecycle of scorecard upload and processing per booking.';
