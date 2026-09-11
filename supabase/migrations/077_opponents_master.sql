-- Migration: 077_opponents_master
--
-- Opponent master list — see features/team-stats.md §5.
--
-- bookings.opponent_name (and match_stats_cache.opponent_name, copied from
-- the CricHeroes scorecard) are free text: 109 synced matches carried 93
-- distinct spellings at the time of writing, so "how do we do against X"
-- was unanswerable without a canonical identity. `opponents` is that
-- identity; `opponent_aliases` maps every raw spelling ever seen on a
-- booking to it, so a future booking typed with the same spelling resolves
-- automatically (src/lib/opponents.ts, resolveOpponentIdByName()) and the
-- captain/GC/wrangler reconciliation queue on /opponents only ever has to
-- deal with a genuinely new spelling once. Same shape as the analytics
-- DB's player_name_aliases (features/player-identity-resolution.md), just
-- for teams instead of players.
--
-- is_marquee — the "marquee opponent" list the club wants to track
-- head-to-head against; pinned to the top of the Team Record page's H2H
-- section. Any other opponent is still expandable there, marquee is purely
-- a highlight, not a filter.

CREATE TABLE IF NOT EXISTS opponents (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name                text NOT NULL,
  is_marquee          boolean NOT NULL DEFAULT false,
  cricheroes_team_url text,
  notes               text,
  created_by          uuid REFERENCES players(id) ON DELETE SET NULL,
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now()
);

-- One canonical opponent per (case/whitespace-insensitive) name.
CREATE UNIQUE INDEX IF NOT EXISTS opponents_name_key
  ON opponents (lower(btrim(name)));

CREATE TABLE IF NOT EXISTS opponent_aliases (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  opponent_id uuid NOT NULL REFERENCES opponents(id) ON DELETE CASCADE,
  alias       text NOT NULL,
  created_by  uuid REFERENCES players(id) ON DELETE SET NULL,
  created_at  timestamptz NOT NULL DEFAULT now()
);

-- A raw spelling can only ever point at one opponent.
CREATE UNIQUE INDEX IF NOT EXISTS opponent_aliases_alias_key
  ON opponent_aliases (lower(btrim(alias)));

ALTER TABLE bookings
  ADD COLUMN IF NOT EXISTS opponent_id uuid REFERENCES opponents(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS bookings_opponent_id_idx ON bookings (opponent_id);

-- RLS: opponents get a public SELECT, same posture as `grounds` — opponent
-- names already appear on the public fixture cards and schedule grid, so
-- there's nothing new to protect on read. All writes go through the
-- service role via /api/opponents only. opponent_aliases is service-role
-- only (no policies) — it's an internal reconciliation table.
ALTER TABLE opponents ENABLE ROW LEVEL SECURITY;
ALTER TABLE opponent_aliases ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS opponents_public_read ON opponents;
CREATE POLICY opponents_public_read ON opponents
  FOR SELECT TO anon, authenticated USING (true);

COMMENT ON TABLE opponents IS
  'Canonical opponent master list, managed by captains/GC/wranglers on /opponents. bookings.opponent_id resolves to this; opponent_aliases maps raw opponent_name spellings to it.';
COMMENT ON COLUMN bookings.opponent_id IS
  'Canonical opponent (opponents.id). Resolved automatically from opponent_name via opponent_aliases on booking create/edit, or manually from /opponents. NULL = not yet reconciled.';
