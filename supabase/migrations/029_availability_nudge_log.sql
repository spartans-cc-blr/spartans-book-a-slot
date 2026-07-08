-- Migration: 029_availability_nudge_log
-- Idempotency log for the Sun 8pm -> Wed 8pm availability nudge cron
-- (/api/cron/availability-nudge). One row per player per calendar day —
-- guarantees "max one notification per player per day" even if the cron
-- is retried or manually re-triggered, and lets the job look back at this
-- week's earlier nudges (e.g. Wednesday's deadline nudge reuses whichever
-- booking was referenced earlier in the week for that player).

CREATE TABLE IF NOT EXISTS availability_nudge_log (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  player_id   uuid NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  booking_id  uuid NOT NULL REFERENCES bookings(id) ON DELETE CASCADE,
  theme       text NOT NULL,
  nudge_date  date NOT NULL,
  created_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (player_id, nudge_date)
);

CREATE INDEX IF NOT EXISTS availability_nudge_log_lookup
  ON availability_nudge_log (player_id, nudge_date);

ALTER TABLE availability_nudge_log ENABLE ROW LEVEL SECURITY;
-- No anon/authenticated policies — service role only, consistent with platform pattern.
