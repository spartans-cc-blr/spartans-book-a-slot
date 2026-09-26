-- Migration: 080_reservation_expiry_reminders
-- Idempotency + delivery-status log for the reservation-expiry-reminder
-- cron (/api/cron/reservation-expiry-reminders) — alerts admins before a
-- soft_block reservation (an organiser-held slot pending confirmation,
-- bookings.reserved_until) auto-expires, so they can nudge the organiser
-- via the existing "📲 Notify via WhatsApp" panel on
-- /admin/bookings/[id] before the slot silently releases. See
-- features/reservation-expiry-reminders.md.
--
-- One row per (booking_id, reminder_type, reserved_until) — reserved_until
-- is part of the key (not just booking_id + reminder_type) so that if an
-- admin edits/extends a reservation's own reserved_until, the previous
-- reminder rows (keyed to the old deadline) don't block a fresh set of
-- reminders against the new one. Same claim-before-send pattern as
-- availability_nudge_log (029/030) — the row is inserted status='pending'
-- before the push is attempted, and the UNIQUE constraint is what makes a
-- retried/overlapping cron run safe (a 23505 unique-violation means this
-- exact reminder was already sent, not a new failure).

CREATE TABLE IF NOT EXISTS reservation_expiry_reminders (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id     uuid NOT NULL REFERENCES bookings(id) ON DELETE CASCADE,
  reminder_type  text NOT NULL CHECK (reminder_type IN ('24h', '12h', '1h')),
  reserved_until timestamptz NOT NULL,
  status         text NOT NULL DEFAULT 'pending',
  error_message  text,
  created_at     timestamptz NOT NULL DEFAULT now(),
  UNIQUE (booking_id, reminder_type, reserved_until)
);

CREATE INDEX IF NOT EXISTS reservation_expiry_reminders_lookup
  ON reservation_expiry_reminders (booking_id, reserved_until);

ALTER TABLE reservation_expiry_reminders ENABLE ROW LEVEL SECURITY;
-- No anon/authenticated policies — service role only, consistent with platform pattern.
