-- Migration: 069_tournament_intended_formats
--
-- Every slot-distribution/suggestion engine (src/lib/slotTargets.ts,
-- src/lib/suggestedSlots.ts, TournamentPlannerClient.tsx,
-- TournamentShareCard.tsx) infers a tournament's "active formats" purely
-- from the formats its own confirmed bookings already use — there was no
-- way to declare a tournament's format ahead of its first booking. Whenever
-- zero bookings existed yet, every one of those engines fell back to
-- treating the tournament as valid for BOTH T20 and T30, which incorrectly
-- pulled the T30-only 12:30 slot into a brand-new T20-only tournament's
-- slot targets/suggestions before its first game was ever booked.
--
-- This column lets an admin declare the intended format(s) up front. When
-- set, it's preferred over the both-formats fallback for a tournament with
-- no bookings yet; once real bookings exist, their own formats still take
-- precedence as before. See features/tournament-planner.md.
ALTER TABLE tournaments
  ADD COLUMN intended_formats text[];

ALTER TABLE tournaments
  ADD CONSTRAINT tournaments_intended_formats_check
  CHECK (intended_formats IS NULL OR intended_formats <@ ARRAY['T20', 'T30']::text[]);

COMMENT ON COLUMN tournaments.intended_formats IS
  'Admin-declared intended match format(s) (T20/T30), used only as the slot-distribution fallback for a tournament with zero confirmed bookings yet. Once a booking exists, its own format always takes precedence.';
