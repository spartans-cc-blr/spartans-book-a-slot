-- Admin answer to "did we qualify / is there still a chance?": the date the
-- admin said we're still in the running and waiting on the next stage.
-- Only applies while no game newer than this date has been played, so it
-- resets itself — see .claude/rules/features/tournament-planner.md §12.
ALTER TABLE tournaments ADD COLUMN IF NOT EXISTS awaiting_next_stage_since date;
