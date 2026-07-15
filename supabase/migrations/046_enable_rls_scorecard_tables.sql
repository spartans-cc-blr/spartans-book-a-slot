-- Migration: 046_enable_rls_scorecard_tables
-- match_stats_cache and scorecard_uploads were created without RLS enabled,
-- unlike every other table in this app (see security.md's RLS policy
-- table). This left both tables fully readable and writable via the public
-- anon key — anyone holding it could bypass every server-side auth check
-- in the Next.js API routes and read or forge match stats / upload status
-- directly. Applied live via Supabase MCP on 2026-07-15.
--
-- No policies added — matches the established pattern for players,
-- availability, and fee_exemptions (blanket deny for anon/authenticated).
-- All reads/writes to these two tables already go exclusively through
-- createServiceClient() in Next.js API routes, which bypasses RLS
-- regardless, so this is a no-op for the app and only closes the public
-- anon-key exposure.

ALTER TABLE public.match_stats_cache ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.scorecard_uploads ENABLE ROW LEVEL SECURITY;
