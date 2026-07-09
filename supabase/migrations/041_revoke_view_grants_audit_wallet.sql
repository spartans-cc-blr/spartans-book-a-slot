-- Migration: 041_revoke_view_grants_audit_wallet
-- Defense-in-depth follow-up to 036 (security_invoker fix): revoke the
-- standing anon/authenticated grants on availability_audit_view and
-- player_wallet_summary. security_invoker already makes these return zero
-- rows for those roles via RLS, but removing the grant itself means a
-- future RLS loosening on the underlying tables can't silently reopen
-- these views as a bypass path. Neither view is used by app code.

revoke all on public.availability_audit_view from anon, authenticated;
revoke all on public.player_wallet_summary   from anon, authenticated;
