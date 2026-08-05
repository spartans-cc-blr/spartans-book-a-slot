-- Migration: 054_tournament_is_practice
-- Flags the "Practice games" umbrella tournament so its matches can be
-- excluded from aggregate performance stats (leaderboard, player career/
-- season stats via src/lib/playerStats.ts). Only real tournament fixtures
-- count towards stats — practice games are excluded by default everywhere,
-- with an explicit opt-in on the personal stats page. Default false so
-- every other tournament is unaffected.

ALTER TABLE tournaments
  ADD COLUMN IF NOT EXISTS is_practice boolean NOT NULL DEFAULT false;

UPDATE tournaments SET is_practice = true WHERE name = 'Practice games';
