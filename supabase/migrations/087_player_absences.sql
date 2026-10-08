-- Why a player is inactive. players.status is cron-managed (active/inactive from
-- recent availability) and records no reason, so this append-only table holds it.
-- The newest row per player is the current state; reason NULL = cleared.
-- Written by captains/GC/admin from the Inactive tab on /players.
-- See .claude/rules/features/player-directory.md §8.
CREATE TABLE IF NOT EXISTS player_absences (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  player_id       uuid NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  reason          text CHECK (reason IN ('injured','family_personal','work_abroad','left_club','unknown')),
  expected_return date,
  note            text,
  recorded_by     uuid REFERENCES players(id) ON DELETE SET NULL,
  recorded_by_email text,
  created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS player_absences_player_created_idx
  ON player_absences (player_id, created_at DESC);

-- Sensitive (injury / family): service role only, no anon/authenticated policies.
ALTER TABLE player_absences ENABLE ROW LEVEL SECURITY;
