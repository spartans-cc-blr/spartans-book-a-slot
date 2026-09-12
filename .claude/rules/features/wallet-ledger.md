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

**`amount`/`type` are refused outright on a row that already carries a
`booking_id` (added September 2026).** Such a row is one player's *share*
of a match-fee split (`/api/fees/apply`), not an independent figure —
editing it here would silently desync that one player from what the rest
of the squad was actually charged, with nothing recomputed. The check
compares against the *resulting* value, not merely whether the field was
sent (the client always resends the current type/amount alongside a
reason-only edit, so a bare "was this field present" check would have
wrongly blocked a cosmetic fix too — see the route's own comment).
`reason`/`notes`/`created_at` stay editable on such a row exactly as
before; only `amount`/`type` are blocked. `PATCH /api/fees/apply`
("Correct Match Fee" on `/admin/bookings/[id]`) is the only path that can
change a fee-split amount, since it's the only one that recalculates and
re-propagates the whole squad's shares together — see
`features/post-match-scorecard.md` §6.1. `WalletStatementClient.tsx`'s
edit form mirrors this (Type/Amount disabled with an inline note when
`booking_id` is set) but the server check is the real gate, same "UI
mirrors the API, never replaces it" posture as everywhere else in this
app.

A push notification ("💰 Wallet Correction") fires only when the edit
actually changes the player's current balance (`diff !== 0`) — a
cosmetic-only edit (fixing a typo in the reason, correcting the date)
doesn't ping the player, since nothing about their balance changed.

### 3.1 Deleting an entry entirely (added September 2026)

Reported gap: correcting an entry's amount down to a typed number is the
right tool for a *wrong* charge, but not for one that should never have
existed at all (a duplicate top-up, an entry created by mistake) — an
admin needed to remove it from the statement outright, with a reason on
record.

**Soft delete, not a real `DELETE`.** Migration `076_wallet_transaction_soft_delete.sql`
adds `deleted_at`/`deleted_by`/`delete_reason` to `wallet_transactions`.
`DELETE /api/wallet/transactions` (admin-only, `{ id, delete_reason }`,
`delete_reason` required — same Zod-validated shape as an edit's
`edit_reason`) stamps those three columns and reverses the row's balance
effect (`players.wallet_balance -= oldDelta`, the same math a correction
that zeroed the amount would produce) — but the row is **never physically
removed**. A real `DELETE` would also cascade away that row's own
`wallet_transaction_edits` history via that table's `ON DELETE CASCADE`,
destroying the very audit trail this feature exists to keep. Every read
this route does against `wallet_transactions` — the self/`?player_id=`
statement, the admin `scope=all` club-wide feed, and the opening-balance
ledger sum — filters `.is('deleted_at', null)`, so a deleted row simply
disappears from every surface without ever being gone from the database.

**Same `booking_id` refusal as the correction flow.** A match-fee entry
(any row with `booking_id` set) can't be deleted here for the identical
reason `amount`/`type` can't be edited on one (§ above) — it's one
player's share of a squad-wide split, and removing it would silently
change what that player owes with nothing recomputed for the rest of the
squad. `WalletStatementClient.tsx` shows a disabled "Delete" label with an
explanatory tooltip on such rows instead of a working button, pointing at
"Correct Match Fee" on the booking page — same "UI mirrors the API"
posture as everywhere else.

**`membership_fee_charges`/`wallet_transfers` link rows are left as-is.**
Deleting a quarterly-membership-fee debit doesn't reset its
`membership_fee_charges` row (§12) — that row's `UNIQUE(player_id, year,
quarter)` guard is what stops a future re-sync from ever charging the
same quarter twice, and losing that protection just because the visible
ledger row was removed would be worse than the gap this closes. Same for
a sponsorship transfer's `wallet_transfers` link (§14) — the linked
transaction still physically exists (soft delete only), so the link
itself is never broken.

**UI** — a "Delete" action sits next to "Edit" on every non-fee-split row
(admin mode only). Tapping it opens an inline confirm panel (mutually
exclusive with the Edit panel — opening one closes the other) explaining
what will happen and requiring a reason before "🗑 Delete Entry" is
enabled. A push notification (`💰 Wallet Entry Removed`) fires the same
way every other balance-changing action in this app does.

### 3.2 Two correction-form bugs fixed (September 2026)

Both reported the same session, both in `WalletStatementClient.tsx`'s
"Edit" (correction) form:

- **Setting the amount to `0` silently failed to save.** `saveEdit()`'s
  client-side guard was `if (!amount || amount <= 0 || ...)` — `!amount`
  alone is `true` for `0` in JavaScript (`0` is falsy), so the form
  refused to submit *before* even reaching the server. The server schema
  (`walletTransactionEditSchema.amount`) also independently rejected `0`
  via `.positive()`. This directly blocked the very correction pattern
  §12.1 itself documents as the intended way to reverse a mistaken charge
  down to nothing while keeping the row visible — a doc-blessed capability
  the validation had never actually allowed through the UI. Fixed on both
  sides: the client check is now `isNaN(amount) || amount < 0`, and the
  schema uses `.min(0, ...)` instead of `.positive()` — `0` is a valid
  corrected amount now, still rejecting negative/non-numeric input. The
  create schema (`walletTransactionSchema`, for brand-new entries) is
  untouched and still requires a positive amount — a fresh ₹0 entry
  wouldn't mean anything.
- **Picking today's date and saving before local noon failed with "not in
  the future."** `saveEdit()` built the correction's `created_at` as
  `new Date(editForm.created_at + 'T12:00:00').toISOString()` — noon,
  local time. The server's `pastIsoDatetimeSchema` rejects anything more
  than a minute ahead of `Date.now()`. Noon-local-today, converted to UTC,
  is *later* than the actual current UTC instant whenever it's currently
  before noon in the browser's own timezone — so an admin correcting a
  transaction any time before noon IST and leaving the date on "today"
  (its natural default) got rejected as a future date, and had to
  backdate to yesterday just to get the save through. Fixed by anchoring
  at local midnight (`T00:00:00`) instead of noon — midnight-of-today is
  always `<= now()`, for any timezone, at any time of day — matching the
  `T00:00:00` convention every other date-string-to-`Date` conversion in
  this app already uses (`CaptainsCornerGrid.tsx`, `dateChipGroups.ts`,
  `announcement.ts`, etc.) rather than introducing a second, inconsistent
  anchor.

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

**Once a fee is applied and turns out to be wrong** (the base fee, or the
per-player share split), the fix also stays on `/admin/bookings/[id]` — a
"✏️ Correct Match Fee" action recomputes and re-propagates the split across
the squad. See `features/post-match-scorecard.md` §6.1.

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

**Not the tool for reversing a mistaken in-ledger transaction.** Because
this column never feeds `players.wallet_balance`, it can't be used to fix
an actual wrong balance — only to annotate the display anchor beneath
already-correct ledger history. A real mistaken debit/credit (e.g. a match
fee applied after it had already been settled outside the Hub — see
`features/post-match-scorecard.md` §6.1's 9 Sep 2026 incident) needs a
genuine reversing transaction in the ledger itself, not a Brought Forward
adjustment alongside it.

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

### 7.1 Match-fee debit rows link to the scorecard (added September 2026)

A wallet row for a match-fee debit already carried `booking_id` on
`wallet_transactions` (`/api/fees/apply` always sets it — see §4) but
nothing on either statement surface let a viewer act on that link. Any row
whose `booking_id` is present now renders a small "📊 View Scorecard" link
next to its date, pointing at `/matches/history/<booking_id>` (the same
per-match scorecard page `/matches/history` itself links into — see
`features/post-match-scorecard.md` §9/§11) — a top-up, quarterly
membership fee, or sponsorship transfer (§12/§14, none of which ever set
`booking_id`) simply has no link to show, same "absent field, absent UI"
pattern the rest of this feature already uses.

**`WalletStatementClient.tsx`** (both the player's own `/wallet` and the
admin drill-down reuse it) renders the link inline in the date line — its
rows are plain `<div>`s, so nesting a `<Link>` needed no structural change.

**`admin/wallet/page.tsx`'s own club-wide "Recent Transactions" feed**
needed one: each row there was a `<button>` (the whole row is a click
target that selects that transaction's player into the Player Wallet
section above) and HTML doesn't allow an `<a>`/`<Link>` to nest inside a
`<button>`. Converted the row wrapper to `<div role="button" tabIndex={0}>`
with its own `onClick`/`onKeyDown` (Enter/Space) handlers — the same
pattern `BattingPositionLeaders.tsx` already uses for an identical
link-inside-a-clickable-row shape (see `features/leaderboard.md` §6.1).
The nested scorecard `<Link>` stops propagation on click so tapping it
navigates to the scorecard instead of also triggering the row's own
select-player behaviour.

`GET /api/wallet/transactions?scope=all` was widened to select
`booking_id` alongside its existing columns so this admin feed has it to
render — the self/`?player_id=` paths already selected `booking_id` from
the start (used by the running-balance/statement view), so only the
`scope=all` branch needed the addition.

### 7.2 Statement row alignment fix — amount/Edit column no longer wobbles (fixed September 2026)

**Reported symptom:** on the admin player drill-down, the amount/balance
block and the "Edit" link visibly shifted left/right from row to row
instead of lining up in a column, most noticeable once §7.1's "📊 View
Scorecard" link (which lengthens the date line only on match-fee rows)
was in the mix alongside rows with a longer/shorter `reason` string.

**Root cause:** each row in `WalletStatementClient.tsx` was a 3-child flex
container (`flex items-center justify-between`) — the label block (reason/
notes/date), the amount+balance block, and (admin mode) the Edit button.
`justify-between` across **three** items only pins the first flush-left and
the last flush-right; it splits the *leftover* space into two equal gaps
around the middle item, so the amount/balance block's actual x-position
floated depending on how wide the label block's text happened to be on
that particular row — never a fixed column the eye could track down the
list.

**Fix:** the label block is now `flex-1` (it genuinely grows to fill the
row, rather than just sizing to its own content), and the amount/balance
block + Edit button are grouped into one `flex-shrink-0` container so they
move together as a single unit pinned to the row's right edge — a 2-region
layout (grow / fixed) instead of 3 competing regions. The amount/balance
block also got a fixed `min-w-[92px]`, so `₹38` and `₹1,748` both
right-align to the same column instead of the digit count itself nudging
Edit sideways. Purely a layout fix — no data, route, or behavior change;
`admin/wallet/page.tsx`'s own club-wide feed was unaffected (its rows are
only 2-child `justify-between`, which doesn't have this ambiguity).

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
| `/api/wallet/transactions` | PATCH | Admin | New — corrects an existing row; writes to `wallet_transaction_edits` first, adjusts `players.wallet_balance` by the delta the correction introduces if `amount`/`type` changed. Refuses a genuine `amount`/`type` change on any row carrying `booking_id` — that's a match-fee split share, correctable only via `PATCH /api/fees/apply` (§3) |
| `/api/wallet/transactions` | DELETE | Admin | New (§3.1) — soft-deletes a row (`deleted_at`/`deleted_by`/`delete_reason`, never a real `DELETE`), reverses its balance effect. Requires `delete_reason`; refuses any row carrying `booking_id`, same as PATCH's amount/type block |
| `/api/wallet/opening-balance` | PATCH | Admin | New — sets or clears (`amount: null`) a player's Brought Forward override |

All five re-derive `isAdmin`/own-`playerId` server-side on every call —
none of them trust a client-supplied role or player scope.

---

## 10. Security (vibe-security)

| Check | Status |
|---|---|
| `GET /api/wallet/transactions` — own rows by default; cross-player `?player_id=` and `scope=all` both re-check `isAdmin` server-side | ✅ |
| `POST`/`PATCH /api/wallet/transactions` and `PATCH /api/wallet/opening-balance` all admin-only, server-side | ✅ |
| Every write rate-limited (`RATE_LIMITS.adminWrite`); the new GET paths rate-limited (`RATE_LIMITS.publicRead`), since this is now reachable by any signed-in player, not just admin | ✅ |
| `PATCH /api/wallet/transactions` never accepts `player_id`/`booking_id` — a correction can't be used to reassign a transaction to a different player or match | ✅ |
| `PATCH /api/wallet/transactions` refuses a genuine `amount`/`type` change on any row carrying `booking_id` — checked against the resulting value, not just field presence | ✅ |
| Every correction requires a non-empty `edit_reason`, logged to `wallet_transaction_edits` before the row itself is touched | ✅ |
| `wallet_transaction_edits` RLS enabled, no anon/authenticated policies — service role only | ✅ |
| `DELETE /api/wallet/transactions` is a soft delete, never a real `DELETE` — the row and its full pre-deletion state stay in the database; only reads filter it out (§3.1) | ✅ |
| `DELETE /api/wallet/transactions` requires a non-empty `delete_reason` and refuses any row carrying `booking_id` — same guard as PATCH's amount/type block | ✅ |
| `wallet_opening_balance*` columns never feed `players.wallet_balance` — purely a display anchor, no way to use them to alter the live balance | ✅ |
| `admin` prop on `WalletStatementClient` is UI-only — every mutating route re-checks `isAdmin` regardless of what the client renders | ✅ |
| Push payloads (top-up/debit/correction) carry only the amount, reason, and new balance already visible to that player — no other player's data | ✅ |

---

## 11. File Map

| File | Role |
|---|---|
| `supabase/migrations/072_wallet_statement_corrections.sql` | `wallet_transaction_edits` table + `wallet_transactions.edited_at`/`edited_by` + `players.wallet_opening_balance*` |
| `supabase/migrations/076_wallet_transaction_soft_delete.sql` | `wallet_transactions.deleted_at`/`deleted_by`/`delete_reason` (§3.1) |
| `src/lib/schemas.ts` | `walletTransactionSchema` (now with optional `created_at`), `walletTransactionEditSchema` (amount now `.min(0)`, §3.2), `walletTransactionDeleteSchema` (§3.1), `walletOpeningBalanceSchema` |
| `src/app/api/wallet/transactions/route.ts` | GET (self/admin/`scope=all`, paginated, Brought Forward calc, all filtered `deleted_at IS NULL`), POST (unchanged S-1 + backdating), PATCH (corrections), DELETE (new — soft delete, §3.1) |
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

## 12. Quarterly Membership Fee — automatic ₹250 debit

Added alongside this feature: a third transaction type layered onto the
same ledger, distinct from the admin top-up/debit (§ above) and the
existing match-fee debit (`/api/fees/apply`) — a **quarterly membership
fee**, ₹250, debited automatically the moment a player's first
role-fulfilling match of a calendar quarter (Jan–Mar, Apr–Jun, Jul–Sep,
Oct–Dec) syncs. Unlike match fees, there is no admin review step here —
per product decision, this fires unattended, the same way milestone
recognition and fee reminders already do inside the scorecard sync
pipeline.

### "Role-fulfilling" — deliberately wider than the match-fee signal

`/api/fees/apply` only credits a player as having "played" if they batted
or bowled (`battedIds`/`bowledIds`, used to decide who owes a match-fee
share). The membership fee's qualifying signal is wider, per product
decision: **batted, bowled, or recorded a fielding dismissal** (catches +
caught-behind + run-outs + stumpings > 0). A fielding-only contribution —
a substitute who only took a catch, say — still counts as genuine
participation for membership purposes even though it doesn't currently
earn a match-fee share. The two signals are computed independently and can
disagree on the same match; that's expected, not a bug.

### Where it's detected — `src/lib/membershipFee.ts`

`chargeMembershipFeeIfDue()` is called from `syncMatchStatsForBooking()`
in the same `Promise.all()` as `detectAndLogMilestones()`/
`detectAndLogMatchPerformances()` — one hook covers both the manual "Sync
Stats" click and the unattended twice-daily backfill/cron path, same
reasoning `features/milestone-recognition.md` §2 already documents for
those two detectors. Best-effort: the whole function is wrapped so a bug
here can never fail the scorecard sync it's attached to.

**Practice-tournament matches are excluded** — same "real stats only"
posture as every other aggregate/ranking surface in this app
(`features/leaderboard.md` §10). A practice game producing a century still
gets celebrated (see milestone-recognition.md's own carve-out for that),
but it was judged that fielding a full team for an informal practice game
shouldn't itself trigger a real money debit.

### Idempotency — DB-enforced, not just checked in code

`membership_fee_charges` (migration `073_membership_fee_charges.sql`) has
`UNIQUE(player_id, year, quarter)`. `chargeOnePlayer()` inserts this row
**first**, as a plain `INSERT` (never an upsert) — a `23505` unique-
violation means this player was already charged this quarter (by an
earlier match, or a concurrent/duplicate sync of this same one), and the
function stops immediately, before ever touching the wallet. Only a
successful, non-conflicting insert proceeds to look up the player's
current balance, insert the `wallet_transactions` debit row, update
`players.wallet_balance`, link `membership_fee_charges.wallet_transaction_id`
back to that row, and push a notification. This mirrors the
"claim the slot before doing the side effects" pattern
`availability_nudge_log` already uses for the exact same reason (see
`features/availability-nudge.md` §4) — safe under a re-sync or a
theoretical concurrent double-invocation without needing a separate lock.

### The ledger row deliberately omits `booking_id`

Every other debit in this ledger that's tied to a specific match
(`/api/fees/apply`'s match-fee debits) sets `wallet_transactions.booking_id`
to that match. The membership-fee debit does **not**, even though the
triggering match is fully known (it's recorded on
`membership_fee_charges.booking_id` instead) — `/api/fees/apply`'s
"has this booking's fee already been applied" guard
(`.eq('booking_id', booking_id).eq('type', 'debit').limit(1)`) checks for
*any* debit carrying that booking_id, regardless of reason. A membership-fee
debit sharing the same `booking_id` as its triggering match would falsely
trip that guard the next time an admin tried to apply a genuinely
un-applied match fee for that same booking. Traceability is preserved two
other ways instead: `membership_fee_charges.booking_id` (a separate table,
never read by the fee-apply guard) and a `notes` value on the
`wallet_transactions` row itself ("Triggered by match on 12 Jul 2026"),
which renders on the player's statement the same way any other
transaction's notes do.

### Backfill — Q3 2026, run once at launch

Per product decision, this didn't ship prospective-only: a one-time
backfill was run the same session, over every confirmed, non-practice,
already-synced booking in the **current** calendar quarter at the time
(Q3 2026, 1 Jul–30 Sep), computing each player's first qualifying match
that quarter directly from `match_stats_cache`'s already-cached
batting/bowling/fielding arrays (real `player_id` values, already
reconciled) and applying the identical qualification rule
`chargeMembershipFeeIfDue()` now enforces going forward. Run directly
against the live database via Supabase MCP SQL — same "one-off backfill
documented here, not committed as a script" convention this app already
established for prior baseline backfills (see
`features/milestone-recognition.md` §8/§8.1). Charged **52 players** ₹250
each, all correctly deduplicated (one charge per player for the quarter,
confirmed via a post-hoc count) and each linked to its `wallet_transactions`
row.

No earlier quarter was backfilled — the request was specifically to catch
up the quarter in progress, not retroactively invoice every past quarter
the club has played.

### 12.1 Fee-exempt players — excluded going forward, backfilled charges reversed (added September 2026)

**The gap:** the original design (§12's own "Explicitly Out of Scope" list,
before this pass) deliberately charged everyone who played a
role-fulfilling match in the quarter, with "no proration, refund, or
exemption." That was too wide — a player with a standing `fee_exemptions`
row (the same table `/api/fees/apply` already excludes from match-fee
shares, see `security.md` §4/`architecture.md` §6) shouldn't owe the
quarterly membership fee either. The Q3 2026 backfill (above) predates
this fix and charged **6** already-exempt players before the gap was
caught: Chayanveer Sharma, Keshav Renganathan, Kushal Vidya, Loki,
Manohar B Reddy, and Thimmappa Shankarappa — each had an open-ended
(`end_date IS NULL`) `fee_exemptions` row whose `start_date` predates the
match that triggered their charge.

**Code fix — `chargeMembershipFeeIfDue()`:** after computing
`qualifyingIds` (§12's batted/bowled/fielding-dismissal signal), the
function now batch-fetches `fee_exemptions` for those players and drops
anyone whose exemption window (`start_date <= game_date && (end_date ===
null || end_date >= game_date)`) covers the triggering match's `game_date`
— same `isExempt` check `/api/fees/apply` already applies to match fees,
so the two "does this player pay a fee" signals can't drift apart. Checked
against the match's own `game_date`, not "today" (the sync could run days
after the match) — consistent with `quarterOf(gameDate)` already deciding
which quarter the charge belongs to off the same date. An exempt player
gets **no** `membership_fee_charges` row and no wallet debit at all — not
a charge-then-waive, just skipped, the same way a practice-tournament
match is skipped outright earlier in the same function.

**Data fix — the 6 already-charged players were reversed, not deleted.**
Consistent with this ledger's append-only posture (§3): each of the 6
`wallet_transactions` debit rows was corrected via the exact same
mechanism `PATCH /api/wallet/transactions` uses — a `wallet_transaction_edits`
row was written first (capturing the original `amount: 250`, `reason`,
`notes`), then the transaction's own `amount` was set to `0` (never
deleted — the row still marks *that a membership fee cycle happened and
was waived*, not that it never existed), `reason` gained a `(waived — fee
exempt)` suffix, and `notes` gained a `Reversed: player has a standing fee
exemption on file.` line — so the statement row reads as self-explanatory
even at ₹0, with no need to open the edit history to understand it. Each
player's `wallet_balance` was credited back ₹250. Run directly against the
live database via Supabase MCP SQL, mirroring the PATCH route's own
read-edit-write-then-adjust-balance steps exactly rather than inventing a
new correction shape — same "one-off fix documented here, not committed as
a script" convention as the original backfill.

**`membership_fee_charges` rows for these 6 players were left in place,
untouched.** The row is still accurate — each player's first
role-fulfilling match of Q3 2026 genuinely did occur on that date — only
the *fee* tied to it was wrong. Leaving the row also means the
`UNIQUE(player_id, year, quarter)` guard still correctly prevents a future
re-sync of the same match from charging them again (moot in practice now
that they're excluded upstream by the code fix too, but harmless either
way — see §3's "corrections fix what happened, they don't rewrite whether
it happened" framing, applied here to a charge-cycle row rather than a
wallet_transactions row).

### Security (vibe-security)

| Check | Status |
|---|---|
| No new API route, no new client-reachable input at all — this is triggered entirely from inside the server-side scorecard sync pipeline | ✅ |
| Idempotency enforced by a DB unique constraint, not just an application-level check — safe under a concurrent or duplicate sync | ✅ |
| `membership_fee_charges` RLS enabled, no anon/authenticated policies — service role only | ✅ |
| Every debit still lands in the same `wallet_transactions` ledger — visible on the player's own `/wallet` statement and `/admin/wallet`'s club-wide feed with no additional code, since it's just another row of that same table | ✅ |
| A detection failure can never fail the scorecard sync it's attached to (same posture as milestone detection and fee reminders) | ✅ |
| Fee-exempt players excluded server-side before any charge is made (§12.1) — never relies on a later correction to fix what should never have happened | ✅ |
| The 6-player reversal (§12.1) went through the same audit-logged correction path (`wallet_transaction_edits`) as any other admin correction — no bare `UPDATE`, no deleted row | ✅ |

### File Map additions

| File | Role |
|---|---|
| `supabase/migrations/073_membership_fee_charges.sql` | `membership_fee_charges` table — `UNIQUE(player_id, year, quarter)` is the idempotency guard |
| `src/lib/membershipFee.ts` | `chargeMembershipFeeIfDue()` / `chargeOnePlayer()` / `quarterOf()` |
| `src/lib/matchStatsSync.ts` | Calls `chargeMembershipFeeIfDue()` alongside milestone/performance detection, inside the same `Promise.all()` |

---

## 14. Sponsorship Transfers — player-to-player wallet transfers

Added alongside the above: a fourth thing this ledger now records —
**one player's wallet covering another's**, e.g. a senior player
sponsoring a junior teammate's dues. This debits the sponsor's wallet and
credits the beneficiary's by the same amount, as two ordinary
`wallet_transactions` rows linked together by a new `wallet_transfers`
row.

### Admin-only — deliberately, not a self-service feature

Every wallet-balance change in this app has always been admin-triggered
(top-ups/debits via `POST /api/wallet/transactions`, match fees via
`/api/fees/apply`, the membership fee via the sync pipeline — §12) — no
player has ever been able to move money themselves, including their own.
Per product decision, sponsorship transfers keep that same posture rather
than becoming the first player-initiated wallet write in the app: an
admin records the transfer from `/admin/wallet`, picking both the sponsor
and the beneficiary, the same way they'd record any other top-up or
debit. A self-service version (a player sponsoring a teammate directly
from their own `/wallet`) was considered and explicitly deferred — it
would need its own confirmation/consent UX and a real change to this
app's trust model, neither of which was asked for here.

### `wallet_transfers` — a link, not a source of truth

```sql
CREATE TABLE wallet_transfers (
  id                         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sponsor_player_id          uuid NOT NULL REFERENCES players(id),
  beneficiary_player_id      uuid NOT NULL REFERENCES players(id),
  amount                     numeric NOT NULL,
  reason                     text NOT NULL,
  sponsor_transaction_id     uuid REFERENCES wallet_transactions(id) ON DELETE SET NULL,
  beneficiary_transaction_id uuid REFERENCES wallet_transactions(id) ON DELETE SET NULL,
  created_by                 text NOT NULL,
  created_at                 timestamptz NOT NULL DEFAULT now(),
  CHECK (sponsor_player_id != beneficiary_player_id)
);
```

Mirrors `membership_fee_charges`' own pattern (§12) of a small table
linking to the `wallet_transactions` row(s) it produced, purely for
display/reporting — nothing in this app ever reads `wallet_transfers` to
derive a balance. `players.wallet_balance` and `wallet_transactions` stay
the sole source of truth for money, exactly as before this feature.
Migration `074_wallet_transfers.sql`. RLS enabled, no anon/authenticated
policies — service role only, same blanket-deny pattern as every other
table in this app.

### `POST /api/wallet/transfers` — admin-only

Body: `{ sponsor_player_id, beneficiary_player_id, amount, reason }`
(Zod-validated `walletTransferSchema`, `src/lib/schemas.ts` — rejects a
sponsor sponsoring themselves). Writes, in order: sponsor's debit row →
beneficiary's credit row → the `wallet_transfers` link row → sponsor's
`wallet_balance` update → beneficiary's `wallet_balance` update. Same
"ledger rows first, balance updates after" ordering every other wallet
write in this app already uses, and the same sequential-writes-with-
reported-partial-failure posture (no true cross-table atomicity — matches
`PATCH /api/wallet/transactions`' own balance-sync-failure handling) —
a failure partway through always leaves an inspectable ledger trail an
admin can reconcile from, rather than a balance change with nothing
behind it.

**No balance check on the sponsor** — same posture as every other debit
in this app (match fees, membership fees, admin debits): nothing here
blocks a debit because the resulting balance would go negative. "Dues
outstanding" is already a normal, tracked state throughout the Hub.

Each side's `wallet_transactions.reason` names the other player, so both
halves read clearly on their own statement even without cross-referencing
`wallet_transfers`:
- Sponsor: `Sponsorship for <beneficiary> — <reason>`
- Beneficiary: `Sponsored by <sponsor> — <reason>`

Both players get a push notification (`💰 Wallet Debited — Sponsorship` /
`🎁 You Were Sponsored!`), same as every other balance-changing action in
this app.

### UI — inside the existing player drill-down, not a new page

`WalletStatementClient.tsx`'s admin mode gained a second quick action,
"🎁 Sponsor", next to "＋ Add Entry" (§6) — opens a small panel: search-
and-select a beneficiary (lazily fetches `GET /api/players`, the same
admin-gated roster `/admin/wallet`'s own player search already uses),
amount, reason. The already-selected player (whoever the admin is
currently viewing in `/admin/wallet`'s Player Wallet section) is always
the sponsor — there's no separate "pick both players" flow, since an
admin sponsoring on someone's behalf naturally starts from that person's
own statement. No new page or route was added beyond the API endpoint.

### Security (vibe-security)

| Check | Status |
|---|---|
| Admin-only, server-side — same trust model as every other wallet-balance write in this app | ✅ |
| `sponsor_player_id !== beneficiary_player_id` enforced both in the Zod schema and a DB `CHECK` constraint — never trusts one layer alone | ✅ |
| Rate-limited (`RATE_LIMITS.adminWrite`) | ✅ |
| `wallet_transfers` RLS enabled, no anon/authenticated policies — service role only | ✅ |
| Both resulting `wallet_transactions` rows are ordinary ledger rows — visible on each player's own `/wallet` statement and `/admin/wallet`'s club-wide feed with no additional code | ✅ |
| No new client-reachable path to alter a balance beyond the existing admin-only routes | ✅ |

### File Map additions

| File | Role |
|---|---|
| `supabase/migrations/074_wallet_transfers.sql` | `wallet_transfers` table |
| `src/lib/schemas.ts` | `walletTransferSchema` |
| `src/app/api/wallet/transfers/route.ts` | POST — admin-only sponsorship transfer |
| `src/components/wallet/WalletStatementClient.tsx` | "🎁 Sponsor" quick action (admin mode) — beneficiary search, amount, reason |

---

## 15. Explicitly Out of Scope

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
  corrects one player's own debit/credit row at a time; it has no notion of
  "this row was one player's share of a match fee split" and can't
  recompute or re-propagate a share across a whole squad, so as of
  September 2026 it **refuses outright** (server-side, not just a UI
  omission) any genuine `amount`/`type` change on a row carrying
  `booking_id` — see §3. **Correcting a match fee at the match level**
  (the base fee or the per-player unit split was wrong, and the whole
  squad's charges need recalculating together) is a separate addition —
  `PATCH /api/fees/apply`, reached from the "✏️ Correct Match Fee" action
  on `/admin/bookings/[id]`'s Post-Match panel, not from `/wallet` or
  `/admin/wallet`. It posts a fresh, append-only adjusting ledger entry per
  affected player (never mutates the original debit rows, and fully
  refunds a player later removed from the squad entirely, not just one
  zeroed within an unchanged squad) and logs one summary row per
  correction event to `match_fee_corrections`. See
  `features/post-match-scorecard.md` §6.1 for the full mechanics — this
  doc's own `PATCH /api/wallet/transactions` (§3) remains the right tool
  for a genuinely single-player, non-fee-split mistake (a fat-fingered
  top-up amount, a wrong reason string, backdating) — `reason`/`notes`/
  `created_at` stay editable there even on a fee-split row, only
  `amount`/`type` are blocked.
- **No admin review step for the membership fee** (§12) — unlike match
  fees, it debits unattended the moment a qualifying match syncs. A wrong
  charge is corrected the same way any other ledger mistake is: an admin
  edits or reverses the resulting `wallet_transactions` row via §3's
  correction flow.
- **No proration or refund for the membership fee** — a player who joins
  or is expelled mid-quarter is not specially handled; the same fixed
  ₹250, first-qualifying-match rule applies to everyone who plays a
  role-fulfilling match in the quarter. **A standing `fee_exemptions` row
  *is* now handled** (§12.1, added September 2026) — an exempt player is
  excluded from the charge entirely, not charged-then-refunded. Proration/
  refund for a mid-quarter join or expulsion is still not requested, and
  would need its own design pass if it ever is.
- **No configurable amount or quarter boundary** — `MEMBERSHIP_FEE_AMOUNT`
  (₹250) and the calendar-quarter definition are both hardcoded in
  `src/lib/membershipFee.ts`, not admin-editable settings.
- **Player-initiated sponsorship transfers** (§14) — a player sponsoring a
  teammate directly from their own `/wallet`, with no admin step, was
  considered and explicitly deferred; every transfer today is admin-
  recorded.
- **A "sponsorships given/received" report** — `wallet_transfers` makes
  this queryable later (sum by `sponsor_player_id`/`beneficiary_player_id`
  across a season, say), but no such view was built — not requested.

---

## 16. Admin Wallet Export — downloadable report (added September 2026)

An "⬇ Export" menu in the top-right corner of `/admin/wallet`'s header,
next to the page title, with a single item: **"📊 Wallet Report (.xlsx)"**.
Downloads one real workbook with two named sheets:

- **Summary** — a small dashboard header (title, generated timestamp, and
  three KPI tiles — Total Players, Total Balance, Players Overdue) followed
  by one row per player: `Player Name`, `Wallet Balance` (their current,
  live `players.wallet_balance` — the same number shown everywhere else in
  the app, not a computed-as-of-today figure).
- **Detailed** — the same dashboard-style title/timestamp header, then one
  row per transaction, grouped by player in chronological (oldest-first)
  order: `Player Name`, `Transaction` (a single descriptive string — date,
  credit/debit, amount, reason), and `Running Total` (the balance after
  that transaction). Each player's block is seeded with a `Brought Forward`
  row using the exact same `opening = wallet_balance − Σ ledger deltas`
  formula (admin override via `wallet_opening_balance` taking precedence,
  same as everywhere else — see §5) the `/wallet` statement page already
  uses for its own Brought Forward line — so the exported running total
  ties out to a real ledger, not just a bare transaction dump, and the
  club-wide export can never disagree with what a player sees on their own
  statement. A player with zero transactions has no rows on the Detailed
  sheet (nothing to show) but still appears on Summary.

**`fetchAllTransactions()` filters `deleted_at IS NULL` (added alongside
§3.1's soft-delete capability)** — a soft-deleted row's balance effect is
already reversed out of `players.wallet_balance` at delete time, so
including it in this file's own running-total sum would double it back in
and break the "ties out to a real ledger" guarantee this section exists
to make. Same filter every other read of `wallet_transactions` in this
feature applies.

Both sheets are visually themed to match the rest of the Hub — a dark
header row (`#1A1208`/`#D97706`, the same nav-bar tokens `ui-theme.md`
defines), alternating light bands per player block on the Detailed sheet,
green/red text on positive/negative amounts, thin borders, a frozen header
row (`stickyRowsCount`), and sized columns — rather than a bare unstyled
data dump.

