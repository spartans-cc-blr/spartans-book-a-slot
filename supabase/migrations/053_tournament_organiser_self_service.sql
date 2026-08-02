-- Migration: 053_tournament_organiser_self_service
-- Per-tournament opt-in switch for the public organiser self-service flow
-- on /tournament-planner/share/[tournamentId] — off by default, so every
-- existing tournament's share link keeps behaving exactly as it does today
-- (WhatsApp enquiry only) until an admin explicitly enables it.

ALTER TABLE tournaments
  ADD COLUMN IF NOT EXISTS organiser_self_service boolean NOT NULL DEFAULT false;
