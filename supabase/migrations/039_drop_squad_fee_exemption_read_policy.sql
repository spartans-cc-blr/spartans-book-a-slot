-- Migration: 039_drop_squad_fee_exemption_read_policy
-- MEDIUM security fix: squad_fee_exemption_read let any authenticated
-- session read reason/notes for every player ever in any announced squad
-- across all matches, not scoped to the querying player or their own squad.
-- No app code depends on this — all reads go through createServiceClient()
-- in server components/API routes. Restores the documented full-lockdown
-- design for fee_exemptions (no anon/authenticated policy, service-role only).

drop policy "squad_fee_exemption_read" on public.fee_exemptions;
