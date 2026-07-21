-- Migration: 048_rls_status_not_active
-- Completes the deferred "migration 003" from features/gc-players.md: rewrites
-- the three RLS policies that still gate on players.active = true, replacing
-- that check with status != 'expelled' (the single source of truth per
-- migration 002_consolidate_player_status, applied directly to the live DB
-- but never checked in — see handoff summary).
--
-- Note: read_active_players (the 4th policy originally flagged in
-- gc-players.md) was already dropped in 035_drop_read_active_players_policy.sql
-- for an unrelated overexposure fix, so only these three remain.
--
-- Every clause below is byte-for-byte identical to the live policy except
-- the active/status condition — confirmed against pg_policies before writing.

DROP POLICY IF EXISTS admin_full_squad ON squad;
CREATE POLICY admin_full_squad ON squad
FOR ALL
TO public
USING (
  EXISTS (
    SELECT 1 FROM players p
    WHERE p.gmail_id = (auth.jwt() ->> 'email') AND p.status != 'expelled' AND p.is_captain = true
  )
);

DROP POLICY IF EXISTS captain_manage_own_squad ON squad;
CREATE POLICY captain_manage_own_squad ON squad
FOR ALL
TO public
USING (
  EXISTS (
    SELECT 1
    FROM bookings b
    JOIN tournaments t ON t.id = b.tournament_id
    JOIN captains c ON c.id = t.captain_id
    JOIN players p ON p.id = c.player_id
    WHERE b.id = squad.booking_id
      AND p.gmail_id = (auth.jwt() ->> 'email')
      AND p.is_captain = true
      AND p.status != 'expelled'
  )
);

DROP POLICY IF EXISTS captain_read_all_availability ON availability;
CREATE POLICY captain_read_all_availability ON availability
FOR SELECT
TO public
USING (
  EXISTS (
    SELECT 1 FROM players p
    WHERE p.gmail_id = (auth.jwt() ->> 'email') AND p.is_captain = true AND p.status != 'expelled'
  )
);

COMMENT ON COLUMN players.active IS 'Deprecated — use status column instead. Scheduled for removal, see migration 049_drop_players_active_column.sql.';
