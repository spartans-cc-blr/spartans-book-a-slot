-- Migration: 042_add_wrangler_role
-- Adds the data wrangler persona to players — admin-writable only.
-- Wranglers get no direct RLS grant; access is exclusively through the
-- gated /api/wrangler/* API routes using the service role, same pattern
-- as is_captain / is_gc.

alter table players
  add column if not exists is_wrangler boolean not null default false;

comment on column players.is_wrangler is
  'Data wrangler — can backfill squad rows from WhatsApp announcements via /api/wrangler/* routes. Admin-writable only, no direct RLS grant.';
