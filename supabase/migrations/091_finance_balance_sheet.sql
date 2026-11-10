-- 091_finance_balance_sheet.sql
-- Club balance sheet in the Hub (features/finance-balance-sheet.md).
--
-- Cut-over is 1 Jan 2027. Everything before that comes from the legacy
-- "Spartans Hub" Google Sheet as fixed opening figures; from 2027 the lines
-- are derived from Hub data plus the manual entries below.
--
-- All four tables: RLS on, no anon/authenticated policies (service role only).

-- 1. Opening figures, one row per (period, balance-sheet line).
CREATE TABLE IF NOT EXISTS finance_opening_figures (
  period           text    NOT NULL CHECK (period IN ('till_2024', '2025', '2026')),
  line_key         text    NOT NULL,
  amount           numeric NOT NULL DEFAULT 0,
  updated_by_email text,
  updated_at       timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (period, line_key)
);

-- 2. Manual entries (club expenses, advances, write-offs, one-off income).
--    Soft delete only, so a removed entry keeps its trail.
CREATE TABLE IF NOT EXISTS finance_entries (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  entry_date       date    NOT NULL,
  line_key         text    NOT NULL,
  amount           numeric NOT NULL,
  particulars      text    NOT NULL,
  remarks          text,
  created_by       uuid REFERENCES players(id) ON DELETE SET NULL,
  created_by_email text    NOT NULL,
  created_at       timestamptz NOT NULL DEFAULT now(),
  deleted_at       timestamptz,
  deleted_by_email text,
  delete_reason    text
);
CREATE INDEX IF NOT EXISTS finance_entries_date_idx ON finance_entries (entry_date);

-- 3. What the club paid the organiser for a match. Written when match fees
--    are applied (the admin pays the organiser at that moment) and updated by
--    Correct Match Fee. match_date is a snapshot of bookings.game_date; the
--    balance sheet buckets by it, as the legacy sheet did.
CREATE TABLE IF NOT EXISTS organiser_payments (
  booking_id        uuid PRIMARY KEY REFERENCES bookings(id) ON DELETE CASCADE,
  amount            numeric NOT NULL,
  match_date        date    NOT NULL,
  recorded_by_email text,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS organiser_payments_match_date_idx ON organiser_payments (match_date);

-- 4. Club bank balance, entered by the admin (about weekly). The latest row
--    is the "Net Balance in Bank" line; older rows are history.
CREATE TABLE IF NOT EXISTS finance_bank_balances (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  as_of             date    NOT NULL,
  amount            numeric NOT NULL,
  note              text,
  recorded_by_email text    NOT NULL,
  created_at        timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE finance_opening_figures ENABLE ROW LEVEL SECURITY;
ALTER TABLE finance_entries         ENABLE ROW LEVEL SECURITY;
ALTER TABLE organiser_payments      ENABLE ROW LEVEL SECURITY;
ALTER TABLE finance_bank_balances   ENABLE ROW LEVEL SECURITY;

-- Opening figures read from the sheet's Balance Sheet tab on 10 Nov 2026.
-- "Till 2024" and CY 2025 are final. CY 2026 is provisional: update it from
-- /admin/finance at cut-over. Pending dues for 2026 is left at 0 because that
-- line is always read live from players.wallet_balance.
INSERT INTO finance_opening_figures (period, line_key, amount) VALUES
  ('till_2024', 'cash_reserves',               6065),
  ('till_2024', 'match_fee_advance',           8750),
  ('till_2024', 'accrued_cash_wallet',         1263085),
  ('till_2024', 'pending_dues',                780),
  ('till_2024', 'membership_fee',              91300),
  ('till_2024', 'match_fees_paid',             1203133.095),
  ('till_2024', 'match_fee_advances_paid',     52000),
  ('till_2024', 'match_fee_adjustments',       -13196.11111),
  ('till_2024', 'irrecoverable_match_fees',    2400),
  ('till_2024', 'rewards_recognition',         30420),
  ('till_2024', 'health_fitness',              9479),
  ('till_2024', 'team_kit',                    4500),
  ('2025',      'match_fee_advance',           -5326.111111),
  ('2025',      'accrued_cash_wallet',         971109),
  ('2025',      'membership_fee',              49000),
  ('2025',      'match_fees_paid',             980373.7778),
  ('2025',      'match_fee_adjustments',       -38803.88889),
  ('2025',      'rewards_recognition',         56940),
  ('2025',      'health_fitness',              6089),
  ('2025',      'team_kit',                    4320),
  ('2026',      'accrued_cash_wallet',         757646),
  ('2026',      'membership_fee',              44500),
  ('2026',      'match_fees_paid',             805165),
  ('2026',      'rewards_recognition',         30000),
  ('2026',      'health_fitness',              690)
ON CONFLICT (period, line_key) DO NOTHING;
