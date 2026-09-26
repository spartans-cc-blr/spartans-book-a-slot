# Reservation Expiry Reminders

**Spartans Hub · Added: September 2026**

---

## 1. Overview

A soft-held reservation (`bookings.status = 'soft_block'` with
`reserved_until` set — a slot held for an organiser pending confirmation,
see `/api/bookings/reserve` and the organiser self-service flow in
`features/organiser-self-service.md`) silently auto-expires: the
`/api/cron/expire-reservations` cron deletes it once `reserved_until` has
passed, with no warning beforehand to anyone.

This feature alerts every admin **before** that happens, at three fixed
lead times — **24 hours, 12 hours, and 1 hour** before `reserved_until` —
so an admin has time to nudge the organiser to confirm before the slot is
silently released back to the schedule. It is purely an alert: nothing
here extends, cancels, or otherwise touches the reservation itself — that
stays exactly the admin's call, made from `/admin/bookings/[id]` as
before.

**The nudge action reuses UI that already exists.** The push notification
links straight to `/admin/bookings/[id]`, whose "📲 Notify via WhatsApp"
panel (`src/lib/bookingNotify.ts`'s `buildOrganiserWhatsAppUrl()`) already
renders a "Message Organiser" button pre-filled with exactly the right
message for an unconfirmed reservation ("please confirm within 48 hours")
whenever the organiser has a phone number on file. This feature doesn't
duplicate that — it only makes sure an admin actually opens that page
before the deadline instead of finding out after the slot is gone.

---

## 2. Scope — only genuine reservations, not every soft_block

`bookings.reserved_until` is `NULL` for every internal-reason soft_block
(Club Event / Knockout / Practice / Other — see
`/api/soft-blocks/route.ts` and `features/knockout-day-protection.md`) —
those are admin-placed and admin-released, never auto-expired, so there is
nothing to remind anyone about. The reminder query filters on
`reserved_until IS NOT NULL`, the exact same scoping
`/api/cron/expire-reservations` already uses to decide what it deletes —
so "will this reminder ever fire for a booking that will never actually
expire" can't happen.

---

## 3. Idempotency — `reservation_expiry_reminders`

One row per `(booking_id, reminder_type, reserved_until)`, migration
`080_reservation_expiry_reminders.sql`:

```sql
CREATE TABLE reservation_expiry_reminders (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id     uuid NOT NULL REFERENCES bookings(id) ON DELETE CASCADE,
  reminder_type  text NOT NULL CHECK (reminder_type IN ('24h', '12h', '1h')),
  reserved_until timestamptz NOT NULL,
  status         text NOT NULL DEFAULT 'pending',
  error_message  text,
  created_at     timestamptz NOT NULL DEFAULT now(),
  UNIQUE (booking_id, reminder_type, reserved_until)
);
```

Same claim-before-send pattern `availability_nudge_log` already
established (`features/availability-nudge.md` §6): a row is inserted
`status = 'pending'` **before** the push is attempted, so the `UNIQUE`
constraint is what makes a retried or overlapping cron run safe — a
`23505` unique-violation on the insert means this exact reminder was
already sent, not a new failure, and is counted separately (`already_sent`
in the route's response) from a genuine insert error (`failed`). The row
is then updated to `status = 'sent'` or `'failed'` (with `error_message`)
once the push actually resolves, so a delivery failure is visible instead
of masquerading as a success — same fix `030_availability_nudge_log_delivery_status.sql`
applied to that other table.

**`reserved_until` is part of the uniqueness key, not just `booking_id` +
`reminder_type`.** If an admin edits a reservation and pushes its deadline
out, the old reminder rows (keyed to the old `reserved_until`) simply
become irrelevant history — they don't block a fresh set of 24h/12h/1h
reminders against the new deadline, since the new deadline produces a
different key. No explicit "reset on edit" logic was needed; this falls
out of the key shape alone.

RLS enabled, no anon/authenticated policies — service role only, same
blanket-deny pattern as every other table in this app.

---

## 4. Detection — `checkAndSendReservationExpiryReminders()`

`src/lib/reservationExpiryReminders.ts`. On every cron fire:

1. Fetch every `soft_block` booking with `reserved_until` set, in the
   future, and within 24 hours of now (`reserved_until BETWEEN now AND
   now + 24h`) — the widest window any threshold needs.
2. For each, compute `hoursRemaining = reserved_until − now`.
3. Walk the three thresholds **in descending lead-time order** (24h, then
   12h, then 1h) — checked, not assumed, since a cron run that catches up
   after a gap (Vercel Hobby's own scheduler is unreliable, see
   `limitations.md`, or simply a longer-than-usual interval between runs)
   can find a reservation already past more than one threshold at once.
   Every threshold with `hoursRemaining <= threshold.hours` that hasn't
   already been claimed (§3) gets its own push — so a genuine catch-up
   correctly sends all the warnings the admin missed, oldest first,
   rather than only the most urgent one.
4. Push via the existing `notifyAdmins()` helper (`src/lib/webpush.ts`,
   already built for `features/fee-reminders.md`) — resolves recipients
   from `ADMIN_EMAILS`, same as every other admin broadcast in this app.

**Message content:** title escalates with urgency (`⏰ Reservation
Expiring in 24h` / `⏰ Reservation Expiring in 12h` / `🚨 Reservation
Expiring in 1h`); body names the tournament (or "Slot reservation" if
none), the date/slot, who's holding it, and how soon it releases — e.g.
`Trumphate T20 League · Sun 28 Sep, 07:30 — held by Ravi Kumar — releases
in under 1 hour. Nudge them before the slot expires!` Links to
`/admin/bookings/<id>`.

---

## 5. Cron scheduling — hourly, GitHub Actions only

Vercel Hobby caps a single `vercel.json` cron entry at one invocation per
day (see `limitations.md`) — nowhere near enough resolution for a 1-hour
lead-time reminder. So unlike every other cron in this app, this one has
**no `vercel.json` entry at all**: the GitHub Actions workflow
(`.github/workflows/cron-reservation-expiry-reminders.yml`, `cron: '0 * *
* *'`) is the only trigger.

> **Incident (26 Sep 2026) — the hourly `vercel.json` entry blocked every
> deploy.** This feature originally shipped (PR #318) with a
> `vercel.json` entry scheduled `"0 * * * *"`, on the assumption that
> Hobby would just honour it once a day. It doesn't — Hobby **rejects the
> whole deployment** at config validation when any cron is scheduled more
> often than daily (the Vercel commit status failed ~9 seconds after push,
> before any build ran). Every merge after it (#319–#322) failed the same
> way, so production stayed on #317 while `main` moved on. Fixed by
> removing the entry entirely. Take-away: never add a sub-daily schedule
> to `vercel.json` on Hobby — put anything more frequent in a GitHub
> Actions workflow only.

---

## 6. Security (vibe-security)

| Check | Status |
|---|---|
| `GET /api/cron/reservation-expiry-reminders` requires the `CRON_SECRET` bearer token, same as every other cron route | ✅ |
| No client-reachable input anywhere in this feature — booking list, thresholds, and recipients are all derived server-side | ✅ |
| `reservation_expiry_reminders` RLS enabled, no anon/authenticated policies — service role only | ✅ |
| Push payload contains only already admin-visible booking data (tournament, date, slot, organiser name) — no wallet/player-sensitive fields | ✅ |
| Recipients resolved via `notifyAdmins()`'s existing `ADMIN_EMAILS` → `players.gmail_id` lookup — no new recipient-resolution logic | ✅ |
| A push or DB failure for one reservation never stops the rest of the run, and the whole function never throws | ✅ |

---

## 7. File Map

| File | Role |
|---|---|
| `supabase/migrations/080_reservation_expiry_reminders.sql` | `reservation_expiry_reminders` table — idempotency + delivery-status log |
| `src/lib/reservationExpiryReminders.ts` | `checkAndSendReservationExpiryReminders()` — the detection/send logic |
| `src/app/api/cron/reservation-expiry-reminders/route.ts` | Cron entry point — `CRON_SECRET` bearer auth |
| `.github/workflows/cron-reservation-expiry-reminders.yml` | Hourly trigger — the only one, no `vercel.json` entry (§5) |
| `src/lib/webpush.ts` | `notifyAdmins()` — reused, not reimplemented |
| `src/lib/bookingNotify.ts` | `buildOrganiserWhatsAppUrl()` — the existing nudge action the admin lands on after tapping the push |

---

## 8. Explicitly out of scope

- No automatic WhatsApp message to the organiser — the push is the alert;
  nudging them is still a deliberate, manual admin action from the
  existing panel.
- No extension/renewal action from the push itself — an admin who wants
  to give an organiser more time still edits the booking's
  `reserved_until` from `/admin/bookings/[id]`, same as today.
- No reminder for internal-reason soft_blocks (Club Event / Knockout /
  Practice / Other) — see §2, they have no `reserved_until` and are never
  auto-expired.
- No in-app modal fallback (unlike `features/fee-reminders.md`'s two-channel
  push + modal design) — a reservation nearing expiry is a fast-moving,
  time-boxed situation where the push itself (checked hourly) is timely
  enough; a next-page-load modal wouldn't add much for something this
  short-lived. Worth adding later if a subscribed admin ever misses a
  push.

---

*Maintained by: Spartans CC BLR*
