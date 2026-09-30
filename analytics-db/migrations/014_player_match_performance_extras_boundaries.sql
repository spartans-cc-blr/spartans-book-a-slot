-- Migration: 014_player_match_performance_extras_boundaries
-- Recreates player_match_performance (013) adding two bowling columns, placed with
-- their siblings (so DROP + CREATE rather than CREATE OR REPLACE, which only appends):
--   bowler_extras_conceded  = wides + no_balls (bowler-charged only; excludes byes / leg byes)
--   boundary_runs_conceded  = fours_conceded*4 + sixes_conceded*6 (scorecard 4s/6s only)
-- Original header follows.
--
-- One row per (match_id, player_id) for every reconciled Spartans player in a
-- match's Playing XI, with match context, participation flags, and batting /
-- bowling / fielding facts plus derived rates.
--
-- Scope notes:
--  * Spine is team_list (every batter/bowler/fielder is in it), deduped on
--    (match_id, player_id). Unreconciled rows (player_id IS NULL) are excluded.
--  * Two scorecard aliases for one player can leave 2 rows per table for the
--    same (match_id, player_id) (see partnerships/player-identity docs). Each
--    source is collapsed to one row, preferring the row with real participation.
--  * Hub-only dimensions (format T20/T30, opponent_id, canonical ground,
--    is_practice, tournament) are NOT here — they live in the Hub DB. Join on
--    match_id in the app, or add a match_dimensions mirror later.
--    match_stats.match_type is the STAGE (League/Final/...), not the format.
--  * security_invoker so the view honours the base tables' RLS (blanket deny
--    for anon/authenticated) instead of running as owner and leaking rows.

DROP VIEW IF EXISTS player_match_performance;

