-- Migration: 033_enable_rls_push_subscriptions
-- CRITICAL security fix: push_subscriptions had RLS disabled entirely,
-- fully exposed to the anon key via PostgREST (SELECT/INSERT/UPDATE/DELETE
-- on raw Web Push endpoint/p256dh/auth credentials for every player).
-- Enable RLS, no policies — service-role only, same pattern as
-- availability_audit / squad_audit. sendPushToPlayer() and
-- POST /api/push/subscribe use createServiceClient() and are unaffected.

alter table public.push_subscriptions enable row level security;
