-- Migration: 060_match_performance_achievements
-- Single-match performance highlights, alongside the season-total
-- milestones in 059_milestone_achievements.sql: a century/half-century in
-- one innings, a five- or three-wicket haul in one spell, five-plus
-- fielding dismissals in one match. Detected in
-- src/lib/milestones.ts (detectAndLogMatchPerformances), called from
-- src/lib/matchStatsSync.ts alongside the season-milestone detection —
-- both feed the same club recognition modal (see
-- features/milestone-recognition.md).
--
-- Unlike milestone_achievements (deduped per player/type/value/YEAR — a
-- once-per-season event), this is deduped per player/BOOKING/type — a
-- player can rack up the same performance_type (e.g. two centuries) across
-- different matches in the same season, and each is its own row.

CREATE TABLE IF NOT EXISTS match_performance_achievements (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  player_id        uuid NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  booking_id       uuid REFERENCES bookings(id) ON DELETE SET NULL,
  performance_type text NOT NULL CHECK (performance_type IN ('century', 'half_century', 'five_wicket_haul', 'three_wicket_haul', 'five_dismissals')),
  value            integer NOT NULL, -- the exact runs/wickets/dismissals achieved, for display
  achieved_at      timestamptz NOT NULL DEFAULT now(),
  UNIQUE (player_id, booking_id, performance_type)
);

CREATE INDEX IF NOT EXISTS match_performance_achievements_achieved_at
  ON match_performance_achievements (achieved_at);

ALTER TABLE match_performance_achievements ENABLE ROW LEVEL SECURITY;
-- No anon/authenticated policies — service role only, consistent with platform pattern.
