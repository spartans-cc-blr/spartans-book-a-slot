-- Migration: 030_availability_nudge_log_delivery_status
-- availability_nudge_log currently records "did we attempt a nudge", not
-- "did the player actually receive it" — the row is inserted before
-- sendPushToPlayer() is awaited, so a push failure (expired subscription,
-- webpush API error, transient network issue) still leaves a row claiming
-- success, and the UNIQUE(player_id, nudge_date) constraint then blocks any
-- resend attempt for that player that day even though nothing was delivered.
--
-- Adds a delivery-status column so failures are visible instead of silently
-- masquerading as sends. Application-level enum ('pending' | 'sent' |
-- 'failed') — no DB CHECK constraint, consistent with the rest of this
-- schema's convention of app-level validation over DB constraints.
--
-- A 'failed' row still counts against the daily UNIQUE(player_id, nudge_date)
-- cap (no same-day retry) — the smaller change, and it still solves the
-- actual bug here: a false "success" row masking a real delivery failure.

ALTER TABLE availability_nudge_log
  ADD COLUMN status        text NOT NULL DEFAULT 'pending',
  ADD COLUMN error_message text;
