# Match Fee Payment Reminders

**Spartans Hub · Added: September 2026**

---

## 1. Overview

Fee application (`POST /api/fees/apply`) has always been a deliberately
manual, admin-only action — see `post-match-scorecard.md` §6, "Why fees
stay decoupled." Nothing in the scorecard-sync pipeline was ever supposed
to *apply* a fee automatically, and this feature doesn't change that. What
it adds is a **reminder**: the moment a scorecard syncs into a state where
a real fee is configured but hasn't been applied yet, every admin is
pushed a notification, and — as a fallback for whoever missed the push or
isn't subscribed — a modal nags them on their next Hub visit, listing
every still-unresolved match, until each one is either fee-applied or
becomes ineligible for some other reason (no squad, no fee configured,
externally reconciled).

Two delivery channels, both derived from one shared eligibility rule:

- **Push, immediate** — fired from inside `syncMatchStatsForBooking()`
  itself, so it fires "as soon as the scorecard is fetched," whether that
  sync was a manual click or the unattended twice-daily
  `backfill-scorecards` cron.
- **Modal, on next admin page load** — the fallback for an admin who
  wasn't subscribed to push, was away when it fired, or dismissed it and
  is now checking back. Persists until the underlying condition actually
  resolves (fees applied, or the booking otherwise drops out of
  eligibility) — this is not a "seen once" broadcast like the milestone or
  birthday modals, since the thing being reminded about is an ongoing
  state, not a one-time event.

---

## 2. Eligibility — "fee-pending"

A single resolver, `resolvePendingFee()` in `src/lib/feeReminders.ts`,
backs both delivery channels so "fee-pending" can never drift into two
different definitions. A booking is fee-pending when **all** of:

| Condition | Why |
|---|---|
| `scorecard_uploads.status = 'synced'` | Not yet `fees_applied` — once applied, it's resolved |
| `scorecard_uploads.fees_reconciled_externally = false` | A pre-8-Aug-2026 match's fees were already collected outside the Hub (migration `062`) — `POST /api/fees/apply` itself refuses these, so reminding about them would be actively wrong |
| An effective fee is set and `> 0` | `bookings.match_fee_override ?? tournaments.match_fee` — same precedence `/api/fees/apply` and the fixtures-page fee projection already use |
| At least one `squad` row with `status = 'announced'` | `POST /api/fees/apply` itself 400s with "No announced squad for this booking" otherwise — nothing an admin could actually apply yet |

This never reads or writes `wallet_transactions` or
`scorecard_uploads.status` — purely a read-derived signal layered on top
of state that already exists for other reasons.

---

## 3. Push — `notifyFeeReminderIfPending()`

Called from `syncMatchStatsForBooking()` (`src/lib/matchStatsSync.ts`)
right after the existing milestone/match-performance detection, wrapped in
`.catch()` — same "never fail the sync" posture as
`detectAndLogMilestones()`. Resolves eligibility for the one
just-synced booking; if still fee-pending, pushes every admin via the new
`notifyAdmins()` helper (`src/lib/webpush.ts`).

**`notifyAdmins()` resolves recipients from `ADMIN_EMAILS`, not a DB
flag** — `isAdmin` is deliberately derived from that env var rather than
`players` (see `security.md` §3, "Key Design Decisions"), so there's no
`players.is_admin` column to query directly. `notifyAdmins()` parses the
same comma-separated env var `src/lib/auth.ts` already does, looks up
`players.id` by `gmail_id` (already lowercased at every write path — see
`pending-backlog.md` S-6), and pushes each match. An admin email with no
matching `players` row (or no `push_subscriptions` row) is silently
skipped, same as any other player with nothing to push to.

Push copy: `💰 Match Fees Pending` / `Scorecard synced for vs <opponent> ·
<Sun 19 Jul> — ₹<fee> not yet applied.`, linking to
`/admin/bookings/<id>`.

---

## 4. Modal — `FeeReminderModal`

`src/components/admin/FeeReminderModal.tsx`, mounted once per session via
`GlobalFeeReminderModal.tsx` in `src/app/layout.tsx` — same pattern as
`GlobalMilestoneModal`/`GlobalBirthdayModal` (`SiteNav` isn't a shared
layout and remounts on every client-side navigation, which would refetch
on every page view if mounted there instead). Gated to `isAdmin` only,
resolved client-side from the session token — fee application is an
admin-only action, so nobody else should see this nag.

