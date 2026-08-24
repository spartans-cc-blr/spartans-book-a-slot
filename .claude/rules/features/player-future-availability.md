# Captain Unavailable Dates (formerly Player Future Availability)

**Spartans Hub · Added: August 2026 · Narrowed to captain-only, L-only: August 2026**

---

## 1. Overview

Lets a captain mark a date/slot as "I already know I can't lead a game" —
for dates that don't have a real booking yet, distinct from `availability`
(`/api/player-availability`), which requires a real `booking_id`. Feeds
two consumers, both of which only ever look at `L`:

- **Suggestion engines** (`src/lib/suggestedSlots.ts`) skip a candidate
  date/slot the tournament's own leading captain has marked `L` for —
  see §3.
- **Booking-time validation** (`validateBooking()`, `src/lib/validation.ts`)
  surfaces a non-blocking warning (**R8**) when an admin tries to book the
  tournament's captain into a slot they've marked `L` for — see §4.

**Narrowed from "every active player, any of Y/O/E/L" to "captains only,
L only" (August 2026).** The feature originally shipped player-facing
(`/unscheduled-availability`, reachable by any active player, full Y/O/E/L
picker) on the theory that a fuller adoption picture might be useful
someday. In practice nothing ever consumed anything but a captain's own
`L` — Y/O/E had no reader anywhere in the codebase — so the wider surface
was pure unused complexity with no benefit, and non-captain players had no
real reason to be here (the actual real-booking `availability` flow on
`/fixtures` already covers "am I free," this feature exists purely to keep
the tournament share page from suggesting a slot to an organiser that the
captain already knows they can't do). Reachable only from the
**Captains' Corner ▾** nav dropdown now, alongside "🏏 Squad Selection" —
see §6 and `architecture.md` §3's role table.

**Carryover was removed in the same pass, not just narrowed** — see §5 for
why it no longer makes sense once only captains write here.

---

## 2. Database — `supabase/migrations/067_player_future_availability.sql`

```sql
create table player_future_availability (
  id          uuid primary key default gen_random_uuid(),
  player_id   uuid not null references players(id) on delete cascade,
  game_date   date not null,
  slot_time   text not null check (slot_time in ('07:30','10:30','12:30','14:30')),
  response    text not null check (response in ('Y','O','E','L')),
  updated_at  timestamptz not null default now(),
  unique (player_id, game_date, slot_time)
);
```

RLS enabled, no anon/authenticated policy — blanket-deny, same pattern as
`availability`/`fee_exemptions`. All access via `createServiceClient()`
through the API route only.

**Schema unchanged by the August 2026 narrowing** — the CHECK constraint
still technically allows `Y`/`O`/`E`, and `player_id` isn't FK-scoped to
captains only. Only the application layer (Zod schema + route auth, §3)
enforces "captains, `L` only" now; the table itself stays general-purpose
in case a genuine future need for the wider shape ever comes up. No
migration was written to narrow the CHECK constraint — narrowing a column
that already has zero non-`L` writes going forward isn't worth a migration
for its own sake.

Any pre-existing rows from the brief window this was player-facing (any
`Y`/`O`/`E`/non-captain rows) are inert — nothing reads them — and were
left in place rather than cleaned up; there's no user-visible surface that
would ever show them.

### `supabase/migrations/068_availability_update_source_carryover.sql`

`availability.update_source` and `availability_audit.update_source` both
carry a live CHECK constraint (`player`/`captain` only) that predates this
feature and isn't itself checked into `supabase/migrations/` (same
repo/DB drift pattern documented in `gc-players.md` §13 and
`post-match-scorecard.md` §5). Widened to also allow `'future_carryover'`
— this was for the carryover feature described in the original version of
this doc, which has since been removed (§5). The widened constraint is
harmless to leave in place (an unused enum value costs nothing) and
reverting it would need its own migration for no benefit.

---

## 3. API — `src/app/api/player/future-availability/route.ts`

