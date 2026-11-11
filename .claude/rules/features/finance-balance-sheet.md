# Club Balance Sheet — `/admin/finance`, `/gc/finance`

**Spartans Hub · Added: November 2026 · Cut-over: 1 Jan 2027**

---

## 1. Overview

The club's balance sheet, previously the "Balance Sheet" tab of the legacy
"Spartans Hub" Google Sheet, rebuilt in the Hub with the same lines and
layout: Receivables, Expenses, and a closing block (Total Balance, Players'
Cash Wallet, Balance Fund from Membership Fee, Net Balance in Bank).

| Who | Sees | Where |
|---|---|---|
| Admin (also acts as treasurer) | Balance sheet plus bank balance, manual entries and opening figures | `/admin/finance` (sidebar: 🏦 Finance) |
| GC | Balance sheet summary only: no player balances, no individual entries | `/gc/finance` (Council ⚖ → 🏦 Finance) |

There is no separate treasurer role: the admin doubles as treasurer.

## 2. Cut-over model

`FINANCE_CUTOVER_DATE = '2027-01-01'` (`src/lib/financeCore.ts`).

- **Before the cut-over** the sheet stays the finance ledger. The Hub page
  shows three fixed columns, **Till 2024**, **CY 2025**, **CY 2026**, from
  `finance_opening_figures`. Till 2024 and CY 2025 are final. CY 2026 was
  seeded from the sheet on 10 Nov 2026 and is provisional: update it from
  "Opening Figures" on `/admin/finance` until the year closes.
- **From the cut-over** a `CY <year>` column is added per year, built from Hub
  data plus manual entries. Manual entries dated before the cut-over are
  rejected, since those amounts are already inside the opening figures.
- At cut-over, Hub `players.wallet_balance` must agree with the sheet's
  wallet balances, or Total Balance will not reconcile with the bank.

## 3. Where each line comes from (from the cut-over)

| Line | Source |
|---|---|
| Total Accrued Cash Wallet | Net of `wallet_transactions` with no `booking_id` (top-ups, refunds, admin debits, membership debits), not deleted, by IST year of `created_at` |
| Membership Fee | Wallet debits linked from `membership_fee_charges.wallet_transaction_id`, by IST year |
| Pending Dues in Cash Wallet | Live: sum of negative `players.wallet_balance`, shown in the latest column only |
| Match Fees Paid | `organiser_payments`, by match date |
| Every other line | Manual entries in `finance_entries` (any derived line also accepts manual entries on top) |

The membership fee is debited from the wallet in the Hub, so it lowers
Accrued Cash Wallet and raises Membership Fee by the same amount. The two
lines together are the cash players paid in, which is what the sheet's two
receipt categories added up to.

**Organiser payments.** The admin pays the organiser when applying a match
fee, so `POST /api/fees/apply` records the full match fee
(`match_fee_override ?? tournaments.match_fee`) in `organiser_payments`, and
`PATCH /api/fees/apply` (Correct Match Fee) updates it to the corrected base
fee (`recordOrganiserPayment()`, best-effort, never fails the fee action).
`match_date` is a snapshot of `bookings.game_date`. A match paid for outside
this flow needs a manual "Match Fees Paid" entry. Players are charged a
rounded-up share, so charges exceed organiser payments slightly; that excess
ends up in the club fund, as on the sheet.

## 4. Closing block

- **Total Balance** = all income − all expenses, every column. The
  Include/Exclude selector (default Exclude) decides whether pending dues
  count; Exclude is what the club should actually be holding.
- **Players' Cash Wallet** = sum of positive player balances.
- **Wallet Balance After Match Fee Advances** = that, less the Scheduled
  Unpaid, Advances Paid and Adjustments lines.
- **Balance Fund from Membership Fee** = Total Balance without dues − Players'
  Cash Wallet.
- **Net Balance in Bank** = the latest `finance_bank_balances` row, entered by
  the admin (about weekly). The club shares an account with personal money, so
  the admin enters the club's own figure. "Bank minus total balance" shows the
  gap; under ₹1 reads as reconciled.

With the seeded figures and the sheet's wallet totals (₹47,892 / ₹46,537) the
maths reproduces the sheet: Total Balance ₹53,399, club fund ₹5,507
(`financeCore.test.ts`).

## 5. Database — `supabase/migrations/091_finance_balance_sheet.sql`

| Table | Purpose |
|---|---|
| `finance_opening_figures` | `(period, line_key)` → amount; periods `till_2024`, `2025`, `2026`; seeded |
| `finance_entries` | Manual entries: date, line, amount (negative reverses), particulars, remarks; soft delete with reason |
| `organiser_payments` | One row per booking: amount paid to the organiser, `match_date` |
| `finance_bank_balances` | Bank balance history; latest row is the current figure |

All RLS-on with no anon/authenticated policies (service role only). **The
migration must be applied to the live Hub project**; until then the pages show
an error and fee application logs (but is not blocked by) a failed organiser
payment write.

## 6. API (admin only, `adminWrite` rate limit, Zod `.strict()`)

| Route | Method | Purpose |
|---|---|---|
| `/api/admin/finance/entries` | POST, DELETE | Add a manual entry; soft-delete one with a reason |
| `/api/admin/finance/bank-balance` | POST | Record the bank balance as of a date |
| `/api/admin/finance/opening` | PUT | Set one opening figure |

Line keys are checked against the registry in `financeCore.ts`. Both pages
fetch server-side; there is no read API.

## 7. Security

| Check | Status |
|---|---|
| `/admin/finance` behind the admin layout guard and its own `isAdmin` check | ✅ |
| `/gc/finance` requires `isGC \|\| isAdmin`; it calls `getBalanceSheet()`, which returns aggregates only | ✅ |
| All writes admin-only, re-checked server-side, rate-limited, validated | ✅ |
| Entries dated before the cut-over or in the future rejected server-side | ✅ |
| Nothing here changes a wallet balance or applies a fee | ✅ |

## 8. File map

| File | Role |
|---|---|
| `src/lib/financeCore.ts` (+ `.test.ts`) | Lines, columns, `buildBalanceSheet()`; client-safe |
| `src/lib/finance.ts` | Server fetch (`getBalanceSheet()`, `getFinanceAdminData()`), `recordOrganiserPayment()` |
| `src/components/finance/BalanceSheetView.tsx` | The balance sheet (shared by both pages) |
| `src/components/finance/FinanceAdminClient.tsx` | Bank balance, entries, opening figures |
| `src/app/admin/finance/page.tsx`, `src/app/gc/finance/page.tsx` | Pages |
| `src/app/api/admin/finance/**` | Write routes |
| `src/app/api/fees/apply/route.ts` | Records the organiser payment on apply and correct |

## 8.1 Collapsible columns (November 2026)

`BalanceSheetView` shows a "Columns:" toggle row above the tables. Every column except the latest (Till 2024, CY 2025 today) can be collapsed or expanded; they start **collapsed** so the current year fits on a phone, and the choice applies to both Receivables and Expenses (and on `/gc/finance`). Client-side state only, not persisted.

## 9. Not built yet

- **Sync to the Google Sheet.** Agreed design: a one-way push that overwrites
  separate Hub-owned tabs (never the hand-maintained ones). Needs a Google
  service account with edit access to the sheet and its key in Vercel.
- Editing a manual entry (delete and re-add instead).
- Drill-down from a line to the rows behind it, and an Excel/PDF export.
- Importing historic rows; history is opening figures only, by decision.

---

*Maintained by: Spartans CC BLR*
