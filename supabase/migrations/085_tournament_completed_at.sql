-- Explicit, admin-set "this tournament is finished" marker. Never set
-- automatically — league game counts can't tell whether knockouts follow.
-- See .claude/rules/features/tournament-planner.md §12.
ALTER TABLE tournaments ADD COLUMN IF NOT EXISTS completed_at date;

-- One-off: pre-dated tournaments being backfilled whose last confirmed game
-- is before 2026 are closed as of that last game, even if league games are
-- missing from bookings.
UPDATE tournaments t
SET completed_at = l.last_game
FROM (
  SELECT tournament_id, max(game_date) AS last_game
  FROM bookings
  WHERE status = 'confirmed' AND tournament_id IS NOT NULL
  GROUP BY tournament_id
  HAVING max(game_date) < DATE '2026-01-01'
) l
WHERE t.id = l.tournament_id AND t.completed_at IS NULL AND t.is_practice = false;
