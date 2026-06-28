-- 027_backfill_tournament_captains.sql
-- Backfill tournaments.captain_id from the dominant captain in existing bookings.
-- Only updates tournaments where captain_id is still NULL.
-- Extreme Cricket Summer Cup Season 1 already has captain_id set — skipped by WHERE clause.
WITH dominant AS (
  SELECT
    b.tournament_id,
    MODE() WITHIN GROUP (ORDER BY b.captain_id) AS dominant_captain_id
  FROM bookings b
  WHERE b.status = 'confirmed'
    AND b.tournament_id IS NOT NULL
    AND b.captain_id IS NOT NULL
  GROUP BY b.tournament_id
)
UPDATE tournaments t
SET captain_id = d.dominant_captain_id
FROM dominant d
WHERE t.id = d.tournament_id
  AND t.captain_id IS NULL;
