-- Migration: 037_revoke_get_all_bookings_execute
-- HIGH security fix: get_all_bookings() is a SECURITY DEFINER function,
-- publicly executable via /rest/v1/rpc/get_all_bookings by anon and
-- authenticated roles. Unused by app code — duplicates the RLS-governed
-- read path with hardcoded logic that would silently drift from RLS policy
-- changes since it runs as the owner regardless of caller. Revoke public
-- reachability; service_role keeps EXECUTE (harmless, bypasses RLS anyway).

revoke execute on function public.get_all_bookings() from anon, authenticated;
