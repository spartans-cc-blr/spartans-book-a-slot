# Player Payment Ledger — Wallet Statement & Admin Wallet Hub

**Spartans Hub · Added: September 2026**

---

## 1. Overview

Every wallet change (a top-up, a match fee debit) has been recorded as an
immutable `wallet_transactions` row since the S-1 route shipped (see
`security.md` §10 — that item was live in the codebase well before this
doc existed to describe it; this pass is what actually gave it a
player-facing surface). This feature adds three things on top of that
existing ledger, all driven by one request: *"players need to see the
payments they made and match fees debited, mimicking a bank statement;
admins need one place to manage top-ups and see pending fee applications
instead of bouncing between `/admin/players` and match pages; and admins
need to be able to correct historic entries, with an 'opening balance'
line covering everything from before the ledger existed."*

- **`/wallet`** — a player's own bank-statement view: current balance up
  top, then every transaction newest-first with a running post-transaction
  balance, "Load Older Transactions" pagination, and a **Brought Forward**
  line once history is exhausted.
- **`/admin/wallet`** — a single hub: pending fee applications (links out
  to the real apply-fee flow on `/admin/bookings/[id]`, which stays there
  — see §4), a player search that opens the same bank-statement component
  with a quick top-up/debit form and inline correction, and a club-wide
  recent-transactions feed.
- **Historic corrections** — admins can now edit an existing
  `wallet_transactions` row (amount, type, reason, notes, date) instead of
  it being permanently fixed the moment it's written, without actually
  making the ledger mutable-with-no-trail — see §3.

---

## 2. What already existed (S-1, pre-dates this doc)

`wallet_transactions` (migration `055_wallet_transactions.sql`,
reconstructed from a live-but-uncommitted table — see that migration's own
header comment for the drift note) and `POST`/`GET /api/wallet/transactions`
already gave `/admin/players` an inline "＋ Update Wallet" form per player
row, with the last 50 transactions shown underneath. `wallet_balance` was
already excluded from `/api/players`' PATCH allowlist
(`PLAYER_COLUMNS` in `src/app/api/players/route.ts`), and `/api/fees/apply`
already wrote a `debit` row per player alongside its balance update. None
of this is new — it's the foundation this feature builds a player-facing
view and an admin hub on top of, without changing its write semantics.

---

## 3. Historic corrections — still an audit trail, not a raw UPDATE

`wallet_transactions` stays append-only in spirit — nothing in this app
ever does a bare `UPDATE wallet_transactions SET ...` with no record of
what changed. `PATCH /api/wallet/transactions` (admin-only) instead:

1. Writes a row to the new `wallet_transaction_edits` table first,
   capturing every pre-edit value (`old_type`, `old_amount`, `old_reason`,
   `old_notes`, `old_created_at`) plus who made the correction and why
   (`edit_reason`, required, separate from and never overwriting the
   transaction's own original `reason`) — mirrors the
   `availability_audit`/`scorecard_reconciliation_log` convention already
   used elsewhere in this app for "correctable in practice, immutable on
   paper" records.
2. Updates only the fields actually sent (`type`/`amount`/`reason`/
   `notes`/`created_at`), and stamps `edited_at`/`edited_by` on the row so
   the statement UI can show a small "edited" badge.
3. If the correction changes `amount` or `type`, adjusts
   `players.wallet_balance` by exactly `newDelta - oldDelta` — this is
   mathematically safe regardless of *where* in the ledger the corrected
   row sits, since summation is commutative: shifting one historic
   transaction's contribution by `Δ` shifts the current total by the same
   `Δ`, without needing to replay the whole ledger in date order.

**`player_id` and `booking_id` are never editable** — a correction fixes
what a transaction says happened, it never reassigns who it happened to or
which match it's tied to. Reassigning either would be a fundamentally
different (and much riskier) operation than fixing a typo or a wrong
amount, and wasn't asked for.

A push notification ("💰 Wallet Correction") fires only when the edit
actually changes the player's current balance (`diff !== 0`) — a
cosmetic-only edit (fixing a typo in the reason, correcting the date)
doesn't ping the player, since nothing about their balance changed.

---

## 4. Fees stay on the booking page — this hub only surfaces *which* ones need it

`/admin/wallet`'s "Pending Fee Applications" section reuses
`getPendingFeeBookings()` (`src/lib/feeReminders.ts`, already built for
the fee-reminder push/modal — see `features/fee-reminders.md`) to list
every booking whose scorecard has synced with a fee configured and a squad
announced, but the fee hasn't been applied yet. Each row links straight to
`/admin/bookings/[id]`, where the actual apply-fee flow already lives
(per-player unit overrides, exemption checks, the confirm step) — that
complexity wasn't duplicated here. This section exists purely to close the
"I have to remember to go check matches for pending fees" gap the request
called out; the fee-mail admin still ends up on the same booking page they
always did, just without having to go hunting for which one needs it.

**Recording payments made *to* an organiser (club → organiser, not player
→ club) is explicitly out of scope for this pass** — no such tracking
exists anywhere in this app today. It's a different ledger domain (no
existing schema ties a payment to a tournament/organiser identity) from
the player wallet this feature covers. `pending-backlog.md` U-30 already
tracks a related, still-unbuilt idea (a UPI deep link + WhatsApp
"payment made" nudge for organiser settlements) — this doc doesn't
duplicate it, just confirms the gap the request asked about is real and
not yet closed.