On mount, fetches `GET /api/admin/fee-reminders` (admin-only, thin wrapper
around `getPendingFeeBookings()` — the same resolver as §3, called with no
booking filter). If any bookings come back, opens a `Dialog` listing each
one (opponent, tournament, fee, date/slot, squad size), each row linking
to `/admin/bookings/<id>`.

**Dismissal is a plain `localStorage` flag, not a server-persisted
cursor** — deliberately unlike `milestones_seen_at`/
`birthday_wishes_seen_date`. Those cursors mark a one-time event as
permanently seen; a fee-pending booking is an *ongoing* state that should
keep nagging until it's actually resolved, not disappear forever the
first time an admin closes the dialog. The dismiss key
(`feeReminderDismissed:<today>:<sorted booking ids>`) is scoped to both
today's date and the exact set of currently-pending bookings:

- Dismissing today doesn't suppress the reminder tomorrow for the same
  still-unresolved bookings (the date changes, so the key changes).
- A newly fee-pending booking appearing today re-opens the modal even if
  today's earlier (smaller) set was already dismissed (the id set
  changes, so the key changes).

This is per-browser/device, not per-admin-account or shared across
devices — accepted, since this is a soft nag rather than a security- or
correctness-critical "seen" state; an admin using a second device just
sees it again there, which is the safer failure mode (over-reminding, not
under-reminding a real unpaid fee).

---

## 5. Explicitly out of scope

- **Fees are never auto-applied by this feature.** Same decoupling
  `post-match-scorecard.md` §6 already documents for the sync pipeline —
  this only ever surfaces a reminder; `POST /api/fees/apply` remains the
  sole, explicit, admin-only trigger.
- **No new database table or migration.** Both delivery channels are
  purely derived from `scorecard_uploads`, `bookings`, `tournaments`, and
  `squad` — nothing new to persist. Dismissal state lives in the browser
  only (§4).
- **No captain/GC visibility.** Only admins can apply fees, so only admins
  are reminded — mirrors the existing `/api/fees/apply` access.
- **UPI/payment-collection tooling** (a per-tournament UPI ID to open a
  payment app, or an auto-populated "payment made" WhatsApp message to the
  tournament organiser) was discussed alongside this feature but is a
  separate, unbuilt idea — see `pending-backlog.md` U-30. This feature is a
  reminder only; it doesn't move or track any money, UPI or otherwise.

---

## 6. Security (vibe-security)

| Check | Status |
|---|---|
| `GET /api/admin/fee-reminders` requires `isAdmin`, server-side | ✅ |
| Modal itself gated `isAdmin` client-side for *visibility* only — the API route re-checks independently, same "UI mirrors the API, never replaces it" posture as `wrangler-grounds-menu.md` §4 | ✅ |
| `notifyAdmins()` resolves recipients from `ADMIN_EMAILS` (server env var), never from client input | ✅ |
| No new write path — this feature is entirely read-derived | ✅ |
| Push payload contains only already-admin-visible match/fee data (opponent, date, amount) — no wallet/player-level detail | ✅ |
| A push or fetch failure here can never block or alter the scorecard sync it's attached to | ✅ |

---

## 7. File Map

| File | Role |
|---|---|
| `src/lib/feeReminders.ts` | `resolvePendingFee()` (shared eligibility, §2), `getPendingFeeBookings()` (full list, for the API route), `notifyFeeReminderIfPending()` (single-booking push trigger) |
| `src/lib/webpush.ts` | `notifyAdmins()` — resolves `ADMIN_EMAILS` → `players.id` → push, alongside the existing `notifyGCs()`/`notifyAllSubscribed()` |
| `src/lib/matchStatsSync.ts` | Calls `notifyFeeReminderIfPending()` as the last, best-effort step of `syncMatchStatsForBooking()` |
| `src/app/api/admin/fee-reminders/route.ts` | GET, admin-only — feeds the modal |
| `src/components/admin/FeeReminderModal.tsx` | The modal — fetch, localStorage dismissal, per-booking rows |
| `src/components/ui/GlobalFeeReminderModal.tsx` | Mounts the modal once per session, gated `isAdmin` |
| `src/app/layout.tsx` | Renders `GlobalFeeReminderModal` once, alongside `GlobalMilestoneModal`/`GlobalBirthdayModal` |

---

*Maintained by: Spartans CC BLR*
