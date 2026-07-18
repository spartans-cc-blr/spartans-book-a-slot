-- 002_alias_cricheroes_player_id.sql
-- Analytics DB (separate Supabase project — ANALYTICS_SUPABASE_URL/KEY).
-- NOT part of supabase/migrations/ (the Hub DB) — apply directly to the
-- analytics project. See analytics-db/migrations/README.md and the
-- "Repo/DB drift note" pattern in features/post-match-scorecard.md §5:
-- a file existing here is not proof it has been applied to the live
-- analytics project — cross-check with list_migrations after applying.
--
-- Purpose: alongside the Hub players.id already stored on
-- player_name_aliases / match_name_overrides (see 001), also capture the
-- resolved player's Hub-side CricHeroes profile ID
-- (players.cricheroes_player_id, see supabase/migrations/047 in the Hub
-- repo) at the moment an admin confirms a scorecard_name -> player_id
-- resolution. Written only by src/app/api/admin/player-reconciliation/
-- route.ts (mode 'confirm') and the squad-disambiguation auto-resolve path
-- in src/lib/playerIdentityResolution.ts — same "never trust the client,
-- re-derive server-side from the live Hub players table" posture as
-- player_id itself. Nullable: many Hub players still have no
-- cricheroes_player_id (see player-identity-resolution.md §3.1's "Data
-- quality note" on chshare.link legacy URLs), so this is best-effort
-- metadata, not a resolution requirement.

ALTER TABLE player_name_aliases  ADD COLUMN IF NOT EXISTS cricheroes_player_id text;
ALTER TABLE match_name_overrides ADD COLUMN IF NOT EXISTS cricheroes_player_id text;

COMMENT ON COLUMN player_name_aliases.cricheroes_player_id  IS
  'Hub players.cricheroes_player_id at the time this alias was confirmed (nullable — not every Hub player has one linked). Snapshot, not live-synced: if the player links/changes their CricHeroes URL later, this column is not retroactively updated.';
COMMENT ON COLUMN match_name_overrides.cricheroes_player_id IS
  'Hub players.cricheroes_player_id at the time this override was confirmed (nullable — not every Hub player has one linked, and squad_disambiguation auto-resolves carry it through too). Snapshot, not live-synced.';
