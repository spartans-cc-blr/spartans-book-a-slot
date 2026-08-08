-- Migration: 059_milestone_achievements
-- "Club recognition" milestones — a player's current-year runs / wickets /
-- fielding dismissals crossing a fixed threshold (500/750/1000 runs,
-- 50/75/100 wickets, 50/75/100 dismissals). Detected in
-- src/lib/milestones.ts, called from src/lib/matchStatsSync.ts as the last
-- step of every scorecard sync — manual upload/"Sync Stats" click or the
-- unattended automated backfill/cron path alike (see
-- features/post-match-scorecard.md).
--
-- One row per (player, milestone_type, milestone_value, year) — the UNIQUE
-- constraint is the idempotency guard: a re-sync (reconciliation, a stale
-- match_stats_cache fix) can never double-log an already-recorded
-- milestone. `achieved_at` is when it was first detected, not necessarily
-- when the underlying match was played.

CREATE TABLE IF NOT EXISTS milestone_achievements (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  player_id       uuid NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  booking_id      uuid REFERENCES bookings(id) ON DELETE SET NULL,
  milestone_type  text NOT NULL CHECK (milestone_type IN ('runs', 'wickets', 'dismissals')),
  milestone_value integer NOT NULL,
  year            integer NOT NULL,
  achieved_at     timestamptz NOT NULL DEFAULT now(),
  UNIQUE (player_id, milestone_type, milestone_value, year)
);

CREATE INDEX IF NOT EXISTS milestone_achievements_achieved_at
  ON milestone_achievements (achieved_at);

ALTER TABLE milestone_achievements ENABLE ROW LEVEL SECURITY;
-- No anon/authenticated policies — service role only, consistent with platform pattern.

-- Per-player "seen" cursor for the club-wide recognition modal — every
-- signed-in player sees every achievement once, regardless of which page
-- they land on next, without a separate per-viewer join table. Defaults to
-- now() rather than NULL so this migration can never retroactively flood
-- every existing player with a backlog of "unseen" rows if it ever runs
-- after achievements already exist.
ALTER TABLE players
  ADD COLUMN IF NOT EXISTS milestones_seen_at timestamptz NOT NULL DEFAULT now();