---

## 5. "Brought Forward" — the statement's opening balance

`wallet_transactions` only ever covers changes made since the ledger
started being written to. A player's balance before that point (or before
this feature's own launch, for balance changes made via the pre-S-1 raw
`wallet_balance` PATCH) has no ledger rows behind it. Rather than trying
to backfill every historic transaction one at a time — impractical for
data nobody kept a clean log of at the time — `GET /api/wallet/transactions`
computes a **Brought Forward** line once a player's statement has paged
back to the end of their real ledger history:

```
opening_balance = players.wallet_balance − Σ(this player's wallet_transactions deltas)
```

This ties out by construction with zero admin input, for every player,
the moment the feature shipped — no backfill migration, no per-player
setup. `players.wallet_opening_balance` (nullable, `NULL` by default) lets
an admin **override** that computed value via
`PATCH /api/wallet/opening-balance` — for the case where the computed
number doesn't match their own paper/spreadsheet reconciliation, or where
attaching a human-readable note ("carried over from the legacy Google
Sheet as of Mar 2026") is worth more than the raw arithmetic. Setting
`amount: null` on that route clears the override back to the computed
default. This column is purely a display anchor for the statement's
oldest visible line — it never feeds into `players.wallet_balance` itself,
which stays the one live, authoritative current balance it's always been.

**Only computed once the statement has genuinely reached the end of
pagination** (`has_more: false`) — no point summing a player's entire
transaction history on every page of a long statement. The response only
carries `opening_balance` on that final page; the client renders the
Brought Forward row directly under the last real transaction at that
point.

**Newer transactions first, always** — per the request, there's no
"start from the opening balance and page forward" mode. `/wallet` and the
admin drill-down both always page newest-first; Brought Forward is only
ever the *last* thing you reach, never a starting point you page away
from.

---

## 6. Player statement — `/wallet`, `WalletStatementClient`

Server component `src/app/wallet/page.tsx` (auth-gated: redirect to
`/login` with no session, redirect to `/` with no `playerId` — same shape
as every other player-only page in this app) renders
`src/components/wallet/WalletStatementClient.tsx`, a client component
reused verbatim (with an `admin` prop toggled on) inside `/admin/wallet`'s
player drill-down — one component, one set of rendering/pagination rules,
instead of two statement UIs that could drift.

**Running balance is computed entirely client-side.** The server only
ever returns `current_balance` (the account's live balance) and a page of
transactions newest-first. Walking that list top-down, each row's
"balance after" is the previous row's "balance before" — starting from
`current_balance` for the very first (most recent) row. Recomputed from
scratch over the full accumulated list on every render rather than tracked
incrementally across "Load older" clicks — cheap at this app's scale (a
club statement, not a high-volume ledger) and avoids any drift bug from
trying to carry a running total forward by hand.

**Pagination** is cursor-based on `(created_at, id)` — `id` as a tie-break
since two transactions can share the same millisecond timestamp (e.g. a
fee-apply loop inserting several rows in quick succession). 20 rows per
page. The server fetches `PAGE_SIZE + 1` rows to determine `has_more`
without a separate count query.

**Admin mode** (`admin` prop, used only from `/admin/wallet`) adds:
- a "＋ Add Entry" quick top-up/debit form (thin wrapper around the
  existing `POST /api/wallet/transactions`, same as `/admin/players`'
  inline form already did);
- an "Edit" action per row opening an inline correction form (§3) — type,
  amount, reason, notes, date, and the required `edit_reason`;
- an "Adjust" action on the Brought Forward row itself (only rendered once
  the statement has reached the end, same gate as the row — §5), opening a
  small form with an amount (blank = reset to the computed default) and an
  optional note, calling `PATCH /api/wallet/opening-balance`. An "adjusted"
  badge marks a player whose Brought Forward line is currently an
  admin-set override rather than the computed default.

The `admin` prop is a pure UI toggle — it never grants anything by itself.
Both `POST` and `PATCH /api/wallet/transactions` re-check `isAdmin`
server-side regardless of what the client renders, same "UI mirrors the
API, never replaces it" posture as `wrangler-grounds-menu.md` §4.

---

## 7. Admin hub — `/admin/wallet`

`src/app/admin/wallet/page.tsx`, reached via a new "💰 Wallet" entry in
`AdminSidebar.tsx`. Three sections, most-actionable first:

1. **Pending Fee Applications** — see §4.
2. **Player Wallet** — a name search (client-side filter over
   `GET /api/players`, already admin-gated) selects a player into the
   shared `WalletStatementClient` in `admin` mode — full statement,
   quick top-up/debit, inline correction, all in one panel instead of
   three separate page visits.
3. **Recent Transactions** — a club-wide feed
   (`GET /api/wallet/transactions?scope=all`), one row per transaction
   across every player, each carrying the player's name via a
   `players(name)` join. **Clicking a row doesn't open a second, duplicate
   edit UI here** — it selects that row's player into section 2 above,
   where the full statement (with the same correction form) already
   exists. This was a deliberate choice to avoid building and maintaining
   two separate "edit a transaction" UIs that could drift from each other.

`/admin/players`' existing inline wallet section (search/edit a player,
scroll to their row, expand, "＋ Update Wallet") is untouched — it still
works exactly as it did before this feature. `/admin/wallet` is the faster
path for the common cases (a quick top-up, checking what needs a fee
applied), not a replacement for the per-player admin edit form, which
still owns everything else about a player's profile.

