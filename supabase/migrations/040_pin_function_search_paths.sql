-- Migration: 040_pin_function_search_paths
-- LOW security fix: set_updated_at, update_updated_at, get_all_bookings all
-- had a mutable search_path (flagged by Supabase advisor). Pinning it
-- prevents unqualified name resolution from being influenced by the
-- calling session's search_path — most relevant for get_all_bookings,
-- which is SECURITY DEFINER. Config-only change, does not alter function bodies.

alter function public.set_updated_at()    set search_path = public;
alter function public.update_updated_at() set search_path = public;
alter function public.get_all_bookings()  set search_path = public;
