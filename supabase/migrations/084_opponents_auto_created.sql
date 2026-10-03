-- Migration: 084_opponents_auto_created
-- Opponents created automatically from an unrecognised booking spelling (instead of waiting in
-- the /opponents unlinked queue) are flagged so the master list can hide them by default and a
-- manager can later merge duplicates (POST /api/opponents/merge). A manager editing, starring or
-- creating an opponent by hand clears / never sets the flag. See
-- .claude/rules/features/opponent-identity.md.

ALTER TABLE opponents
  ADD COLUMN IF NOT EXISTS auto_created boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN opponents.auto_created IS 'True when created automatically from a raw booking spelling; false for hand-created/reviewed opponents.';
