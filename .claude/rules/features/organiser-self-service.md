# Organiser Self-Service Reservations — Feature Summary

**Spartans Hub · Added: August 2026**

---

## 1. Overview

Tournament organisers previously had no way to act on the public
`/tournament-planner/share/[tournamentId]` card beyond a WhatsApp enquiry
link — every actual reservation still went through the coordinator
manually converting a WhatsApp exchange into a `soft_block`. This feature
lets an organiser reserve (or decline) a specific slot directly from that
public page, and attach a CricHeroes match link once the fixture is real —
without ever logging in, since organisers have no Hub account at all.

**This is the first unauthenticated write path in the app.** Every other
write route requires a Hub session with a role (player/captain/GC/admin);
this one deliberately doesn't, and was designed with that asymmetry in
mind throughout — see §6.

**Per-tournament opt-in, off by default.** `tournaments.organiser_self_service`
(migration `053_tournament_organiser_self_service.sql`) gates the entire
feature. Every tournament's share link keeps behaving exactly as it always
has (WhatsApp enquiry only) until an admin explicitly turns this on for
that one tournament, from `/admin/tournaments`.

**The final confirm step stays manual, by design.** An organiser can
reserve a slot and attach a match link, but nothing here ever flips a
booking to `confirmed` — that's still one click by an admin from the
existing `/admin/bookings/[id]` page. Every other confirmed booking in
this app is admin-created; an anonymous organiser (name + phone, never
verified) shouldn't be the one exception.

---

## 2. Why Per-Slot-Bucket, Not Per-Day

The first cut of this feature (superseded within the same session) offered
a flat list of a few fully-open days, reusing `getSuggestedOpenDates()`
as-is — mirroring the older WhatsApp-enquiry list it was replacing. Two
problems with that:

1. **No time was shown.** A day-level suggestion is deliberately silent on
   slot_time (see `suggestedSlots.ts`'s own comment on
   `getSuggestedOpenDates`) — fine for a non-binding enquiry, but the
   organiser is now making a real 48-hour commitment without knowing what
   time they're committing to until *after* reserving.
2. **It didn't match the slot balance the internal Tournament Planner
   already tracks** — "how many games does each slot still need" (see
   `distributeSlotTargets` / `src/lib/slotTargets.ts`), which is the more
   useful lens for what to actually offer an organiser to book next.