| Method | Auth | Purpose |
|---|---|---|
| GET | `isCaptain \|\| isAdmin` | Own rows by default — `{ availability: {game_date, slot_time, response}[] }`. **Admin-only, added August 2026:** an optional `?player_id=` query param looks up a *different* player's rows instead — only ever honoured when `session.user.isAdmin` is true; a non-admin caller (including a captain) always gets their own rows regardless of what's in the query string. See §6.1. |
| POST | `isCaptain \|\| isAdmin`, non-expelled | `{game_date, slot_time, response: 'L'}` (single slot) or `{game_date, response: 'L', whole_day: true}` (fans out server-side to all 4 slot_times as independent rows) — always writes under the caller's own `session.user.playerId`, `player_id` is never accepted from the request body or query string |
| DELETE | `isCaptain \|\| isAdmin`, non-expelled | `{game_date, slot_time}` — clears one slot, always the caller's own |

**Route path/table name still say "player"** — left as-is rather than
renamed when the captain-only gate was added, since this is an internal
API path with no external consumers to break and renaming would have been
pure churn for no functional benefit.

`response` is `z.literal('L')` in `futureAvailabilityResponseSchema`
(`src/lib/schemas.ts`) — Y/O/E were dropped from the accepted values
entirely, not just the UI, since nothing has ever consumed them (§1).

Mirrors `player-availability/route.ts`'s guard order (session →
`playerStatus !== 'expelled'` → captain check → rate limit → explicit
select-then-insert/update, never `.upsert()`) but has **no wallet-dues
guard and no `availability_locked`/freeze check** — neither applies before
a real booking exists. Rate-limited with `RATE_LIMITS.captainWrite`
(30/min) — switched from `playerWrite` when the route was narrowed to
captains only, matching the tier `/api/captain-availability` already uses.

---

## 4. Suggestion Engines — `src/lib/suggestedSlots.ts`

Two different suggestion engines exist, chosen per-tournament by
`tournaments.organiser_self_service` (see `organiser-self-service.md`):

| Engine | Granularity | Used by |
|---|---|---|
| `getSuggestedOpenDates()` | Whole **day** only — never returns a slot_time | Public share page, non-self-service tournaments only (see §7 — the internal Hub GC/Admin panel that also used this was removed) |
| `getSuggestedSlotDates()` / `findNextSlotDate()` | Exact **slot bucket** (day + slot_time) | Public share page, self-service tournaments only (`organiser-reserve`/`organiser-next-slot`) |

Both factor in the tournament's leading captain's
`player_future_availability`, at the granularity each engine actually
operates at:

### `getSuggestedOpenDates()` — whole-day exclusion

A candidate `game_date` is dropped entirely **only if the captain has
marked `L` across all 4 slot_times** for that date:

```ts
if (SLOT_DEFS.every(s => slots.has(s.time))) fullyUnavailableDates.add(date)
```

