-- 068_availability_update_source_carryover.sql
--
-- availability.update_source and availability_audit.update_source both
-- carry a CHECK constraint allowing only 'player'/'captain' — this table
-- pair isn't checked into supabase/migrations/ at all (same repo/DB drift
-- pattern documented elsewhere in this app; see features/gc-players.md §13
-- and features/post-match-scorecard.md §5 for prior instances), so the
-- constraint was only discoverable by querying the live schema directly.
--
-- The player_future_availability → real-booking carryover (POST
-- /api/bookings) needs a third value: a row auto-filled from a player's
-- pre-booking future-availability response is neither a self-service write
-- nor a captain-proxy write — attributing it to 'player' would be
-- technically wrong (the player never touched this specific booking) and
-- would blur an otherwise-clean audit trail.

alter table availability
  drop constraint availability_update_source_check,
  add constraint availability_update_source_check
    check (update_source = ANY (ARRAY['player'::text, 'captain'::text, 'future_carryover'::text]));

alter table availability_audit
  drop constraint availability_audit_update_source_check,
  add constraint availability_audit_update_source_check
    check (update_source = ANY (ARRAY['player'::text, 'captain'::text, 'future_carryover'::text]));
