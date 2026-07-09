-- Migration: 032_drop_admin_manage_players_policy
-- CRITICAL security fix: admin_manage_players granted ALL on players to any
-- Supabase-Auth-authenticated session whose email matches a captain's gmail_id.
-- Hub uses NextAuth, not Supabase Auth (auth.uid() is always NULL for Hub users),
-- so this policy only served as an exploitable side door via Supabase's own
-- /auth/v1/signup endpoint (bypassing the API's field allowlist entirely).
-- All legitimate writes already go through createServiceClient() in API routes.

drop policy "admin_manage_players" on public.players;
