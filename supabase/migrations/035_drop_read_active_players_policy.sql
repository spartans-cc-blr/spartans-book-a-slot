-- Migration: 035_drop_read_active_players_policy
-- HIGH security fix: read_active_players granted table-wide SELECT (all
-- columns, including whatsapp/dob/blood_group/wallet_balance) on every
-- active player to any authenticated role, not scoped to GC/captain/admin.
-- Contradicts the documented design: players should have no anon/
-- authenticated SELECT policy — full lockdown, service-role-only access
-- via API routes.

drop policy "read_active_players" on public.players;
