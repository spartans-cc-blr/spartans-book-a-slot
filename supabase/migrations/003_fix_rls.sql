-- Fix RLS on tables missed in earlier migrations
-- Consistent with platform pattern: service role only, no anon/authenticated policies

alter table availability_audit    enable row level security;
alter table wallet_transactions   enable row level security;