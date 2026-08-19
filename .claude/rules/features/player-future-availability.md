# Player Future Availability — Feature Summary

**Spartans Hub · Added: August 2026**

---

## 1. Overview

Slot-level availability for dates that don't have a real booking yet —
distinct from `availability` (`/api/player-availability`), which requires
a real `booking_id`. Lets a player pre-fill their general attendance ahead
of scheduling, feeding two consumers:

- **Suggestion engines** (`src/lib/suggestedSlots.ts`) skip a candidate
  date/slot the tournament's own leading captain has marked themselves
  unavailable (`L`) for — see §3.
- **Booking-time validation** (`validateBooking()`, `src/lib/validation.ts`)
  surfaces a non-blocking warning (**R8**) when an admin tries to book the
  tournament's captain into a slot they've marked `L` for — see §4.
- **Carryover**: once a real booking is confirmed for a date/slot, every
  player's (not just the captain's) pre-filled future-availability response
  for that exact date/slot is copied into the real `availability` table —
  see §5.

Reachable by every active, non-expelled player from `/fixtures` — not
gated behind Captains' Corner, since the underlying data and its two
consumers above key off *any* player's response, not just a captain's.

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

### `supabase/migrations/068_availability_update_source_carryover.sql`

`availability.update_source` and `availability_audit.update_source` both
carry a live CHECK constraint (`player`/`captain` only) that predates this
feature and isn't itself checked into `supabase/migrations/` (same
repo/DB drift pattern documented in `gc-players.md` §13 and
`post-match-scorecard.md` §5 — found only by querying the live schema, not
by reading the migrations folder). Widened to also allow
`'future_carryover'` (§5) — a carried-over row is neither a genuine
self-service write nor a captain-proxy write, so attributing it to
`'player'` would blur the audit trail.

---

## 3. API — `src/app/api/player/future-availability/route.ts`

| Method | Auth | Purpose |
|---|---|---|
| GET | Any signed-in player | Own rows only — `{ availability: {game_date, slot_time, response}[] }` |
| POST | Own session, non-expelled | `{game_date, slot_time, response}` (single slot) or `{game_date, response, whole_day: true}` (fans out server-side to all 4 slot_times as independent rows — a later single-slot edit only ever touches its own row) |
| DELETE | Own session, non-expelled | `{game_date, slot_time}` — clears one slot |

Mirrors `player-availability/route.ts`'s guard order (session →
`playerStatus !== 'expelled'` → rate limit → explicit
select-then-insert/update, never `.upsert()`) but has **no wallet-dues
guard and no `availability_locked`/freeze check** — neither applies before
a real booking exists. Zod-validated (`futureAvailabilityRequestSchema`,
`src/lib/schemas.ts`), rate-limited with `RATE_LIMITS.playerWrite`.

---

## 4. Suggestion Engines — `src/lib/suggestedSlots.ts`

Two different suggestion engines exist, chosen per-tournament by
`tournaments.organiser_self_service` (see `organiser-self-service.md`):

| Engine | Granularity | Used by |
|---|---|---|
| `getSuggestedOpenDates()` | Whole **day** only — never returns a slot_time | Public share page, non-self-service tournaments only (see §6 — the internal Hub GC/Admin panel that also used this was removed) |
| `getSuggestedSlotDates()` / `findNextSlotDate()` | Exact **slot bucket** (day + slot_time) | Public share page, self-service tournaments only (`organiser-reserve`/`organiser-next-slot`) |

Both now factor in the tournament's leading captain's
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

This closes a gap from the first cut of this feature: the whole-day
exclusion above was the only check that shipped initially, so a
self-service tournament's share page could still suggest an exact slot the
captain had marked `L` for (as long as it wasn't `L` for all 4 slots that
day). Fixed by threading `player_future_availability` into these two
functions' existing `validateBooking()` calls.

---

## 5. Rule R8 — `src/lib/validation.ts`

**Not "R7"** — R7 is already `knockout-day-protection.md`'s Knockout Day
Priority rule, live before this feature shipped. R8 is a new,
non-blocking **warning**, same severity tier as R2 (never enters
`errors`, never needs an admin override):

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

`validateBooking()` gained a 7th parameter,
`captainFutureAvailability: CaptainFutureAvailabilityRow[] = []`, defaulting
to empty — existing callers that don't pass it are unaffected. Wired in at:

