-- 023_tournaments_deprecate_vc.sql
-- vc_captain_id is no longer written by the application.
-- Column is retained as nullable for historical rows — no data is dropped.
-- API and UI have been updated to stop reading and writing this field.
COMMENT ON COLUMN tournaments.vc_captain_id IS
  'Deprecated June 2026. No longer written by the application. '
  'Retained for historical data only. Do not use in new queries.';