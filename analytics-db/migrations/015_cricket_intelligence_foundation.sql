-- Migration: 015_cricket_intelligence_foundation
-- Foundation for contextual cricket analytics (see
-- .claude/rules/features/cricket-intelligence-foundation.md):
--   match_dimensions        Hub-side match context (format, practice, stage, ...) mirrored here so
--                           SQL can answer contextual questions without a cross-project join.
--                           Written by syncMatchStatsForBooking() in the Hub.
--   phase_definitions       Configurable phase boundaries per match length (data, not code).
--                           Mirrors PHASE_PLANS in src/lib/ballByBall.ts, edit both together.
--   ball_by_ball_validation Per match + innings: ball-by-ball totals vs the scorecard.
--   match_coverage          Every match, with its ball-by-ball / validation status.
--   match_state             One row per delivery: the state of the innings AFTER that ball,
--                           derived from ball_by_ball (never stored).
-- All views are security_invoker and revoked from anon/authenticated (same as 013).

CREATE TABLE IF NOT EXISTS match_dimensions (
  match_id     text PRIMARY KEY REFERENCES match_stats(match_id) ON DELETE CASCADE,
  booking_id   uuid,
  format       text,
  total_overs  integer,
  stage_type   text,
  is_practice  boolean NOT NULL DEFAULT false,
  tournament_id uuid,
  ground_id    uuid,
  opponent_id  uuid,
  synced_at    timestamptz NOT NULL DEFAULT now()
);
COMMENT ON TABLE match_dimensions IS 'Hub bookings/tournaments context for a match (not a source of truth: the Hub DB is). Upserted by the Hub on every scorecard sync. total_overs is derived from format (T20 -> 20).';
ALTER TABLE match_dimensions ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS phase_definitions (
  total_overs integer NOT NULL,
  phase       text    NOT NULL CHECK (phase IN ('pp','mid','death')),
  over_from   integer NOT NULL,
  over_to     integer NOT NULL,
  PRIMARY KEY (total_overs, phase)
);
COMMENT ON TABLE phase_definitions IS 'Club phase boundaries (1-based, inclusive overs) per match length. Mirrors PHASE_PLANS in src/lib/ballByBall.ts. Lengths with no row have no phase.';
ALTER TABLE phase_definitions ENABLE ROW LEVEL SECURITY;

INSERT INTO phase_definitions (total_overs, phase, over_from, over_to) VALUES
  (20, 'pp', 1, 6),  (20, 'mid', 7, 15),  (20, 'death', 16, 20),
  (30, 'pp', 1, 8),  (30, 'mid', 9, 23),  (30, 'death', 24, 30)
ON CONFLICT (total_overs, phase) DO NOTHING;

-- Reconciliation of each loaded innings against the scorecard totals.
DROP VIEW IF EXISTS ball_by_ball_validation;
CREATE VIEW ball_by_ball_validation
WITH (security_invoker = true) AS
WITH agg AS (
  SELECT match_id, batting_side,
         min(innings)                          AS innings,
         count(*)                              AS balls,
         count(*) FILTER (WHERE is_legal)      AS legal_balls,
         sum(runs_total)                       AS bbb_runs,
         max(wickets_after)                    AS bbb_wickets,
         max(score_after)                      AS last_score
  FROM ball_by_ball
  GROUP BY match_id, batting_side
)
SELECT a.match_id, a.batting_side, a.innings, a.balls, a.legal_balls,
       a.bbb_runs, a.bbb_wickets,
       CASE a.batting_side WHEN 'spartans' THEN m.team_total    ELSE m.opponent_total   END AS scorecard_runs,
       CASE a.batting_side WHEN 'spartans' THEN m.team_wickets  ELSE m.opponent_wickets END AS scorecard_wickets,
       (a.bbb_runs = a.last_score)                                                       AS running_score_consistent,
       u.validation_ok                                                                   AS upload_validation_ok,
       COALESCE(jsonb_array_length(u.warnings), 0)                                       AS upload_warning_count,
       CASE
         WHEN CASE a.batting_side WHEN 'spartans' THEN m.team_total ELSE m.opponent_total END IS NULL THEN 'no_scorecard'
         WHEN a.bbb_runs = CASE a.batting_side WHEN 'spartans' THEN m.team_total ELSE m.opponent_total END
          AND a.bbb_wickets = CASE a.batting_side WHEN 'spartans' THEN m.team_wickets ELSE m.opponent_wickets END
          AND a.bbb_runs = a.last_score THEN 'reconciled'
         ELSE 'mismatch'
       END AS status
