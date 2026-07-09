-- Migration: 036_security_invoker_audit_wallet_views
-- HIGH security fix: availability_audit_view and player_wallet_summary ran
-- as SECURITY DEFINER (owner permissions), bypassing RLS of the querying
-- role. Combined with existing anon/authenticated SELECT grants on both
-- views, this meant the public anon key could read the full availability
-- audit trail and every player's wallet balance/transactions, unauthenticated.
-- security_invoker=true makes the view run with the querying role's RLS —
-- since the underlying tables (availability_audit, wallet_transactions,
-- players) have no anon/authenticated SELECT policy, those roles now see
-- zero rows through either view. Neither view is used by app code.

alter view public.availability_audit_view set (security_invoker = true);
alter view public.player_wallet_summary   set (security_invoker = true);
