-- Migration: 058_drop_players_default_persona
-- Reverts 057_players_default_persona.sql — the nav persona switcher was
-- rolled back (it never reliably persisted a switch across a page
-- navigation) along with the code that wrote/read this column.

ALTER TABLE players
  DROP COLUMN IF EXISTS default_persona;
