-- Allow authenticated users to read start_date and end_date for fee_exemptions
-- belonging to players in any announced squad. This is the minimum needed to compute
-- fee_per_player live on the fixtures page without an admin-only fetch.
-- No write access. No sensitive fields (reason, notes) are exposed — the query
-- in fixtures/page.tsx only selects start_date and end_date.

CREATE POLICY "squad_fee_exemption_read"
ON fee_exemptions FOR SELECT
TO authenticated
USING (
  player_id IN (
    SELECT player_id FROM squad
    WHERE status = 'announced'
  )
);