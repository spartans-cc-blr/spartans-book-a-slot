-- Migration: 049_drop_players_active_column
-- DO NOT APPLY AUTOMATICALLY. Irreversible — only run manually after
-- 048_rls_status_not_active.sql plus the application-code changes in this
-- same handoff have been live for a few days and verified.
--
-- Pre-req check before running this:
--   - No RLS policy references players.active (SELECT * FROM pg_policies
--     WHERE qual ILIKE '%active%' OR with_check ILIKE '%active%' should return
--     nothing outside this table, and nothing referencing "active" at all
--     once this column is gone)
--   - No application code reads/writes players.active (fresh grep clean)

ALTER TABLE players DROP COLUMN active;