---

## 8. Database

### `wallet_transactions` — extended, not replaced

Migration `072_wallet_statement_corrections.sql` adds `edited_at
timestamptz` and `edited_by text` to the existing table (`055_wallet_transactions.sql`)
— both `NULL` for every transaction until an admin corrects it.

### `wallet_transaction_edits` — new, immutable

```sql
CREATE TABLE wallet_transaction_edits (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  transaction_id uuid NOT NULL REFERENCES wallet_transactions(id) ON DELETE CASCADE,
  edited_by      text NOT NULL,
  edit_reason    text NOT NULL,
  old_type       text NOT NULL,
  old_amount     numeric NOT NULL,
  old_reason     text NOT NULL,
  old_notes      text,
  old_created_at timestamptz NOT NULL,
  created_at     timestamptz NOT NULL DEFAULT now()
);
```

RLS enabled, no anon/authenticated policies — service role only, same
blanket-deny pattern as every other table in this app.

### `players` — opening balance override

```sql
ALTER TABLE players
  ADD COLUMN wallet_opening_balance numeric,          -- NULL = auto-computed, see §5
  ADD COLUMN wallet_opening_balance_note text,
  ADD COLUMN wallet_opening_balance_set_by text,
  ADD COLUMN wallet_opening_balance_set_at timestamptz;
```

Applied directly to the live project via Supabase MCP in the same session
this migration file was written and committed — no repo/DB drift for this
one (contrast with the `055_wallet_transactions.sql` reconstruction note).

---

## 9. API Routes

| Route | Method | Auth | Purpose |
|---|---|---|---|
| `/api/wallet/transactions` | GET | Own (any signed-in player with a `playerId`), or admin via `?player_id=`, or admin-only `?scope=all` | Cursor-paginated statement — own by default, matching the `/api/player/future-availability` convention; `scope=all` is the club-wide ledger feed for the admin hub |
| `/api/wallet/transactions` | POST | Admin | Unchanged S-1 behaviour + optional `created_at` for backdating a historic entry |
| `/api/wallet/transactions` | PATCH | Admin | New — corrects an existing row; writes to `wallet_transaction_edits` first, adjusts `players.wallet_balance` by the delta the correction introduces if `amount`/`type` changed |
| `/api/wallet/opening-balance` | PATCH | Admin | New — sets or clears (`amount: null`) a player's Brought Forward override |

All four re-derive `isAdmin`/own-`playerId` server-side on every call —
none of them trust a client-supplied role or player scope.

---

## 10. Security (vibe-security)