CREATE VIEW player_match_performance
WITH (security_invoker = true) AS
WITH spine AS (
  SELECT DISTINCT match_id, player_id
  FROM team_list
  WHERE player_id IS NOT NULL
),
bat AS (
  SELECT DISTINCT ON (match_id, player_id) *
  FROM batting_stats
  WHERE player_id IS NOT NULL
  ORDER BY match_id, player_id, batted DESC, balls DESC NULLS LAST, player_name
),
bowl AS (
  SELECT DISTINCT ON (match_id, player_id) *
  FROM bowling_stats
  WHERE player_id IS NOT NULL
  ORDER BY match_id, player_id, did_bowl DESC, overs DESC NULLS LAST, player_name
),
fld AS (
  SELECT match_id, player_id,
         sum(catches)       AS catches,
         sum(caught_behind) AS caught_behind,
         sum(stumpings)     AS stumpings,
         sum(run_outs)      AS run_outs
  FROM fielding_stats
  WHERE player_id IS NOT NULL
  GROUP BY match_id, player_id
),
base AS (
  SELECT
    s.match_id, s.player_id,
    m.match_date, m.match_type AS stage, m.opponent_name, m.ground AS venue,
    m.match_result AS result, m.toss_won = 'Y' AS won_toss, m.toss_decision,
    m.team_total, m.team_wickets, m.opponent_total, m.opponent_wickets,
    -- Spartans batted first when they won the toss and chose bat, or lost it and the opponent chose field
    CASE WHEN m.toss_won IS NULL OR m.toss_decision IS NULL THEN NULL
         ELSE (m.toss_won = 'Y' AND m.toss_decision = 'bat')
           OR (m.toss_won = 'N' AND m.toss_decision = 'field') END AS batted_first,
    COALESCE(b.batted, false)   AS batting_innings,
    COALESCE(w.did_bowl, false) AS bowled,
    (COALESCE(f.catches,0) + COALESCE(f.caught_behind,0) + COALESCE(f.stumpings,0) + COALESCE(f.run_outs,0)) AS fielding_dismissals,
    b.batting_order, b.dismissal_method, b.runs AS bat_runs, b.balls AS balls_faced, b.fours AS bat_fours, b.sixes AS bat_sixes,
    b.strike_rate,
    w.overs, w.dots, w.runs AS runs_conceded, w.wickets, w.maidens, w.fours AS fours_conceded, w.sixes AS sixes_conceded,
    w.wides, w.no_balls, w.economy,
    CASE WHEN w.did_bowl THEN floor(w.overs)::int * 6 + round((w.overs - floor(w.overs)) * 10)::int END AS balls_bowled,
    f.catches, f.caught_behind, f.stumpings, f.run_outs
  FROM spine s
  JOIN match_stats m ON m.match_id = s.match_id
  LEFT JOIN bat  b ON b.match_id = s.match_id AND b.player_id = s.player_id
  LEFT JOIN bowl w ON w.match_id = s.match_id AND w.player_id = s.player_id
  LEFT JOIN fld  f ON f.match_id = s.match_id AND f.player_id = s.player_id
)
SELECT
  -- MATCH CONTEXT
  match_id, player_id, match_date, stage, opponent_name, venue, result,
  won_toss, toss_decision,
  CASE WHEN batted_first IS NULL OR result NOT IN ('WON','LOST') THEN NULL
       WHEN result = 'WON'  AND batted_first     THEN 'runs'
       WHEN result = 'WON'  AND NOT batted_first THEN 'wickets'
       WHEN result = 'LOST' AND batted_first     THEN 'wickets'
       ELSE 'runs' END AS margin_type,
  CASE WHEN batted_first IS NULL OR result NOT IN ('WON','LOST') THEN NULL
       WHEN result = 'WON'  AND batted_first     THEN team_total - opponent_total
       WHEN result = 'WON'  AND NOT batted_first THEN 10 - team_wickets
       WHEN result = 'LOST' AND batted_first     THEN 10 - opponent_wickets
       ELSE opponent_total - team_total END AS margin_value,
  -- PARTICIPATION (played = in the Playing XI)
  true AS played, batting_innings, bowled,
  (fielding_dismissals > 0) AS fielded_dismissal,
  -- BATTING
  CASE WHEN batting_innings THEN batting_order END AS batting_position,
  CASE WHEN batting_innings THEN dismissal_method END AS batting_status,
  CASE WHEN batting_innings THEN bat_runs END AS runs,
  CASE WHEN batting_innings THEN balls_faced END AS balls_faced,
  CASE WHEN batting_innings THEN bat_fours END AS fours,
  CASE WHEN batting_innings THEN bat_sixes END AS sixes,
  CASE WHEN batting_innings THEN strike_rate END AS strike_rate,
  CASE WHEN batting_innings THEN bat_fours * 4 + bat_sixes * 6 END AS boundary_runs,
  CASE WHEN batting_innings AND bat_runs > 0 THEN round((bat_fours * 4 + bat_sixes * 6)::numeric / bat_runs * 100, 2) END AS boundary_pct,
  CASE WHEN batting_innings AND team_total > 0 THEN round(bat_runs::numeric / team_total * 100, 2) END AS team_run_share,
  CASE WHEN batting_innings AND (bat_fours + bat_sixes) > 0 THEN round(balls_faced::numeric / (bat_fours + bat_sixes), 2) END AS balls_per_boundary,
  -- BOWLING
  CASE WHEN bowled THEN overs END AS overs,
  balls_bowled,
  CASE WHEN bowled THEN dots END AS dot_balls,
  CASE WHEN bowled THEN runs_conceded END AS runs_conceded,
  CASE WHEN bowled THEN wickets END AS wickets,
  CASE WHEN bowled THEN maidens END AS maidens,
  CASE WHEN bowled THEN fours_conceded END AS fours_conceded,
  CASE WHEN bowled THEN sixes_conceded END AS sixes_conceded,
  CASE WHEN bowled THEN COALESCE(fours_conceded,0) * 4 + COALESCE(sixes_conceded,0) * 6 END AS boundary_runs_conceded,
  CASE WHEN bowled THEN wides END AS wides,
  CASE WHEN bowled THEN no_balls END AS no_balls,
  CASE WHEN bowled THEN COALESCE(wides,0) + COALESCE(no_balls,0) END AS bowler_extras_conceded,
  CASE WHEN bowled THEN economy END AS economy,
  CASE WHEN bowled AND balls_bowled > 0 THEN round(dots::numeric / balls_bowled * 100, 2) END AS dot_ball_pct,
  CASE WHEN bowled AND wickets > 0 THEN round(runs_conceded::numeric / wickets, 2) END AS bowling_average,
  CASE WHEN bowled AND wickets > 0 THEN round(balls_bowled::numeric / wickets, 2) END AS bowling_strike_rate,
  CASE WHEN bowled AND balls_bowled > 0 THEN round(wickets::numeric / (balls_bowled / 6.0), 3) END AS wickets_per_over,
  -- FIELDING
  COALESCE(catches, 0) + COALESCE(caught_behind, 0) AS catches,
  COALESCE(stumpings, 0) AS stumpings,
  COALESCE(run_outs, 0)  AS run_outs,
  fielding_dismissals
FROM base;

-- Lock down: the base tables are service-role-only, keep the view the same.
REVOKE ALL ON player_match_performance FROM anon, authenticated;