FROM agg a
JOIN match_stats m USING (match_id)
LEFT JOIN commentary_uploads u ON u.match_id = a.match_id AND u.batting_side = a.batting_side;

-- Every match with its ball-by-ball status (what still needs a commentary upload).
DROP VIEW IF EXISTS match_coverage;
CREATE VIEW match_coverage
WITH (security_invoker = true) AS
SELECT m.match_id, m.match_date, m.opponent_name, m.tournament_name, m.match_type AS stage,
       d.format, COALESCE(d.is_practice, false) AS is_practice, d.booking_id,
       (d.match_id IS NOT NULL)                                            AS hub_linked,
       COALESCE(v.innings_loaded, 0)                                       AS innings_loaded,
       COALESCE(v.innings_reconciled, 0)                                   AS innings_reconciled,
       CASE
         WHEN COALESCE(v.innings_loaded, 0) = 0 THEN 'none'
         WHEN v.innings_loaded = 2 AND v.innings_reconciled = 2 THEN 'complete'
         WHEN v.innings_reconciled < v.innings_loaded THEN 'mismatch'
         ELSE 'partial'
       END AS bbb_status
FROM match_stats m
LEFT JOIN match_dimensions d USING (match_id)
LEFT JOIN (
  SELECT match_id, count(*) AS innings_loaded,
         count(*) FILTER (WHERE status = 'reconciled') AS innings_reconciled
  FROM ball_by_ball_validation GROUP BY match_id
) v USING (match_id);

-- State of the innings AFTER each delivery. Derived, never stored.
--   target / required rate only for the chasing innings (innings 2), from the scorecard total of
--   the side that batted first (so it works even if innings 1 commentary isn't loaded).
--   Phase and balls remaining need match_dimensions.total_overs; NULL when the match has no
--   Hub link or its length has no phase_definitions row.
DROP VIEW IF EXISTS match_state;
CREATE VIEW match_state
WITH (security_invoker = true) AS
WITH b AS (
  SELECT bb.*,
         count(*) FILTER (WHERE bb.is_legal) OVER (
           PARTITION BY bb.match_id, bb.batting_side ORDER BY bb.seq
         ) AS legal_balls_bowled
  FROM ball_by_ball bb
)
SELECT b.match_id, b.innings, b.batting_side, b.seq, b.over_no, b.ball_in_over, b.is_legal,
       b.batter, b.bowler, b.runs_total, b.is_wicket,
       b.score_after, b.wickets_after, b.legal_balls_bowled,
       d.total_overs,
       d.total_overs * 6 - b.legal_balls_bowled                         AS legal_balls_remaining,
       10 - b.wickets_after                                             AS wickets_remaining,
       CASE WHEN b.legal_balls_bowled > 0
            THEN round(b.score_after * 6.0 / b.legal_balls_bowled, 2) END AS run_rate,
       tgt.target,
       tgt.target - b.score_after                                       AS runs_required,
       CASE WHEN tgt.target IS NOT NULL AND d.total_overs * 6 - b.legal_balls_bowled > 0
            THEN round((tgt.target - b.score_after) * 6.0 / (d.total_overs * 6 - b.legal_balls_bowled), 2) END AS required_rate,
       p.phase
FROM b
JOIN match_stats m USING (match_id)
LEFT JOIN match_dimensions d USING (match_id)
LEFT JOIN LATERAL (
  SELECT CASE WHEN b.innings = 2
              THEN CASE b.batting_side WHEN 'spartans' THEN m.opponent_total ELSE m.team_total END + 1
         END AS target
) tgt ON true
LEFT JOIN phase_definitions p
  ON p.total_overs = d.total_overs AND b.over_no BETWEEN p.over_from AND p.over_to;

REVOKE ALL ON ball_by_ball_validation, match_coverage, match_state FROM anon, authenticated;
REVOKE ALL ON match_dimensions, phase_definitions FROM anon, authenticated;