### Incident (September 2026) — the first cut's "Detailed" sheet routinely
### came back empty in real Excel

**Symptom reported:** opening the downloaded file showed the Summary
sheet's data duplicated onto — or the Detailed sheet rendering as —
completely empty.

**Root cause.** The first cut avoided adding an xlsx-writing library (see
`limitations.md`'s cold-start audit — "only 11 runtime dependencies... no
PDF/image-processing/chart libraries") by emitting the long-standing
HTML-based SpreadsheetML workbook format instead — the same thing Excel
itself produces via *File → Save As → Web Page*: a plain HTML document
whose `<head>` names two sheets via an `<x:ExcelWorkbook>`/
`<x:ExcelWorksheet>` block, and whose `<body>` has one `<table>` per sheet.
This is a real, historically-documented Microsoft format, but it turned out
to be unreliable across real-world Excel versions — several confirmed
Excel builds don't split multiple `<table>` elements into separate sheets
the way the format nominally promises; instead they import the whole HTML
document as a single sheet (or drop everything past the first table),
which is exactly the "Detailed has nothing" symptom reported. This is a
known fragility of the technique, not a bug in this app's HTML generation
— it just isn't a safe foundation for something admins need to trust.

**Fix — a real .xlsx via `write-excel-file`, not a fragile HTML disguise.**
`buildWalletExportWorkbook()` (`src/lib/walletExport.ts`) now builds a
genuine OOXML `.xlsx` workbook using the `write-excel-file` npm package
(`write-excel-file/node` entry point, `.toBuffer()`). This **is** a new
runtime dependency, deliberately chosen over the obvious alternative
(`exceljs`) after checking both against this repo's minimalism posture:

| Package | Unpacked size | Own dependency tree | `npm audit` impact |
|---|---|---|---|
| `exceljs` | ~22MB | ~90 packages, several long-deprecated (`glob@7`, `rimraf@2`, `fstream`) | Pulled in fresh vulnerability warnings |
| `write-excel-file` | ~1.8MB | exactly one — `fflate` (itself dependency-free) | **Zero** new entries in `npm audit` — verified by diffing `npm audit --json` before/after installing; every existing warning traces to `next`/`next-auth`/`vitest`/`eslint-config-next` etc., none to this addition |

Scoped to one admin-only server route — Next.js bundles each API route's
server function independently, so this dependency is never pulled into any
page's client bundle or any other route's cold-start path; it doesn't
change the reasoning in `limitations.md`'s cold-start audit for the rest of
the app, only adds one line there noting the exception (see that doc).

**Verified directly against the produced file, not just "it typechecks."**
Before considering this fixed, the exact cell-building logic was run
standalone (outside Next.js) to produce a real `.xlsx`, which was then
unzipped and its raw OOXML parts inspected by hand: `xl/workbook.xml`
confirmed both sheets present, correctly named and ordered (`Summary` then
`Detailed`); `xl/sharedStrings.xml` confirmed every expected string
(titles, KPI labels, player names, transaction lines) was actually written;
and `xl/worksheets/sheet2.xml` (Detailed) was confirmed to carry its own
correct row count, values, running totals, and frozen-pane/merged-cell
markup — not empty, not a copy of sheet1. This is the same "read the actual
bytes, don't trust that code merged" discipline this app's other
incident write-ups already apply to migrations and crons.

Served with `Content-Type:
application/vnd.openxmlformats-officedocument.spreadsheetml.sheet` and a
`.xlsx` filename (`wallet-report-<YYYY-MM-DD>.xlsx`) via
`Content-Disposition: attachment` — no UTF-8 BOM needed this time, since a
real `.xlsx`'s strings live in `xl/sharedStrings.xml` as proper XML text,
not raw bytes a browser has to sniff the encoding of.

### Pagination — the same PostgREST row-cap class of bug, pre-empted

`fetchAllTransactions()` (`src/lib/walletExport.ts`) pages through
`wallet_transactions` via `.range()` in batches of 1000 rather than one
unpaginated `.select()`, since PostgREST silently caps an unpaginated
response at 1000 rows — exactly the class of bug that once undercounted
`/leaderboard`'s Honor Board (`features/leaderboard.md` §8.1). The
club-wide wallet ledger can plausibly cross that threshold across a full
season, so this export pages explicitly rather than risk a silently
truncated report.

### Where it lives — admin-only, `/admin/wallet` specifically

Not on the player-facing `/wallet` page — every row on both sheets is
keyed by `Player Name`, which only makes sense as a club-wide, admin-only
view (the same audience as the rest of `/admin/wallet`). `GET
/api/admin/wallet/export` is a thin wrapper: `buildWalletExportData()` +
`buildWalletExportWorkbook()` from `src/lib/walletExport.ts`, gated on
`user?.isAdmin` server-side — the menu itself is a plain `<a href>` to
that route (no fetch+blob dance needed, since the response already sets
`Content-Disposition: attachment` and the browser handles the download
using the existing same-origin session cookie).

### Security (vibe-security)

| Check | Status |
|---|---|
| `GET /api/admin/wallet/export` requires `isAdmin`, server-side | ✅ |
| No new write path — this feature is entirely read-derived, same posture as every other read-only admin panel (e.g. `/api/admin/fee-reminders`) | ✅ |
| No rate limit — same convention as other admin-only GET panels (low-traffic, single-admin-triggered) | ✅ |
| Running totals use the same opening-balance formula (and the same admin override) as the player-facing `/wallet` statement — no separate, divergent calculation that could show a different number to an admin than to the player themselves | ✅ |
| Wallet ledger read paginated past PostgREST's 1000-row default cap | ✅ |
| New `write-excel-file`/`fflate` dependency confirmed to add zero new `npm audit` findings before adopting it | ✅ |

### File Map additions

| File | Role |
|---|---|
| `src/lib/walletExport.ts` | `buildWalletExportData()` (paginated fetch + per-player running-total calc), `buildWalletExportWorkbook()` (real `.xlsx` builder via `write-excel-file`, styled Summary + Detailed sheets) |
| `src/app/api/admin/wallet/export/route.ts` | GET — admin-only, streams the `.xlsx` download |
| `src/components/admin/WalletExportMenu.tsx` | The top-right "⬇ Export" dropdown |
| `src/app/admin/wallet/page.tsx` | Renders `WalletExportMenu` in the page header, top-right |

---

*Maintained by: Spartans CC BLR*