The shipped design instead suggests **one specific date per slot bucket
still below its even-split target** (e.g. "Sat 10:30 — 0/1", "Sun 07:30 —
0/1"), each with a real date and time from the moment it's shown. A day
that already has a *different* slot booked is no longer excluded — only
that one specific slot needs to be free and pass R1–R7, which is why the
reserve route no longer requires "the whole day is empty" the way the
original day-level suggestion did.

---

## 3. Database

### `tournaments.organiser_self_service`
`boolean not null default false`. Migration `053_tournament_organiser_self_service.sql`.
Toggled from a checkbox on `/admin/tournaments`'s edit form; `PATCH
/api/tournaments` already passes the whole request body through generically,
so no backend change was needed there — only the form field itself.

### `BLOCK_REASONS` — new value
`'Reserved via organiser self-service (pending confirmation)'`
(`src/types/index.ts`, exported as `ORGANISER_SELF_SERVICE_REASON`). Written
on every booking this flow creates — used both as an internal marker (the
attach-URL route refuses to touch a booking that doesn't carry this exact
reason) and, incidentally, as a real option in the Soft Block admin
dropdown, same as the pre-existing Knockout reason.

No new table for tracking declines — see §4.

---

## 4. Suggestion Engine — `src/lib/suggestedSlots.ts`

Two new exports, alongside the pre-existing `getSuggestedOpenDates()`
(untouched, still used for non-self-service tournaments' plain WhatsApp
list):

### `getSuggestedSlotDates(tournamentId)`

For each slot bucket (`Sat|Sun` × valid slot_time, per this tournament's
own active formats) currently below its `distributeSlotTargets()` target,
walks forward through the horizon to find the next date where that exact
slot passes `validateBooking()` (R1–R7) cleanly — no errors, no warnings.
Accepted picks are folded into a working set before checking the next
bucket, same incremental-selection principle `getSuggestedOpenDates`
already used, so two bucket suggestions can never jointly violate R1's
weekend cap even though each looks fine in isolation.

Returns `{ day, slot_time, format, game_date, current, target }[]` — one
entry per deficient bucket, or an empty array once every bucket has met
its target.

**Weekend-gap rule.** R1–R7 only cap club-wide weekend capacity — nothing
in the shared rules engine stops two suggestions for the *same* tournament
landing on the same weekend, or on back-to-back weekends, which reads as
an unpaced cluster to an organiser. `weekendAnchor()` / `blockSurroundingWeeks()`
(same file) enforce at least one clear weekend gap between any two of a
tournament's own dates — seeded from its real confirmed games, then grown
as each bucket suggestion is accepted so later buckets in the same run
can't land next to an earlier one either. `findNextSlotDate()` (below)
applies the identical rule for the decline step, and additionally takes
`avoidNearDates` — the other bucket cards' *currently displayed* dates,
sent by the client — so declining one card can't produce a date that
clusters with a sibling card still on screen.

### `findNextSlotDate(tournamentId, day, slotTime, format, excludeDates)`

The "decline" counterpart — given one specific bucket and whatever dates
have already been declined for it this session, finds the next compliant
date beyond those exclusions. Powers
`/api/tournaments/[id]/organiser-next-slot` (§5); has no notion of targets
or other buckets, since by the time this is called the organiser is
already mid-flow on one particular card.

---

## 5. API Routes — all public, no session

| Route | Method | Purpose |
|---|---|---|
| `/api/tournaments/[id]/organiser-reserve` | POST | Re-validates the exact `{game_date, slot_time, format}` the organiser is committing to (not a day-level check) via `validateBooking()`; creates a `soft_block` (48h) tagged to the tournament with the organiser's own name/phone. Returns `{taken: true}` (409) if the slot was taken between page-load and click, or if validation now fails for any reason (including landing on an existing R7-protected knockout day) — the client treats this identically to a decline. |
| `/api/tournaments/[id]/organiser-next-slot` | POST | Read-only lookup (`findNextSlotDate`) for the "Not available" step on one bucket. Rate-limited under `publicRead`, not `organiserWrite`, since nothing is written. |
| `/api/tournaments/[id]/organiser-attach-url` | POST | Attaches a CricHeroes URL (validated via `isCricheroesUrl()`) to a hold this same flow created — refuses anything not `status = 'soft_block'` with the exact `ORGANISER_SELF_SERVICE_REASON`, so it can't be pointed at an arbitrary `booking_id`. Notifies GC via the existing `notifyGCs()` helper; never flips status itself. |

All three re-derive tournament-scoped authorization server-side
(`organiser_self_service` must be `true` for that tournament) — never
trusts that the client only shows the widget when it should.

---

## 6. Security Posture — the first public write path

This is treated as genuinely new exposure, not an incremental extension of
an existing pattern:

- **Rate limiting.** New `organiserWrite` preset in `src/lib/rateLimit.ts`
  (8/hour, deliberately tighter than every authenticated preset), keyed by
  `tournament_id:phone` rather than the usual IP default, since the write
  routes have a natural identity to key off even without a session.
- **Identity is the link, not the person.** Name + phone, captured once,
  remembered via `localStorage` for repeat visits on the same browser,
  falling back to `tournaments.organiser_name`/`organiser_contact` (already
  on file from when the tournament was set up) if nothing's been typed yet
  in this browser — see §7. No verification step (no OTP) — the
  tournament's own unguessable share URL is the real access boundary, not
  the identity fields.
- **Never a free date/time picker.** Only ever one of the server-computed
  bucket suggestions, re-validated live at submit time — there's nothing
  for an organiser to construct arbitrarily.
- **Never auto-confirms.** See §1 — the admin confirm step is an
  unconditional design decision, not a stopgap.
- **Per-tournament opt-in.** `organiser_self_service` defaults to `false`
  for every tournament including ones that existed before this shipped.

---

## 7. UI — `OrganiserSelfService.tsx`

Client component rendered inside `TournamentShareCard.tsx` (a Server
Component) only when `tournament.organiser_self_service` is true and at
least one deficient bucket exists. One card per bucket, each independently
stateful (`pick → held → done`, or `exhausted` if every candidate date in
the horizon is declined):

- **Shared name/phone inputs** at the top of the widget (not per-card) —
  prefilled from `localStorage`, falling back to
  `tournament.organiser_name`/`organiser_contact` passed down as
  `defaultName`/`defaultPhone` props. Whatever the organiser previously
  typed in this browser always wins over the tournament's own default.
- **Reserve** → `organiser-reserve`; a `taken` response is handled exactly
  like a decline (calls the same `advanceToNext` path) rather than showing
  a hard error.
- **Decline** → `organiser-next-slot`, accumulating a per-card
  `declined: string[]` list client-side (not persisted server-side — see
  §4, no new table).
- **Held state** → CricHeroes URL input + submit → `organiser-attach-url`
  → `done`.

### Section order on the card — Reserve ahead of Schedule

`TournamentShareCard.tsx` renders this widget (or, for non-self-service
tournaments, the plain WhatsApp-enquiry list) directly under the stat bar,
**above** the Schedule section — moved up from its original position after
the game list. What an organiser can actually act on today is the reason
they're looking at the card at all; the completed/already-booked schedule
below it is reference material, not the thing they came to do. Both
variants dropped the `mt-3 pt-3 border-t` spacing they used when they were
appended after the game list — each is now the sole content of its own
top-level `px-4 py-3 border-b` section, matching every other section on
the card (Stat bar, Schedule, Game timeline, Slot balance).

### Slot balance parity — `TournamentShareCard.tsx`

The public share card's own "Slot balance" section previously showed a
bare count per slot with a bar relative to the tournament's own max —
different from the internal Tournament Planner's `count/target` display
(added the same week, commit `730da67`, "Show per-slot game targets in
tournament planner slot balance"). This was brought to parity: the share
card now computes the same `distributeSlotTargets()` split and shows
`count/target` (e.g. `2/3`) with the same emerald/amber target-met color
rule — for **every** tournament's share card, not just self-service ones.

`distributeSlotTargets`/`ALL_SLOTS` were extracted into a new
`src/lib/slotTargets.ts` for this — `TournamentPlannerClient.tsx` keeps its
own historical copy of the identical formula untouched (zero risk to
already-shipped code); the new shared module exists for this share card
and the suggestion engine, which need to stay honest with each other.

### Tournament name — hyperlink to points table

Same parity motivation: the share card's header now follows the existing
CricHeroes points-table hyperlink pattern (`architecture.md` §8.5) — the
tournament name links out to `tournaments.cricheroes_points_table_url`
when an admin has set one, same as `FixturesCard.tsx` and
`TournamentPlannerClient.tsx` already do, falling back to plain text when
unset. The share page's tournament query was widened to select
`cricheroes_points_table_url` for this — no new write path, no new
security surface, purely a read of an existing admin-set field.

### Captain name — hyperlink to CricHeroes profile (added August 2026)

Same hyperlink family as §8.4's player-name pattern in `architecture.md`,
but with a public-page-specific twist. Internally (`TournamentPlannerClient.tsx`),
the captain's name links via `PlayerNameLink` with `playerId` set, which
routes to the internal `/players/[id]/stats` page — correct there, since
every viewer is an authenticated Hub member. This share page's viewers are
anonymous organisers with no Hub account at all, so `TournamentShareCard.tsx`
deliberately does **not** reuse `PlayerNameLink` here — routing an
anonymous visitor into `playerId`'s branch would just bounce them off a
login wall. Instead it's a plain inline `<a>` straight to the captain's
own `players.cricheroes_url`, same style as the tournament-name link
directly above it, falling back to plain text when unset.

`captains.player_id` is nullable (legacy rows, or a captain with no linked
Hub player) — the share page's tournament query resolves this via a nested
`captains!tournaments_captain_id_fkey(id, name, players(cricheroes_url))`
embed (the same join shape already used by `/api/tournaments`,
`/api/bookings`, and `/api/bookings/[id]`), and no player means no
CricHeroes URL to show, same as any other unset-URL player.

---

## 8. File Map

| File | Role |
|---|---|
| `supabase/migrations/053_tournament_organiser_self_service.sql` | The opt-in column |
| `src/lib/slotTargets.ts` | Shared `distributeSlotTargets()` / `ALL_SLOTS` / `SlotKey` |
| `src/lib/suggestedSlots.ts` | `getSuggestedSlotDates()`, `findNextSlotDate()` — alongside the pre-existing `getSuggestedOpenDates()` |
| `src/app/api/tournaments/[id]/organiser-reserve/route.ts` | Public reserve |
| `src/app/api/tournaments/[id]/organiser-next-slot/route.ts` | Public decline lookup |
| `src/app/api/tournaments/[id]/organiser-attach-url/route.ts` | Public match-URL attach + GC notify |
| `src/lib/rateLimit.ts` | `organiserWrite` preset |
| `src/components/tournament-planner/OrganiserSelfService.tsx` | The interactive per-bucket widget |
| `src/components/tournament-planner/TournamentShareCard.tsx` | Renders the widget when enabled; `count/target` slot balance for everyone |
| `src/app/tournament-planner/share/[tournamentId]/page.tsx` | Branches between `getSuggestedOpenDates` and `getSuggestedSlotDates` based on the tournament's flag; `dynamic='force-dynamic'`, no ISR cache — see §10 |
| `src/app/admin/tournaments/page.tsx` | The opt-in checkbox |
| `src/lib/cricheroesId.ts` | `isCricheroesUrl()` — reused, not reimplemented |
| `src/lib/webpush.ts` | `notifyGCs()` — reused, not reimplemented |

---

## 9. Explicitly Out of Scope

- No admin-side surface (e.g. on `/tournament-planner`) showing "N pending
  self-service requests" — an admin only finds out via the GC push
  notification, then opens the specific booking. Worth adding if this sees
  real usage and that turns out to be too passive.
- No phone verification (OTP) — see §6 for why this was a deliberate
  choice, not a deferred one.
- Declines are session-local (client-side `declined` list) — closing the
  tab and reopening the share page starts fresh for that visit, though the
  suggestion itself is still freshly computed server-side each time, so it
  never re-offers an already-`soft_block`'d slot regardless.

---

## 10. Fixed — Stale Page on Open Right After an Edit (August 2026)

**Reported symptom:** opening the share link — most often right after
making a change from `/tournament-planner` — sometimes rendered
pre-change data (an old unbooked count, a booking that wasn't there yet,
etc.). Reloading the same page immediately after always rendered correctly.

**Root cause:** `src/app/tournament-planner/share/[tournamentId]/page.tsx`
carried `export const revalidate = 300` (5-minute ISR). Because this route
has a dynamic `[tournamentId]` segment with no `generateStaticParams`, it
can't be prerendered at build time — but Next still caches the rendered
HTML per resolved path for the `revalidate` window at runtime. The
symptom is classic stale-while-revalidate: the first request after the
cache goes stale is served the old cached render while Next regenerates
in the background, so only a follow-up request (a manual refresh) picks
up the fresh one. An admin editing a tournament and immediately clicking
through to the share link is exactly the worst-case timing for this —
they'd very likely land inside a still-fresh-looking 5-minute-old cache
window from someone's earlier visit.

**Fix:** `export const dynamic = 'force-dynamic'` + `export const revalidate = 0`
— the page (and `generateMetadata`, same route segment) now renders fully
fresh on every request, no caching layer at all. Traffic on this page is
low (an occasional organiser open, or an admin sanity-checking right after
a change), so the correctness win outweighs the marginal Supabase-read
cost. Same fix shape as the `lock-availability` cron's own
"Using cache" incident (`pending-backlog.md` S-8) — a different bug in a
different layer, but the same underlying lesson: don't assume a value read
fresh in one request is still fresh in the next one, on a route that isn't
forced dynamic.

---

*Maintained by: Spartans CC BLR*