- `POST /api/validate` and `POST /api/bookings` (admin booking form —
  fetches the captain's rows for the exact `game_date` being validated)
- `getSuggestedSlotDates()` / `findNextSlotDate()` (§4 above)

`RULES` lists in `/admin/bookings/new` and `/admin/bookings/[id]` both
include an `R8` entry so it surfaces in the `RuleCheckStrip`.
`bookingRuleOverrideSchema`'s rule enum was widened to include `'R8'` for
type consistency with `ValidationError['rule']`, even though a
non-blocking warning never actually reaches the override flow.

---

## 6. Carryover — `POST /api/bookings`

Once a confirmed booking is created, every player's
`player_future_availability` row for that exact `game_date` + `slot_time`
is copied into the real `availability` table — not just the captain's:

```ts
const { data: futureRows } = await supabase
  .from('player_future_availability')
  .select('player_id, response')
  .eq('game_date', game_date)
  .eq('slot_time', slot_time)
```

- `availability.updated_by` set to `null` (matches the main table's
  "self-update" convention).
- `availability_audit.updated_by` set to the player's own `player_id` —
  that column is `NOT NULL` (unlike the nullable column of the same name
  on `availability` itself), so it can't be `null`; crediting the player
  themselves matches the self-update convention `player-availability/route.ts`
  already uses for its own audit rows.
- Both write `update_source: 'future_carryover'` (§2).
- Carryover failure is logged and never rolls back the booking — same
  posture as the audit-insert error handling in `captain-availability/route.ts`.
- Only this route (real confirmed games) — **not** `/api/bookings/reserve`
  or the organiser self-service reserve route, both of which create
  `soft_block` holds that might expire, not real games.

---

## 7. UI — `FutureAvailabilityPanel.tsx`

Mounted on `/fixtures` (`src/app/fixtures/page.tsx`), gated on `isPlayer`
(any active, non-expelled player with a `playerId` — same gate as the
existing legend/`PushSubscribePrompt`). Collapsed by default.

- One row per upcoming Sat/Sun date, next 16 weeks
  (`upcomingWeekendDates()`, `src/lib/suggestedSlots.ts` — reuses the same
  "next Saturday strictly after today" anchor the suggestion engines
  already use, computed server-side and passed down as props).
- Whole-day **Available**/**Unavailable** quick actions (`whole_day: true`),
  plus a per-slot expand with Y/O/E/L buttons.
- Tap-active-to-clear convention, same as `FixturesAvailability.tsx`
  (tapping the already-active response clears it via `DELETE`).
- Same RESP colour legend as `CaptainsCornerGrid.tsx`'s Matrix view (own
  copy, not imported — that file doesn't export its `RESP` const).

---

## 8. Removed — Internal Tournament Planner "Suggested Slots" panel

The internal Hub `/tournament-planner` page previously had its own
GC/Admin-only "Suggested Slots" panel (`SuggestedSlotsPanel` in
`TournamentPlannerClient.tsx`, backed by
`GET /api/tournaments/[id]/suggested-slots`), independent of the public
organiser share page's own suggestions. Both surfaces called the same
`getSuggestedOpenDates()`, so they could never actually disagree — but
having suggested dates live in two places was judged unnecessary
duplication. **Removed** (August 2026, same session as the R8 exact-slot
fix above):

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

## 9. Security (vibe-security)

| Check | Status |
|---|---|
| `player_future_availability` RLS enabled, no anon/authenticated policy | ✅ |
| Route validates session server-side, checks `status !== 'expelled'`, rate-limited | ✅ |
| `game_date`/`slot_time`/`response` validated server-side against fixed enums on every write path (POST via Zod, DELETE via `GAME_DATE_REGEX` + enum check) | ✅ |
| Carryover insert failure never rolls back the parent booking | ✅ |
| No new `NEXT_PUBLIC_` env vars | ✅ |
| R8 is a non-blocking warning, same severity as R2 — never stricter than the pattern it mirrors | ✅ |
| `player_future_availability` writes never touch `bookings` | ✅ |

---

## 10. File Map

| File | Role |
|---|---|
| `supabase/migrations/067_player_future_availability.sql` | The table |
| `supabase/migrations/068_availability_update_source_carryover.sql` | Widens `update_source` CHECK constraints for `'future_carryover'` |
| `src/app/api/player/future-availability/route.ts` | GET/POST/DELETE |
| `src/lib/schemas.ts` | `futureAvailabilityRequestSchema`, `futureAvailabilitySlotTimeSchema`, `futureAvailabilityResponseSchema` |
| `src/lib/suggestedSlots.ts` | `upcomingWeekendDates()` (new); day-level exclusion in `getSuggestedOpenDates()`; exact-slot R8 wiring in `getSuggestedSlotDates()`/`findNextSlotDate()`; `HORIZON_WEEKS` now exported |
| `src/lib/validation.ts` | Rule R8, `CaptainFutureAvailabilityRow` type, `validateBooking()`'s new 7th param |
| `src/types/index.ts` | `ValidationError['rule']` widened to include `'R8'` |
| `src/app/api/validate/route.ts` + `src/app/api/bookings/route.ts` | Fetch and pass `captainFutureAvailability` into `validateBooking()`; the latter also does the carryover (§6) |
| `src/app/admin/bookings/new/page.tsx` + `src/app/admin/bookings/[id]/page.tsx` | `RULES` lists include `R8` |
| `src/components/fixtures/FutureAvailabilityPanel.tsx` | The player-facing UI |
| `src/app/fixtures/page.tsx` | Mounts the panel, gated on `isPlayer` |
| `src/app/api/captain-availability/route.ts` | Unrelated fix bundled in the same work: was missing `RATE_LIMITS.captainWrite`, which its sibling `player-availability/route.ts` already had |

---

*Maintained by: Spartans CC BLR*
