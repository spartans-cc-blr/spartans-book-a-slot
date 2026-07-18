-- 047_cricheroes_player_id.sql
-- Adds the numeric CricHeroes profile ID, extracted server-side from
-- players.cricheroes_url whenever that field is saved (see
-- src/lib/cricheroesId.ts). Direct cricheroes.com/.in profile links yield
-- the ID by regex alone; chshare.link share links require a server-side
-- redirect-follow to discover the real profile URL first.
--
-- This is a separate, Hub-side identifier from the analytics-DB player_id
-- work in features/player-identity-resolution.md — that feature links
-- Hub players.id into the analytics DB's scorecard tables. This column is
-- the reverse direction: capturing CricHeroes' own player ID on the Hub
-- side, for use as a manual cross-check aid during reconciliation (the
-- scorecard PDF pipeline has no per-player CricHeroes ID to auto-match
-- against — see the July 2026 investigation in that feature's history).
--
-- Nullable — most players won't have this until they next save a
-- cricheroes_url (existing rows are not backfilled by this migration).
ALTER TABLE players
  ADD COLUMN IF NOT EXISTS cricheroes_player_id text;

-- A CricHeroes profile should never belong to two different Hub members —
-- partial unique index (not a full one) so multiple NULLs are allowed.
CREATE UNIQUE INDEX IF NOT EXISTS idx_players_cricheroes_player_id
  ON players(cricheroes_player_id)
  WHERE cricheroes_player_id IS NOT NULL;

COMMENT ON COLUMN players.cricheroes_player_id IS
  'Numeric CricHeroes profile ID (e.g. "4601286"), auto-extracted server-side from cricheroes_url on save. Never accepted directly from the client. Nullable — null until the player has a resolvable cricheroes_url.';
