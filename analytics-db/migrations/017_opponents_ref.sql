-- Migration: 017_opponents_ref
-- Canonical opponent identity mirrored from the Hub (opponents table; the Hub stays the source of
-- truth) so SQL can group matches by opponent without a cross-project join. match_dimensions
-- (015) already carries opponent_id; this adds the name and flags, and match_coverage exposes
-- them. Written by the Hub (src/lib/opponentMirror.ts) on every scorecard sync and on any
-- opponent create / edit / link / merge, plus a one-off backfill. See
-- .claude/rules/features/opponent-identity.md.

CREATE TABLE IF NOT EXISTS opponents_ref (
  opponent_id  uuid PRIMARY KEY,
  name         text NOT NULL,
  is_marquee   boolean NOT NULL DEFAULT false,
  auto_created boolean NOT NULL DEFAULT false,
  synced_at    timestamptz NOT NULL DEFAULT now()
);
COMMENT ON TABLE opponents_ref IS 'Mirror of Hub opponents (id, canonical name, marquee, auto_created). Not a source of truth.';
ALTER TABLE opponents_ref ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON opponents_ref FROM anon, authenticated;

-- match_coverage gains the canonical opponent (columns appended, so CREATE OR REPLACE is valid).
CREATE OR REPLACE VIEW match_coverage
WITH (security_invoker = true) AS
SELECT m.match_id, m.match_date, m.opponent_name, m.tournament_name, m.match_type AS stage,
       d.format, COALESCE(d.is_practice, false) AS is_practice, d.booking_id,
       (d.match_id IS NOT NULL) AS hub_linked,
       COALESCE(v.innings_loaded, 0) AS innings_loaded,
       COALESCE(v.innings_reconciled, 0) AS innings_reconciled,
       CASE
         WHEN COALESCE(v.innings_loaded, 0) = 0 THEN 'none'
         WHEN v.innings_loaded = 2 AND v.innings_reconciled = 2 THEN 'complete'
         WHEN v.innings_reconciled < v.innings_loaded THEN 'mismatch'
         ELSE 'partial'
       END AS bbb_status,
       d.opponent_id,
       r.name AS opponent_canonical
FROM match_stats m
LEFT JOIN match_dimensions d USING (match_id)
LEFT JOIN opponents_ref r ON r.opponent_id = d.opponent_id
LEFT JOIN (
  SELECT match_id, count(*) AS innings_loaded,
         count(*) FILTER (WHERE status = 'reconciled') AS innings_reconciled
  FROM ball_by_ball_validation GROUP BY match_id
) v USING (match_id);
REVOKE ALL ON match_coverage FROM anon, authenticated;
