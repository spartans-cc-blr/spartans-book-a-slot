-- Penalty runs (e.g. 5 awarded for a fielding-side offence) are on the scorecard total but are not
-- a delivery, so they never appear in the printed commentary. Record them per uploaded innings so the
-- reconciliation compares commentary runs + penalty runs with the scorecard.
ALTER TABLE commentary_uploads
  ADD COLUMN IF NOT EXISTS penalty_runs integer NOT NULL DEFAULT 0 CHECK (penalty_runs >= 0),
  ADD COLUMN IF NOT EXISTS penalty_note text;

-- Same view as 015 with the status test using bbb_runs + penalty_runs. New column goes last so
-- CREATE OR REPLACE works without dropping match_coverage, which depends on this view.
CREATE OR REPLACE VIEW ball_by_ball_validation
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
         WHEN a.bbb_runs + COALESCE(u.penalty_runs, 0) = CASE a.batting_side WHEN 'spartans' THEN m.team_total ELSE m.opponent_total END
          AND a.bbb_wickets = CASE a.batting_side WHEN 'spartans' THEN m.team_wickets ELSE m.opponent_wickets END
          AND a.bbb_runs = a.last_score THEN 'reconciled'
         ELSE 'mismatch'
       END AS status,
       COALESCE(u.penalty_runs, 0)                                                       AS penalty_runs
FROM agg a
JOIN match_stats m USING (match_id)
LEFT JOIN commentary_uploads u ON u.match_id = a.match_id AND u.batting_side = a.batting_side;
