# Knockout Day Protection (R7) — Feature Summary

**Spartans Hub · Added: August 2026**

---

## 1. Overview

Once a tournament reaches its knockout stage, the club needs to protect
the day a knockout fixture lands on — no other tournament's league game
should be allowed to slot into an earlier time on that same date, since a
knockout is a higher-stakes, harder-to-move commitment than an ordinary
league game.

This is implemented as a new rule, **R7**, added to the shared booking
rules engine (`src/lib/validation.ts`), plus the plumbing needed to create
a tournament-linked knockout hold in the first place — which turned out to
be more of the work than the rule itself, since the two existing
"reservation" mechanisms in the app didn't support tying a hold to a
tournament at all before this.

**Key design decision, arrived at after correcting an earlier assumption:**
a knockout hold is only ever created *after* the tournament's organiser has
given a real, specific date — never speculatively ahead of time. There is
no "probable" pre-hold state. The moment that hold exists (even as a
`soft_block`, before it's confirmed), R7 protection applies.

---

## 2. Where a Knockout Hold Actually Gets Created

**Not** a new page. The existing `/admin/soft-blocks/new` form (already
admin-only) already had a `block_reason` dropdown (`BLOCK_REASONS`,
`src/types/index.ts`) that already included `'Reserved for Knockout
(pending confirmation)'` as an option — it just had no way to attach a
tournament to it, and the underlying route (`/api/soft-blocks`) forced
`tournament_id: null` and `format: null` on every hold regardless of
reason.

When `'Reserved for Knockout (pending confirmation)'` is selected on that
form:
- A tournament picker and a format select appear.
- Slot-time selection switches from multi-select (the normal "block
  several slots for a club event" mode) to single-select — a knockout hold
  is one specific game, not a multi-slot block.
- On submit, `/api/soft-blocks` now runs the request through the same
  `validateBooking()` engine (R1–R7) every other booking path uses,
  instead of the old bare "is this exact slot already taken" check it used
  for every other reason. That fuller check is only applied when
  `tournament_id` is present — the original lightweight check remains
  untouched for `Club Event` / `Practice / Internal Game` / `Other`.

### The R7 conflict warning

If placing the knockout hold finds an earlier slot on that date already
taken by something else, the create call still succeeds (organiser's date
is a given — R7 treats this as a **warning**, not a hard block, only when
the candidate booking itself carries the knockout reason). The response
includes a `conflict` object identifying the specific blocking booking
(tournament, opponent, organiser name/phone), and the admin page shows a
one-tap WhatsApp button addressed to *that match's own organiser*, asking
them to move their game later the same day.

Once the knockout hold exists, any **new** booking (any tournament,
including this admin form and the confirmed-booking form) that would take
a slot at or before it on that date is hard-rejected — R7 fires as a real
error in that direction, not a warning.

---

## 3. Rule R7 — `src/lib/validation.ts`

```ts
// Placing the knockout hold itself — warning only
if (isKnockoutCandidate) {
  const earlierSameDay = sameDayAllActive
    .filter(b => b.slot_time < booking.slot_time)
    .sort(...)[0]
  if (earlierSameDay) warnings.push({ rule: 'R7', message: ... })
} else {
  // Anything else being booked on a date that already has a knockout hold
  const knockoutSameDay = sameDayAllActive.find(b =>
    b.block_reason === KNOCKOUT_HOLD_REASON && booking.slot_time <= b.slot_time
  )
  if (knockoutSameDay) errors.push({ rule: 'R7', message: ... })
}
```

Keyed off `block_reason`, not `match_stage` — a real distinction worth
being deliberate about (see §4). `slot_time` strings (`'07:30'` etc.) sort
correctly with plain string comparison since they're all zero-padded 24h
`HH:MM`. Applies every day, not just weekends — a knockout can land on a
weekday.

**R7 is fully compatible with the admin rule-override mechanism** added
the same week (`booking_rule_overrides`, `RuleOverrideInput` — see
`architecture.md` §7.1): since R7 just pushes into the same shared
`errors`/`warnings` arrays every other rule uses, an admin can override a
knockout-day conflict too, same as R1–R6, as long as a reason is logged.
No special-casing was needed for this — it fell out for free from R7 being
a normal rule in the same engine.

`KNOCKOUT_HOLD_REASON` (`src/types/index.ts`) is a single exported
constant pointing at the `BLOCK_REASONS` value, so the reason string used
by the admin form and the string R7 checks against can never drift apart.

---

## 4. Why R7 keys off `block_reason`, not `match_stage`

`match_stage` (a free-text field on `bookings`, shown on the confirmed
booking form) is **not** a structured "league vs knockout" flag — it's a
player-facing narrative hint surfaced on the fixtures card to promote
availability marking: tournament opener, cash-prize decider, a dead rubber
(games already known to be dead once the club is mathematically out,
used to give fringe players a chance), or knockout. Overloading it as a
precise machine-readable signal for a hard rule would have been fragile
(free text like "Knockout" vs "knockout" vs "QF") and would have broken
its actual purpose.

`block_reason` (a proper enum, `BLOCK_REASONS`) is the correct signal
instead — it already existed specifically to record *why* a slot is held,
survives a later edit into a `confirmed` booking (`PATCH /api/bookings/[id]`
only updates fields explicitly present in the request body, and
`block_reason` isn't part of that form), and required zero schema changes.

---

## 5. Tournament Planner — Read-Only Awareness Only

`/tournament-planner` (the internal Captain/GC/Admin dashboard) gained two
small, **admin-only, read-only** additions per tournament — no creation UI
lives here, that stays exclusively on `/admin/soft-blocks/new`:

- A passive **qualification nudge** — shown when a tournament has ≥half
  its league games won (`match_result` from `match_stats_cache`, matched
  the same `.toLowerCase().includes('won')` way `ResultBadge` does) with
  unbooked games still remaining. Purely informational; never gates or
  creates anything. The actual "are we really through to knockout"
  decision depends on the full points table (opponents' results, NRR),
  which the Hub doesn't model — see `cricheroes_points_table_url` for the
  "go check the real source" link this nudge exists alongside.
- A line showing an **existing knockout hold** for that tournament, if one
  exists (`tournament_id` + `block_reason = KNOCKOUT_HOLD_REASON`, any
  non-cancelled status).

Both are gated strictly to `isAdmin` — deliberately stricter than the
Tournament Planner's internal Suggested-Slots panel (`isAdmin || isGC`) as
it existed at the time, since knockout negotiation with rival organisers is
treated as the coordinator's job specifically, not GC's. That internal
panel was later removed entirely (see `features/player-future-availability.md`
§8) — suggested dates now live exclusively on the public organiser share
page, `/tournament-planner/share/[tournamentId]` — so this comparison is
historical context for the `isAdmin`-only choice, not a live cross-reference.

---

## 6. Dashboard Display Fix

`DashboardBookingsTabs.tsx` previously showed either `block_reason` *or*
`tournament_name` for a `soft_block` row, never both — harmless before
this feature, since no soft_block ever had a `tournament_id`. Now that one
can, the reason column shows both together (e.g. *"Reserved for Knockout
(pending confirmation) — Extreme Cricket Summer Cup"*) whenever a
tournament is attached.

---

## 7. Security (vibe-security)

| Check | Status |
|---|---|
| Knockout hold creation stays `isAdmin`-only | ✅ Unchanged — `/admin/soft-blocks/new` and `/api/soft-blocks` already required it |
| R7 applies to every booking path, not just the one that introduced it | ✅ Lives in the shared `validateBooking()` engine — the confirmed-booking form, the reservation form, and self-service (see `organiser-self-service.md`) all inherit it automatically |
| Tournament Planner's new read-only pieces are `isAdmin`-only | ✅ Stricter than the `isAdmin \|\| isGC` Suggested-Slots panel that existed at the time (since removed — see §5) |
| Reason logged for any R7 override | ✅ Same `booking_rule_overrides` audit trail as every other rule |

---

## 8. File Map

| File | Role |
|---|---|
| `src/lib/validation.ts` | R7 rule |
| `src/types/index.ts` | `KNOCKOUT_HOLD_REASON` constant, `'R7'` added to `ValidationError.rule`, `block_reason` added to `CreateBookingRequest` |
| `src/app/api/soft-blocks/route.ts` | Accepts optional `tournament_id`/`format`; runs `validateBooking()` (R1–R7) when a tournament is attached; returns the R7 `conflict` payload |
| `src/app/admin/soft-blocks/new/page.tsx` | Tournament/format fields + single-slot mode for the Knockout reason; conflict warning + WhatsApp reschedule nudge |
| `src/components/admin/DashboardBookingsTabs.tsx` | Shows `block_reason` + `tournament_name` together for a soft_block row |
| `src/app/tournament-planner/page.tsx` + `TournamentPlannerClient.tsx` | Admin-only qualification nudge + existing-hold display |
| `src/app/admin/bookings/new/page.tsx`, `src/app/admin/bookings/[id]/page.tsx` | `RULES` rule-check-strip lists updated with R7 |
| `src/lib/schemas.ts` | `bookingRuleOverrideSchema`'s rule enum widened to include `'R7'` |

---

## 9. Pending / Known Gaps

| Item | Notes |
|---|---|
| No automated test coverage for R7 | `validation.ts` has no test file at all today (pre-existing gap, not introduced by this feature) |
| Qualification nudge threshold is fixed (≥half games won) | Not currently admin-configurable per tournament |

---

*Maintained by: Spartans CC BLR*
