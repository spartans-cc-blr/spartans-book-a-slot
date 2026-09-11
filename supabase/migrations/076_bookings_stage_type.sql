-- Migration: 076_bookings_stage_type
--
-- Adds a structured league/knockout flag to bookings, for the Team Record
-- page's "Knockout performance" split (see features/team-stats.md §4).
--
-- Deliberately a NEW column rather than parsing bookings.match_stage:
-- match_stage is a free-text, player-facing narrative hint ("Tournament
-- Opener", "Cash Prize", "Semi Final", "Game of Opportunities") whose whole
-- purpose is to promote availability marking — features/knockout-day-
-- protection.md §4 already explains why it must never be overloaded as a
-- machine-readable signal. stage_type is the machine-readable one.
--
-- Nullable: NULL means "not classified" (every pre-existing booking, and
-- any future booking where the admin didn't pick). The Team Record page
-- treats NULL as league for the League/Knockout split, since the club's
-- default game is a league game — a knockout has to be declared, never
-- inferred.

ALTER TABLE bookings
  ADD COLUMN IF NOT EXISTS stage_type text
    CHECK (stage_type IS NULL OR stage_type IN ('league', 'knockout'));

COMMENT ON COLUMN bookings.stage_type IS
  'league | knockout | NULL (unclassified, treated as league). Structured counterpart to the free-text match_stage — set from the admin booking form. Feeds the Team Record page only; never read by the R1–R8 booking rules.';

-- One-off backfill of the handful of existing bookings whose free-text
-- match_stage unambiguously names a knockout round. Reviewed by hand before
-- applying (7 rows at the time of writing: Semi Final ×3, Qualifier,
-- Qualifier 2, Quarter Final, Final). "Cash Prize" / "Last League" /
-- "Tournament Opener" are deliberately NOT matched — they're league games
-- with a narrative label.
UPDATE bookings
SET stage_type = 'knockout'
WHERE stage_type IS NULL
  AND match_stage IS NOT NULL
  AND (
    match_stage ILIKE '%final%'
    OR match_stage ILIKE '%qualifier%'
    OR match_stage ILIKE '%eliminator%'
    OR match_stage ILIKE '%knockout%'
    OR match_stage ILIKE '%play-off%'
    OR match_stage ILIKE '%playoff%'
  );
