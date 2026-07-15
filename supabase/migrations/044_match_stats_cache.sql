-- Migration: 044_match_stats_cache
-- Caches parsed match stats from the separate analytics Supabase project
-- into this project's DB. All reads/writes via service role through API
-- routes only (see 046_enable_rls_scorecard_tables.sql). JSON arrays avoid
-- separate batting/bowling/fielding tables — keeps this schema lean and
-- matches the analytics DB's column structure exactly.
--
-- Reconstructed from the live schema — this migration was applied directly
-- via Supabase MCP on 2026-07-14 and was never checked into this repo until
-- now. See the "Repo Sync Note" pattern in security.md: an applied
-- migration is not the same as a checked-in one, in either direction.

CREATE TABLE IF NOT EXISTS match_stats_cache (
  match_id          text PRIMARY KEY,
  booking_id        uuid REFERENCES bookings(id) ON DELETE SET NULL,

  -- Match level
  match_result      text,          -- 'won' | 'lost' | 'tied' | 'no result'
  team_total        int,
  team_wickets      int,
  team_overs        float8,
  opponent_total    int,
  opponent_wickets  int,
  opponent_overs    float8,
  opponent_name     text,
  ground            text,
  tournament_name   text,
  match_date        date,

  -- Per-player arrays (jsonb — matches analytics DB column structure exactly)
  batting           jsonb,         -- array of batting_stats rows
  bowling           jsonb,         -- array of bowling_stats rows
  fielding          jsonb,         -- array of fielding_stats rows
  team_list         jsonb,         -- array of { match_id, player_name }

  -- Meta
  synced_at         timestamptz NOT NULL DEFAULT now(),
  synced_by         uuid REFERENCES players(id) ON DELETE SET NULL
);

COMMENT ON TABLE match_stats_cache IS
  'Read-only cache of match stats synced from analytics Supabase DB. '
  'Source of truth remains analytics DB. Hub reads from here for display only.';
