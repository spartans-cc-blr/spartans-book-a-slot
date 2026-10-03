-- Migration: 016_player_match_context
-- One row per batter per innings that has ball-by-ball data: the state of the innings when the
-- batter first faced a ball (entry), the state when they left (exit), and their performance in
-- between. Built on match_state (015). See features/cricket-intelligence-foundation.md.
--
-- Definitions (approximations are deliberate and documented):
--   entry   = state BEFORE the first ball the batter faced. A batter who only stood at the
--             non-striker's end without facing never appears.
--   exit    = state after the delivery that dismissed them (matched on dismissed_batter), else
--             the end of the innings (not out).
--   runs    = runs_bat, except a delivery whose outcome mentions a bye is counted as 0 bat runs
--             (the commentary parser can record "(no ball) bye, 4 runs" as 4 bat runs).
--   fours/sixes = only outcomes the commentary marks FOUR / SIX (a ball run for 4 is not a boundary).
--   position_by_appearance = order of first ball faced in the innings, NOT the scorecard number.
--   balls_faced = every delivery except wides.
-- Entry/exit required rates exist only for innings 2 and need match_dimensions.total_overs.

CREATE OR REPLACE VIEW player_match_context
WITH (security_invoker = true) AS
WITH s AS (
  SELECT ms.*, l.batter_player_id, l.dismissed_batter, l.dismissal_kind, l.extra_type, l.outcome,
         CASE WHEN l.outcome ~* 'bye' THEN 0 ELSE l.runs_bat END AS runs_bat
  FROM match_state ms
  JOIN ball_by_ball_linked l USING (match_id, batting_side, seq)
),
first_ball AS (
  SELECT DISTINCT ON (match_id, batting_side, batter) *
  FROM s ORDER BY match_id, batting_side, batter, seq
),
last_ball AS (
  SELECT match_id, batting_side, max(seq) AS last_seq FROM s GROUP BY match_id, batting_side
),
perf AS (
  SELECT match_id, batting_side, batter,
         sum(runs_bat)                                          AS runs,
         count(*) FILTER (WHERE extra_type IS DISTINCT FROM 'wide') AS balls_faced,
         count(*) FILTER (WHERE runs_bat = 4 AND outcome ~* 'four')  AS fours,
         count(*) FILTER (WHERE runs_bat = 6 AND outcome ~* 'six')   AS sixes
  FROM s GROUP BY match_id, batting_side, batter
),
dis AS (
  SELECT DISTINCT ON (match_id, batting_side, dismissed_batter)
         match_id, batting_side, dismissed_batter AS batter, seq AS dismissal_seq, dismissal_kind
  FROM s WHERE is_wicket AND dismissed_batter IS NOT NULL
  ORDER BY match_id, batting_side, dismissed_batter, seq
)
SELECT f.match_id, f.innings, f.batting_side, f.batter, f.batter_player_id AS player_id,
       row_number() OVER (PARTITION BY f.match_id, f.batting_side ORDER BY f.seq) AS position_by_appearance,
       -- entry state (before the first ball faced)
       f.over_no                                                   AS entry_over,
       f.score_after - f.runs_total                                AS entry_score,
       f.wickets_after - f.is_wicket::int                          AS entry_wickets,
       f.legal_balls_bowled - f.is_legal::int                      AS entry_legal_balls,
       f.phase                                                     AS entry_phase,
       f.target - (f.score_after - f.runs_total)                   AS entry_runs_required,
       CASE WHEN f.target IS NOT NULL AND f.total_overs * 6 - (f.legal_balls_bowled - f.is_legal::int) > 0
            THEN round((f.target - (f.score_after - f.runs_total)) * 6.0
                       / (f.total_overs * 6 - (f.legal_balls_bowled - f.is_legal::int)), 2) END AS entry_required_rate,
       -- exit state (after dismissal, else after the last ball faced)
       e.over_no                                                   AS exit_over,
       e.score_after                                               AS exit_score,
       e.wickets_after                                             AS exit_wickets,
       e.legal_balls_bowled                                        AS exit_legal_balls,
       e.phase                                                     AS exit_phase,
       e.required_rate                                             AS exit_required_rate,
       -- performance
       p.runs, p.balls_faced, p.fours, p.sixes,
       CASE WHEN p.balls_faced > 0 THEN round(p.runs * 100.0 / p.balls_faced, 1) END AS strike_rate,
       (d.dismissal_seq IS NOT NULL)                               AS dismissed,
       d.dismissal_kind,
       e.score_after - (f.score_after - f.runs_total)              AS team_runs_while_in,
       e.wickets_after - (f.wickets_after - f.is_wicket::int)      AS team_wickets_while_in
FROM first_ball f
JOIN last_ball lb USING (match_id, batting_side)
JOIN perf p USING (match_id, batting_side, batter)
LEFT JOIN dis d USING (match_id, batting_side, batter)
JOIN s e ON e.match_id = f.match_id AND e.batting_side = f.batting_side
        AND e.seq = COALESCE(d.dismissal_seq, lb.last_seq);

REVOKE ALL ON player_match_context FROM anon, authenticated;
