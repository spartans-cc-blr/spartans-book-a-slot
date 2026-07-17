-- 001_player_identity_resolution.sql
-- Analytics DB (separate Supabase project — ANALYTICS_SUPABASE_URL/KEY).
-- NOT part of supabase/migrations/ (the Hub DB) — apply this directly to the
-- analytics project, e.g. via the Supabase MCP `apply_migration` tool, the
-- same way match_stats_cache / scorecard_uploads' Hub-side counterparts were
-- applied. See features/post-match-scorecard.md §5 "Repo/DB drift note" —
-- this file existing in the Hub repo's git history is not the same as it
-- being applied to the live analytics project; confirm separately via
-- `list_migrations` against the analytics project after applying.
--
-- Purpose: resolve analytics-DB player_name strings (batting_stats,
-- bowling_stats, fielding_stats, team_list — all keyed by match_id text +
-- player_name text, no player identity today) to Hub players.id, without a
-- real cross-database foreign key (Hub and analytics are separate Supabase
-- projects — Postgres FKs cannot span them). Referential validity is
-- enforced at the application layer only, in
-- src/app/api/admin/player-reconciliation/route.ts, which validates every
-- player_id against the live Hub `players` table before writing it here.
--
-- Nullable-FK-onto-legacy-table pattern follows
-- supabase/migrations/022_captains_player_fk.sql (Hub DB) — add nullable,
-- no backfill required, existing rows are simply player_id IS NULL until
-- reconciled.

ALTER TABLE batting_stats  ADD COLUMN IF NOT EXISTS player_id uuid;
ALTER TABLE bowling_stats  ADD COLUMN IF NOT EXISTS player_id uuid;
ALTER TABLE fielding_stats ADD COLUMN IF NOT EXISTS player_id uuid;
ALTER TABLE team_list      ADD COLUMN IF NOT EXISTS player_id uuid;

COMMENT ON COLUMN batting_stats.player_id  IS
  'Hub players.id (separate Supabase project — no real FK possible across projects). Nullable; NULL = not yet reconciled. Written only by /api/admin/player-reconciliation, which validates it against the live Hub players table first.';
COMMENT ON COLUMN bowling_stats.player_id  IS
  'Hub players.id (separate Supabase project — no real FK possible across projects). Nullable; NULL = not yet reconciled. Written only by /api/admin/player-reconciliation, which validates it against the live Hub players table first.';
COMMENT ON COLUMN fielding_stats.player_id IS
  'Hub players.id (separate Supabase project — no real FK possible across projects). Nullable; NULL = not yet reconciled. Written only by /api/admin/player-reconciliation, which validates it against the live Hub players table first.';
COMMENT ON COLUMN team_list.player_id      IS
  'Hub players.id (separate Supabase project — no real FK possible across projects). Nullable; NULL = not yet reconciled. Written only by /api/admin/player-reconciliation, which validates it against the live Hub players table first.';

CREATE INDEX IF NOT EXISTS idx_batting_stats_player_id  ON batting_stats(player_id);
CREATE INDEX IF NOT EXISTS idx_bowling_stats_player_id  ON bowling_stats(player_id);
CREATE INDEX IF NOT EXISTS idx_fielding_stats_player_id ON fielding_stats(player_id);
CREATE INDEX IF NOT EXISTS idx_team_list_player_id      ON team_list(player_id);

-- Permanent, name -> player_id resolution. One row per distinct
-- scorecard_name ever confirmed by an admin. Global default resolution —
-- takes effect for every match a name appears in, present and future,
-- unless a match_name_overrides row exists for that specific match (see
-- below). This is what makes a CricHeroes display-name rename (e.g.
-- "Muthu" -> "Muthukumar") a one-time admin action rather than a recurring
-- one: both scorecard_name strings get their own alias row pointing at the
-- same player_id.
CREATE TABLE IF NOT EXISTS player_name_aliases (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  scorecard_name text NOT NULL UNIQUE,
  player_id      uuid NOT NULL,     -- Hub players.id, no real FK possible
  created_at     timestamptz NOT NULL DEFAULT now(),
  created_by     uuid                -- Hub players.id of the confirming admin, no real FK possible
);

-- Match-scoped override — takes precedence over player_name_aliases.
-- For genuine same-name-same-match collisions (e.g. two "Manohar Reddy"s
-- in one squad) that the global alias table cannot resolve, since it can
-- only ever point one scorecard_name at one player_id. Also written
-- automatically by the squad-disambiguation auto-resolve path (see
-- src/lib/playerIdentityResolution.ts) when exactly one of several
-- same-named Hub candidates appears in that match's squad — no admin
-- action needed for that case.
CREATE TABLE IF NOT EXISTS match_name_overrides (
  match_id       text NOT NULL,
  scorecard_name text NOT NULL,
  player_id      uuid NOT NULL,     -- Hub players.id, no real FK possible
  resolved_via   text NOT NULL DEFAULT 'admin' CHECK (resolved_via IN ('admin', 'squad_disambiguation')),
  created_at     timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (match_id, scorecard_name)
);

-- Names confirmed to never belong to a Hub member (almost always an
-- opponent-team player whose name happens to appear in a CricHeroes
-- scorecard). Excluded from the reconciliation queue once marked so the
-- admin isn't asked about the same non-member repeatedly.
CREATE TABLE IF NOT EXISTS ignored_names (
  scorecard_name text PRIMARY KEY,
  created_at     timestamptz NOT NULL DEFAULT now()
);

-- RLS — same "service-role only, no anon/authenticated policy" pattern as
-- scorecard_uploads / match_stats_cache (see
-- supabase/migrations/046_enable_rls_scorecard_tables.sql in the Hub repo).
-- Every read/write to these three tables goes through
-- ANALYTICS_SUPABASE_KEY (service role) inside Hub API routes only — never
-- exposed to a browser, never a NEXT_PUBLIC_ variable.
ALTER TABLE player_name_aliases  ENABLE ROW LEVEL SECURITY;
ALTER TABLE match_name_overrides ENABLE ROW LEVEL SECURITY;
ALTER TABLE ignored_names        ENABLE ROW LEVEL SECURITY;
-- No anon/authenticated policies added — blanket deny, matching the rest
-- of the analytics DB's access pattern for tables Hub API routes own.
