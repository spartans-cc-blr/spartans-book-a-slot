-- Migration: 038_revoke_get_all_bookings_execute_public
-- Follow-up to 037: revoking EXECUTE from anon/authenticated alone was
-- insufficient — Postgres grants EXECUTE to PUBLIC by default on function
-- creation (visible as the "=X/postgres" entry in pg_proc.proacl), and
-- every role including anon/authenticated inherits privileges granted to
-- PUBLIC regardless of per-role revokes. This explicitly closes that gap.

revoke execute on function public.get_all_bookings() from public;
