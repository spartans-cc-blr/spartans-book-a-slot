-- Migration: 065_birthday_wishes_seen_date
-- Per-player "seen" cursor for the club-wide birthday wishes broadcast
-- modal (src/components/birthdays/BirthdayWishesModal.tsx). A birthday is
-- a recurring calendar event, not a one-time detected achievement like
-- milestone_achievements/match_performance_achievements — so this is a
-- plain date, not a timestamp, and there is no separate achievement/log
-- table: "today's birthdays" is derived fresh on every request from
-- players.dob (see src/lib/birthdays.ts), and this column only tracks
-- whether the signed-in viewer has already dismissed today's modal.
--
-- Nullable, no backfill needed — NULL just means "hasn't seen a birthday
-- wishes modal yet" for both new and pre-existing players, which is
-- correct either way (the feature starts wishing from the day this ships,
-- not retroactively).
ALTER TABLE players
  ADD COLUMN IF NOT EXISTS birthday_wishes_seen_date date;
