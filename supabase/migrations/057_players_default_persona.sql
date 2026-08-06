-- Migration: 057_players_default_persona
-- Nav persona switcher (see .claude/rules/features/... proposal) — remembers
-- which nav view (player/captain/gc/wrangler/admin) an account last chose,
-- across devices. NULL = never chosen yet, client defaults to 'player'.
-- Server-side write path (PATCH /api/players/persona) validates the value
-- against the caller's own role flags on every write — this column is never
-- trusted to reflect real permissions by itself.

ALTER TABLE players
  ADD COLUMN IF NOT EXISTS default_persona text
    CHECK (default_persona IN ('player', 'captain', 'gc', 'wrangler', 'admin'));