| Check | Status |
|---|---|
| `GET /api/wallet/transactions` — own rows by default; cross-player `?player_id=` and `scope=all` both re-check `isAdmin` server-side | ✅ |
| `POST`/`PATCH /api/wallet/transactions` and `PATCH /api/wallet/opening-balance` all admin-only, server-side | ✅ |
| Every write rate-limited (`RATE_LIMITS.adminWrite`); the new GET paths rate-limited (`RATE_LIMITS.publicRead`), since this is now reachable by any signed-in player, not just admin | ✅ |
| `PATCH /api/wallet/transactions` never accepts `player_id`/`booking_id` — a correction can't be used to reassign a transaction to a different player or match | ✅ |
| Every correction requires a non-empty `edit_reason`, logged to `wallet_transaction_edits` before the row itself is touched | ✅ |
| `wallet_transaction_edits` RLS enabled, no anon/authenticated policies — service role only | ✅ |
| `wallet_opening_balance*` columns never feed `players.wallet_balance` — purely a display anchor, no way to use them to alter the live balance | ✅ |
| `admin` prop on `WalletStatementClient` is UI-only — every mutating route re-checks `isAdmin` regardless of what the client renders | ✅ |
| Push payloads (top-up/debit/correction) carry only the amount, reason, and new balance already visible to that player — no other player's data | ✅ |

---

## 11. File Map

| File | Role |
|---|---|
| `supabase/migrations/072_wallet_statement_corrections.sql` | `wallet_transaction_edits` table + `wallet_transactions.edited_at`/`edited_by` + `players.wallet_opening_balance*` |
| `src/lib/schemas.ts` | `walletTransactionSchema` (now with optional `created_at`), `walletTransactionEditSchema`, `walletOpeningBalanceSchema` |
| `src/app/api/wallet/transactions/route.ts` | GET (self/admin/`scope=all`, paginated, Brought Forward calc), POST (unchanged S-1 + backdating), PATCH (new — corrections) |
| `src/app/api/wallet/opening-balance/route.ts` | PATCH — admin override of the Brought Forward line |
| `src/app/wallet/page.tsx` | Player's own statement page |
| `src/components/wallet/WalletStatementClient.tsx` | Shared bank-statement component — self view and admin drill-down |
| `src/app/admin/wallet/page.tsx` | Admin hub — pending fees, player search + drill-down, club-wide feed |
| `src/components/admin/AdminSidebar.tsx` | New "💰 Wallet" nav entry |
| `src/components/ui/SiteNav.tsx` | "💰 My Wallet" added to the desktop profile dropdown |
| `src/components/ui/MobileTabBar.tsx` | "My Wallet" added to the mobile "More" sheet, `RupeeIcon`, `wallet` added to `isAdminOrGcHighlighted()` |
| `src/app/page.tsx` | Home dashboard's Wallet Balance stat tile is now a drill-down link (`href="/wallet"`), same convention as Upcoming Matches / Matches Played |
| `src/app/profile/page.tsx` | Wallet balance display (both the top dashboard card and the Club Details card) links to `/wallet` |
| `src/app/api/fees/apply/route.ts` | Unchanged — still the sole writer of fee-debit ledger rows; `/admin/wallet`'s pending-fees section only links here, never duplicates this logic |
| `src/lib/feeReminders.ts` | Unchanged — `getPendingFeeBookings()` reused as-is by the new hub section |

---

## 12. Explicitly Out of Scope

- **Organiser payment tracking** (club → tournament organiser) — see §4.
  No schema, no route, no UI. A separate, unbuilt idea
  (`pending-backlog.md` U-30) covers a related but distinct
  UPI-deep-link + WhatsApp nudge for that direction of payment.
- **Paging *forward* from an opening balance** — the statement is
  newest-first only, per the request ("for now we should start with newer
  transactions"). There's no "start at Brought Forward and scroll toward
  today" mode.
- **A full backfill of pre-ledger transactions** — deliberately not
  attempted; the computed Brought Forward line (§5) exists specifically so
  this isn't needed for every player to get a correct, complete-looking
  statement.
- **Editing `player_id`/`booking_id` on a transaction** — see §3.
- **Reversing an applied match fee from this UI** — `PATCH /api/wallet/transactions`
  can correct a debit's amount/reason, but nothing here bulk-reverses an
  entire `/api/fees/apply` run; that's still whatever manual process
  (admin corrections one row at a time, same as any other ledger mistake)
  this app already relied on before this feature.

---

*Maintained by: Spartans CC BLR*