A captain who's `L` for some slots but not others still gets the day
offered — this engine can't express anything more precise, since it only
ever returns a bare date (every suggested day is meant to be "fully open,
any slot_time would work" — see the function's own header comment).

### `getSuggestedSlotDates()` / `findNextSlotDate()` — exact-slot precision

These engines already think in exact `(day, slot_time)` buckets, so they
get the same precision R8 (§5 below) already has at booking time: every
candidate is validated via the shared `validateBooking()` with the
captain's `player_future_availability` rows passed in as the 7th
(`captainFutureAvailability`) argument. R8 fires as a warning the moment a
candidate's exact date+slot_time matches an `L` row, and both engines
already treat *any* warning as disqualifying (`result.warnings.length ===
0`), so no separate exclusion logic was needed here — wiring the data
through was sufficient.

---

## 5. Rule R8 — `src/lib/validation.ts`

**Not "R7"** — R7 is already `knockout-day-protection.md`'s Knockout Day
Priority rule, live before this feature shipped. R8 is a non-blocking
**warning**, same severity tier as R2 (never enters `errors`, never needs
an admin override):

```ts
if (thisTournamentCaptainId) {
  const captainUnavailable = captainFutureAvailability.find(r =>
    r.game_date === booking.game_date &&
    r.slot_time === booking.slot_time &&
    r.response === 'L'
  )
  if (captainUnavailable) {
    warnings.push({ rule: 'R8', message: `...` })
  }
}
```

`validateBooking()` has a 7th parameter,
`captainFutureAvailability: CaptainFutureAvailabilityRow[] = []`, defaulting
to empty — callers that don't pass it are unaffected. Wired in at:

- `POST /api/validate` and `POST /api/bookings` (admin booking form —
  fetches the captain's rows for the exact `game_date` being validated)
- `getSuggestedSlotDates()` / `findNextSlotDate()` (§4 above)

`RULES` lists in `/admin/bookings/new` and `/admin/bookings/[id]` both
include an `R8` entry so it surfaces in the `RuleCheckStrip`.
`bookingRuleOverrideSchema`'s rule enum includes `'R8'` for type
consistency with `ValidationError['rule']`, even though a non-blocking
warning never actually reaches the override flow.

### Carryover — removed (August 2026)

`POST /api/bookings` previously copied every player's
`player_future_availability` row for a newly-confirmed booking's exact
date/slot into the real `availability` table. This made sense when any
player could pre-fill Y/O/E/L; once the feature narrowed to captains
marking only `L`, the only thing carryover could still ever do was
auto-set the *tournament's own captain* to `L` (on leave) the moment their
own tournament's game got booked into a slot they'd already flagged as
`L` — a fairly narrow edge case (an admin overriding past the R8 warning),
and arguably surprising rather than helpful (silently marking the captain
"on leave" for their own tournament's match with no explicit action on
their part). Removed rather than kept as a rare-but-technically-correct
side effect. `POST /api/bookings` no longer reads `player_future_availability`
for anything beyond the R8 warning input (§4/§5).

---

## 6. UI — `/captains-corner/unavailable-dates`

**Captains' Corner nav restructured into a dropdown (August 2026)** — was
a single flat link (`href="/captains-corner"`). `SiteNav.tsx` now renders
a **"Captains' Corner ▾"** dropdown (desktop hover-menu + mobile section),
gated the same as the old flat link (`isCaptain || isAdmin`), with two
entries:

- **🏏 Squad Selection** → `/captains-corner` (the pre-existing page,
  content and behaviour completely unchanged — only the nav entry point
  moved) — `activePage="captains"`.
- **🚫 Unavailable Dates** → `/captains-corner/unavailable-dates` (this
  feature) — `activePage="captains-unavailable"`.

Both keep the dropdown button itself highlighted
(`activePage === 'captains' || activePage === 'captains-unavailable'`),
same pattern as the "Matches ▾" dropdown highlighting on any of its own
sub-pages.

**This replaces the player-facing `/unscheduled-availability` page** (see
§1) — that route, its "🗓️ Unscheduled Slots" entry in the "Matches ▾"
dropdown, and `src/components/availability/UnscheduledAvailabilityPanel.tsx`
were all deleted, not just re-gated. The Matches dropdown is back to just
"🏏 Upcoming" / "📜 Past Matches" (its width reverted `w-52` → `w-44` to
match).

`src/app/captains-corner/unavailable-dates/page.tsx` is a server component
gated with a **hard redirect** (`redirect('/login')` if no session,
`redirect('/fixtures')` if not `isCaptain || isAdmin`) — matching
`/captains-corner/page.tsx`'s own gate exactly, rather than the soft
signed-out/not-registered/expelled banners the old player-facing page
showed (unnecessary now that every visitor either is or isn't a captain,
with no in-between "registered but not yet a captain" state worth a
banner for).

**Only genuinely open dates/slots are ever shown**, computed via
`computeSlotStatus()` (`src/lib/validation.ts`) — the same slot-status
engine `/api/availability` uses for the admin schedule grid, not a bare
"is there a booking at this exact slot_time" check. A slot counts as open
when `computeSlotStatus()` returns `'open'` or `'t20only'` (still
bookable, just format-constrained — this feature doesn't ask for a
format). This correctly excludes a slot with no *direct* booking that's
still unavailable because an adjacent slot's game runs over into it — a
T20 confirmed at 10:30 blocks the entire day, a T30 at 07:30 blocks 10:30
and 12:30, any game at 12:30 blocks 10:30 and 14:30, etc. A date where
every slot is excluded this way is dropped entirely; a partially-open date
only shows its remaining slot(s).

`src/components/captains/UnavailableDatesPanel.tsx` (new component,
replacing `UnscheduledAvailabilityPanel.tsx`; lives alongside
`CaptainsCornerGrid.tsx` rather than in a standalone `availability/`
directory now that this is captain-specific UI, not general-purpose):

- **No response picker anymore** — Y/O/E/L is gone; each open slot renders
  as a single toggle pill (tap to mark `L`, tap again to clear via
  `DELETE` — same tap-active-to-clear convention as `FixturesAvailability.tsx`).
  Marked slots render filled purple (`#2e1a47`/`#d8b4fe`/`#a855f7` —
  the same `L` colour from `CaptainsCornerGrid.tsx`'s RESP legend), unmarked
  slots render as an outlined neutral pill.
- **Whole-day quick action** — "Mark whole day unavailable" toggles `L` on
  every one of that date's open slots at once (individual POSTs via
  `Promise.all`, scoped to that date's own `openSlots`, never a slot
  that's already booked). Only rendered when a date has more than one open
  slot.
- No outer collapse toggle and no per-slot expand — with only one action
  per slot, all of a date's open slots render inline as a single row of
  pills; there's no longer enough visual complexity to warrant hiding
  anything behind an expand.

---

## 6.1 Admin captain picker (added August 2026)

Before this, an admin visiting `/captains-corner/unavailable-dates` only
ever saw *their own* marked dates (or nothing, if they aren't themselves a
captain) — there was no way for an admin to look up which dates a
*different* captain had marked unavailable. Widened rather than building a
second page: `page.tsx` now, for `isAdmin` sessions only, fetches every
`players` row with `is_captain = true` (the same flag that gates writes to
this feature — not the separate `captains` master-data table, which tracks
tournament-level captain assignment and can diverge from it) and renders a
`CaptainPicker` dropdown in the hero.

- **Selection lives in the URL** (`?captainId=<player_id>`), not client
  state — `CaptainPicker.tsx` (`'use client'`) pushes the new query string
  via `next/navigation`'s `useRouter`, so the page stays a server
  component and a chosen captain's view is bookmarkable/shareable.
- **Default selection**: the requested `captainId` if it resolves to a
  real captain, else the admin's own `playerId` if they themselves are a
  captain, else the first captain alphabetically. An admin with zero
  captains in the roster at all (`captainOptions.length === 0`) never
  enters this branch — the page falls back to its original own-rows-only
  behaviour, picker hidden.
- **Read-only whenever the admin isn't viewing their own rows**
  (`isOwnView = viewingPlayerId === user.playerId`) — `UnavailableDatesPanel`
  takes an optional `viewingPlayerId` prop; when set, every "L" toggle
  renders disabled (still shows marked/unmarked state, just not tappable)
  and the whole-day "Mark day" button doesn't render at all. This is
  deliberate, not just a UI nicety: **the write routes (`POST`/`DELETE`)
  always write under the caller's own session `playerId`**, never a
  `player_id` from the request — so if the panel let an admin tap "L"
  while viewing someone else's calendar, it would silently create a mark
  under the *admin's* own identity while the screen still showed the
  captain's data. Making the panel read-only in that state is what
  prevents that mismatch, not a server-side check (there's nothing to
  check — a write while viewing someone else always lands on the admin's
  own row regardless).
- A captain who is *not* an admin never sees the picker and always gets
  their own editable calendar, exactly as before this change — `isAdmin`
  gates the entire branch in `page.tsx`.

---

## 7. Removed — Internal Tournament Planner "Suggested Slots" panel

The internal Hub `/tournament-planner` page previously had its own
GC/Admin-only "Suggested Slots" panel (`SuggestedSlotsPanel` in
`TournamentPlannerClient.tsx`, backed by
`GET /api/tournaments/[id]/suggested-slots`), independent of the public
organiser share page's own suggestions. Both surfaces called the same
`getSuggestedOpenDates()`, so they could never actually disagree — but
having suggested dates live in two places was judged unnecessary
duplication. **Removed** (August 2026):

- `src/app/api/tournaments/[id]/suggested-slots/route.ts` deleted.
- `SuggestedSlotsPanel` function, its `canSuggestSlots` prop threading
  through `MatchTabsSection`, and the now-unused `tournamentId`/
  `tournamentName`/`organiserName`/`organiserContact`/`WA_ICON` imports it
  alone required, all removed from `TournamentPlannerClient.tsx`.
- The Unbooked tab's static "○ N unbooked games" line now points admins to
  the tournament's own share page (reachable via the existing
  `TournamentShareButton` in the header) for suggested open dates, instead
  of duplicating them inline.

`getSuggestedOpenDates()` itself is untouched and still live — it's the
engine behind the public share page's suggestions for non-self-service
tournaments (§4). Only the internal admin-facing consumer was removed.
`knockout-day-protection.md` §5's "deliberately stricter than the existing
Suggested-Slots panel" comparison predates this removal — see that doc for
the historical note.

---

## 8. Security (vibe-security)

| Check | Status |
|---|---|
| `player_future_availability` RLS enabled, no anon/authenticated policy | ✅ |
| Route gated `isCaptain \|\| isAdmin` server-side on GET/POST/DELETE — never trusts the nav hiding the entry from non-captains | ✅ |
| `status !== 'expelled'` checked, rate-limited (`RATE_LIMITS.captainWrite`) | ✅ |
| `response` restricted server-side to the literal `'L'` (Zod), not just hidden from the UI | ✅ |
| `game_date`/`slot_time` validated server-side against fixed formats on every write path (POST via Zod, DELETE via `GAME_DATE_REGEX` + enum check) | ✅ |
| No new `NEXT_PUBLIC_` env vars | ✅ |
| R8 is a non-blocking warning, same severity as R2 — never stricter than the pattern it mirrors | ✅ |
| `player_future_availability` writes never touch `bookings` | ✅ |
| `/captains-corner/unavailable-dates` hard-redirects non-captains server-side, mirroring `/captains-corner/page.tsx` | ✅ |
| `GET ?player_id=` cross-player lookup is admin-only, re-checked server-side — never trusts the client to only send it when appropriate | ✅ |
| Writes always target the caller's own `session.user.playerId` — `player_id` is never accepted from POST/DELETE body or query string, so an admin viewing another captain's calendar can't write under that captain's identity even if the client were compromised | ✅ |

---

## 9. File Map

| File | Role |
|---|---|
| `supabase/migrations/067_player_future_availability.sql` | The table |
| `supabase/migrations/068_availability_update_source_carryover.sql` | Widens `update_source` CHECK constraints for `'future_carryover'` — now unused (§5) but harmless to leave |
| `src/app/api/player/future-availability/route.ts` | GET/POST/DELETE, `isCaptain \|\| isAdmin` gated, `'L'`-only |
| `src/lib/schemas.ts` | `futureAvailabilityRequestSchema`, `futureAvailabilitySlotTimeSchema`, `futureAvailabilityResponseSchema` (now `z.literal('L')`) |
| `src/lib/suggestedSlots.ts` | `upcomingWeekendDates()`; day-level exclusion in `getSuggestedOpenDates()`; exact-slot R8 wiring in `getSuggestedSlotDates()`/`findNextSlotDate()`; `HORIZON_WEEKS` exported |
| `src/lib/validation.ts` | Rule R8, `CaptainFutureAvailabilityRow` type, `validateBooking()`'s 7th param |
| `src/types/index.ts` | `ValidationError['rule']` includes `'R8'` |
| `src/app/api/validate/route.ts` + `src/app/api/bookings/route.ts` | Fetch and pass `captainFutureAvailability` into `validateBooking()` |
| `src/app/admin/bookings/new/page.tsx` + `src/app/admin/bookings/[id]/page.tsx` | `RULES` lists include `R8` |
| `src/app/captains-corner/unavailable-dates/page.tsx` | The page (§6) — hard-redirect gate, `computeSlotStatus()`-filtered open dates/slots; admin captain-picker branch (§6.1) |
| `src/components/captains/UnavailableDatesPanel.tsx` | The captain-facing UI (§6) — toggle-only, no response picker; `viewingPlayerId` prop switches it read-only for an admin viewing another captain (§6.1) |
| `src/components/captains/CaptainPicker.tsx` | Admin-only `?captainId=` dropdown (§6.1) — client component, pushes the query string via `next/navigation` |
| `src/components/schedule/ClashArrow.tsx` | Shared `getArrowDirection()`/`ArrowIcon` — the directional-arrow convention for a blocked/clash slot, used by both `ScheduleGrid.tsx` (admin schedule grid) and `UnavailableDatesPanel.tsx` |
| `src/components/ui/SiteNav.tsx` | "Captains' Corner ▾" dropdown (Squad Selection + Unavailable Dates), desktop + mobile |
| `src/app/api/captain-availability/route.ts` | Unrelated fix bundled in earlier work: was missing `RATE_LIMITS.captainWrite`, which its sibling `player-availability/route.ts` already had |

---

*Maintained by: Spartans CC BLR*
