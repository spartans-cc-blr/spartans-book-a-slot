# Player Availability — Feature Summary

**Spartans Hub · Sprint 3 · Last updated: June 2026**

---

## 1. Overview

The Player Availability feature lets every Spartans player mark their availability for upcoming confirmed fixtures inline on the `/fixtures` page — no separate page, no form submission. Captains see a live breakdown of responses at `/captains-corner` and can proxy-add players who haven't responded.

The feature is fully live. The response codes, cross-game validation, captain proxy flow, and audit logging are all implemented.

---

## 2. Response Codes

N was deliberately removed during development. Blank (no response) is the new equivalent of "not available / hasn't responded yet". L is retained because it signals intent — the player is communicating they're away, not just silent.

| Code | Colour | Meaning | Scope of constraint |
|---|---|---|---|
| **Y** | Green | Available for this game | None |
| **E** | Blue | Available for either game today — captain picks one | Same day |
| **O** | Gold | Available for one game only this entire weekend | Whole weekend |
| **L** | Purple | On leave — not available | None (independent) |
| *(blank)* | — | No response yet | — |

Colours are matched exactly to the legacy Spartans Hub Google Sheets spreadsheet.

---

## 3. Database Schema

### `availability` table

| Column | Type | Notes |
|---|---|---|
| `id` | uuid PK | Auto-generated |
| `player_id` | uuid FK → players | Who submitted |
| `booking_id` | uuid FK → bookings | Which match |
| `response` | text | CHECK IN (`Y`, `O`, `E`, `L`) — N removed |
| `updated_by` | uuid FK → players nullable | null = self-update, set = captain proxy |
| `update_source` | text | `player` or `captain` |
| `created_at` | timestamptz | Auto |
| `updated_at` | timestamptz | Auto via trigger |

**Unique constraint:** `UNIQUE(player_id, booking_id)` — one response per player per match.

RLS is disabled — service key used throughout, consistent with the rest of the platform.

### `availability_audit` table

Immutable audit log. Rows are only ever inserted, never updated or deleted.

| Column | Type | Notes |
|---|---|---|
| `id` | uuid PK | Auto-generated |
| `availability_id` | uuid nullable FK | References the availability row (SET NULL on delete) |
| `player_id` | uuid FK | Who the response is for |
| `booking_id` | uuid FK | Which match |
| `old_response` | text nullable | Previous value — null on first insert |
| `new_response` | text | New value — `CLEARED` if response was deleted |
| `updated_by` | uuid FK | Who made the change (player themselves or a captain) |
| `update_source` | text | `player` or `captain` |
| `note` | text nullable | Optional captain note e.g. "confirmed via WhatsApp" |
| `created_at` | timestamptz | Immutable timestamp |

---

## 4. Cross-Game Validation Logic

Validation is **weekend-scoped** — it only applies between games falling on Saturday and Sunday of the same weekend. Weekday games are fully isolated and carry no cross-game constraints.

### `validationGroupKey()` — `src/app/fixtures/page.tsx`

```
Saturday  → "weekend-YYYY-MM-DD"         (own date as anchor)
Sunday    → "weekend-YYYY-MM-DD"         (maps back to the Saturday date)
Mon–Fri   → "weekday-YYYY-MM-DD"         (isolated, unique key per day)
```

Games sharing the same group key share a `FixturesWeekendGroup` instance with a single shared `weekendResponses` state. Weekday games are always in a group of one — validation never fires.

### Validation rules — `getBlockReason()` — `src/components/fixtures/FixturesAvailability.tsx`

| Player has marked | Trying to mark | Scope | Result |
|---|---|---|---|
| E on game A (same day) | Y on game B (same day) | Same day | ❌ Blocked |
| Y on game A (same day) | E on game B (same day) | Same day | ❌ Blocked |
| O on any game | Y on any other game | Whole weekend | ❌ Blocked |
| O on any game | E on any other game | Whole weekend | ❌ Blocked |
| Y or E on any game | O on any other game | Whole weekend | ❌ Blocked |
| E on game A (Sat) | Y or E on game B (Sun) | Different day | ✅ Allowed |
| E on game A | E on game B (same day) | Same day | ✅ Allowed |
| O on game A | O on game B | Whole weekend | ✅ Allowed |
| Anything | L | Any | ✅ Always allowed |

**L is never blocked and never blocks anything.** It is an independent per-game leave declaration.

Blocked buttons are rendered visibly — grey text with `text-decoration: line-through` and `cursor: not-allowed` — not invisible. The reason is shown as an orange warning message on tap.

---

## 5. Component Architecture

### `FixturesWeekendGroup` — `src/components/fixtures/FixturesWeekend.tsx`

The shared state owner for all games in one validation group. This is the key architectural decision — **state is lifted here so all cards in the same weekend share a single `weekendResponses` object**. When a player changes their response on card A, card B's buttons immediately reflect the constraint without a page refresh.

Owns:
- `weekendResponses: Record<bookingId, response>` — single source of truth for all cards in the group
- `savingMap: Record<bookingId, boolean>` — per-card loading state
- `errorMap: Record<bookingId, string | null>` — per-card error state
- `handleSelect(bookingId, code)` — calls the API, updates shared state on success only

Renders one `FixturesCard` + one `FixturesAvailability` per booking in the group, interleaved correctly.

### `FixturesAvailability` — `src/components/fixtures/FixturesAvailability.tsx`

Fully controlled component — no internal state. Receives:
- `response` — current value (from parent)
- `saving`, `error` — from parent
- `weekendResponses`, `weekendBookings` — for validation context
- `onSelect(bookingId, code)` — callback to parent

Computes `blockedReasons: Partial<Record<AvailKey, string>>` on every render from the validation logic. Passes the block reason as `title` (tooltip) on each button.

### `FixturesCard` — `src/components/fixtures/FixturesCard.tsx`

Stateless display card. Squad display section uses match-specific role fields — `is_match_captain`, `is_vc`, `is_wk` — merged from the `squad` table row, **not** from `players.is_captain` (the permanent club captain flag). This distinction is critical: a non-captain player can be designated match captain for a specific game.

---

## 6. API Routes

### `POST /api/player-availability` — self-update

- Validates session — `playerId` required, `expelled` status blocked
- Explicit SELECT → INSERT or UPDATE pattern (no upsert) — avoids Supabase conflict resolution edge cases
- The SELECT fetches `id, response` (both fields needed — `id` for the update target, `response` for the audit `old_response` value)
- Auto-reactivates inactive players: if `players.active = false` at time of submission, flips to `true` fire-and-forget — no admin action needed
- Writes audit row fire-and-forget after the main response is sent — never blocks the response

### `DELETE /api/player-availability` — clear response

- Same auth checks
- Writes audit row with `new_response: 'CLEARED'` and `old_response: null` (row is deleted before the old value can be fetched — acceptable for audit purposes)

### `POST /api/captain-availability` — captain proxy

Route path is `src/app/api/captain-availability/route.ts` — a flat sibling of `player-availability`, **not** nested under `/api/captain/`. This avoids confusion with the existing `/api/captains/route.ts` which manages the captains master data list.

- Requires `isCaptain = true` or `isAdmin = true`
- Accepts `player_id`, `booking_id`, `response`, optional `note`
- Sets `update_source: 'captain'`, `updated_by: captainPlayerId`
- Audit row always written — this is the authoritative trail for proxy actions
- Audit failure does not block the main operation (logged, not thrown)

### `GET /api/captain-availability?booking_id=&player_id=` — audit log fetch

- Captain/admin only
- Returns up to 100 most recent audit rows for a booking or player
- Joins `players` twice — once for the subject player, once for `updated_by`

---

## 7. Captains Corner Integration

### Player display

- **Y, O, E** responses are shown. **L and blank** are hidden — mirrors the legacy spreadsheet "Show OYE" filter.
- Players with `wallet_balance < 0` shown in amber with a `₹` badge.
- Players added by a captain (not self-reported) show a blue **via CAP** badge with a tooltip naming which captain set it.

### Cross-slot availability restrictions — `takenElsewhere()` in `CaptainsCornerGrid.tsx`

When a captain selects players for a slot's squad, `takenElsewhere(playerId)` enforces that players with O or E responses cannot be double-committed across slots within the same weekend. The function checks the live `squadMap` (derived from `allSelected` lifted state) and applies response-code-aware rules:

| Player's response | Rule applied |
|---|---|
| **Y** | Never blocked — Y is unrestricted. Player can appear in multiple slots' squads. |
| **O** | Blocked if already selected in **any other slot in the same ISO weekend**. Cross-week squads do not bleed. |
| **E** | Blocked if already selected in another slot on the **same calendar day** only. Other days are unrestricted. |
| *(blank / no response)* | Never blocked — a player with no response for the other slot cannot be constrained by it. |
| **L** | Not shown in the eligible list at all — filtered before `takenElsewhere` is reached. |

Blocked players render struck-through with a `"in 7:15 T30"` label and their checkbox is disabled.

#### `isoWeekKey()` — cross-week bleed prevention

`isoWeekKey(dateStr)` maps both Saturday and Sunday of the same weekend to the same anchor string (`"YYYY-Wnn"`). A player who was selected in a **previous weekend's** announced squad cannot appear as blocked in the following weekend — the key comparison `isoWeekKey(other.game_date) !== isoWeekKey(booking.game_date)` causes `takenElsewhere` to `continue` past that entry.

#### Lifted state — `allSelected` in `CaptainsCornerGrid`

Cross-slot awareness requires a shared state above the individual `SlotCard` components:

```typescript
const [allSelected, setAllSelected] = useState<Record<string, Set<string>>>(() => {
  const init: Record<string, Set<string>> = {}
  const bookingIdSet = new Set(bookings.map(b => b.id))
  for (const [bId, squad] of Object.entries(initialSquadMap)) {
    if (!bookingIdSet.has(bId)) continue  // exclude stale past-week entries
    init[bId] = new Set(squad.selected)
  }
  return init
})
```

`liveSquadMap` is derived from `allSelected` via `useMemo` and passed to every `SlotCard` as the `squadMap` prop. Each `SlotCard` reports back via `onSelectedChange(bookingId, nextSet)` on every checkbox toggle — sibling cards always have a current view of who is taken. On mount, each `SlotCard` calls `onSelectedChange` once via `useEffect` with an empty dependency array to register its initial selection.

### Captain proxy add flow — `AddPlayerPanel` in `CaptainsCornerGrid.tsx`

`AddPlayerPanel` is a sub-component defined inside `CaptainsCornerGrid.tsx`, rendered at the bottom of each `SlotCard` when expanded. It only appears when `status === 'draft'` and unresponded players exist.

**Step 1** — Search input filters the unresponded player list by name. Tap a player to select them.  
**Step 2** — Four response buttons (Y / E / O / L) appear. Tap one to save immediately — no confirm step.

On save, calls `POST /api/captain-availability` with `note: 'Added by captain'`. On success, `handleProxyAdd()` updates `liveAvailMap` in `SlotCard` state — the player immediately appears in the eligible list and the count chips update without a page refresh.

**JSX structure note:** `AddPlayerPanel` and the `＋ Add player` button must be placed **inside** the outer `<div className="bg-ink-3 ...">` SlotCard wrapper, after the `{open && (...)}` collapsible block closes. Placing them outside that wrapper causes orphaned closing divs and a broken component tree.

#### `SlotCard` state for proxy flow

| State | Type | Purpose |
|---|---|---|
| `liveAvailMap` | `Record<string, string>` | Starts from `availMap[booking.id]`; updated on proxy add — drives `getCounts` and `getSlotPlayers` |
| `addingFor` | `boolean` | Controls `AddPlayerPanel` visibility |
| `unrespondedPlayers` | `Player[]` | Derived from `liveAvailMap` — players with no response for this booking |

`getCounts` and `getSlotPlayers` receive `{ ...availMap, [booking.id]: liveAvailMap }` — spreading the live map over the server-fetched map so proxy additions are immediately reflected in both the count chips and the selectable player list.

### Auto-reactivation

If a player's `active` flag is `false` and they submit an availability response, the API automatically flips `active = true`. They then appear in Captains Corner on the next page load. This was a deliberate decision to avoid admin friction — re-engaging players re-activate themselves.

The `.eq('active', false)` condition on the update means it is a true no-op for the 99% case where the player is already active — no unnecessary DB writes.

---

## 8. Architectural Decisions

| Decision | Rationale |
|---|---|
| N removed as a response code | Blank = no response. N added no information a captain couldn't infer from silence. L is retained because it communicates intent (player is away, not just silent). |
| State lifted to `FixturesWeekendGroup` | Each card needed to react instantly to sibling changes. Individual card state would require a page refresh. One shared object makes validation live. |
| Weekday games fully isolated from weekend OYE validation | O and E are weekend concepts — "one game this weekend" is meaningless for a Thursday game. `validationGroupKey()` gives each weekday game a unique key so it's always alone in its group. |
| Explicit INSERT/UPDATE instead of upsert | Supabase's `upsert` with `onConflict` was silently failing on updates when `updated_at` column didn't exist. Explicit SELECT → INSERT or UPDATE is unambiguous. |
| SELECT fetches `id, response` (not just `id`) | The `response` value is needed as `old_response` in the audit log. Fetching only `id` would lose this and make the audit trail incomplete. |
| Captain proxy route at `/api/captain-availability` (flat) | Avoids confusion with `/api/captains` (master data CRUD). Flat naming mirrors `/api/player-availability` and makes the intent clear. |
| Audit log fire-and-forget | Audit failure should never block a player from saving their availability. The main operation completes first; the audit write is best-effort. |
| `update_source: 'player'` written on self-updates | Makes the audit log fully queryable — no need to infer intent from `updated_by`. |
| Auto-reactivation on availability submit | Admin-activating every returning player was an unnecessary friction point. The player's own action is the signal. |
| `liveAvailMap` scoped to `SlotCard` (not shared across slots) | Proxy adds affect one slot at a time. Captains Corner does not apply cross-game OYE validation — that lives on the player-facing fixtures page only. |
| `allSelected` lifted to `CaptainsCornerGrid` for cross-slot blocking | `takenElsewhere()` needs a live view of all slots' selections simultaneously. Per-slot state would be stale the moment a sibling slot changes. Lifting to the grid parent and propagating via `onSelectedChange` keeps it current. |
| Y-response players never blocked by `takenElsewhere()` | Y means unrestricted availability — the player committed to no cap. Only O (one per weekend) and E (one per day) carry exclusivity constraints. Blocking Y players would contradict the semantics of the response code. |
| `isoWeekKey()` prevents cross-week bleed in `takenElsewhere()` | Without the ISO week check, a player selected in last weekend's announced squad would appear as "taken elsewhere" in the following weekend's captain view — a ghost blocking bug. The key comparison ensures only same-weekend squads are considered. |
| `players.is_captain` ≠ `squad.is_captain` | Permanent club flag vs match-specific designation. Kept strictly separate — a non-captain player can captain a specific match without getting Captains Corner access. |

---

## 9. Pending Tasks

| Task | Priority | Notes |
|---|---|---|
| ~~Sort order in Captains Corner: captains → active → inactive~~ | Closed — superseded | Will become irrelevant when the analytical database is integrated. Player selection will be driven by recent performance, tournament performance, and time since last played — not a manual sort order. No action needed in the Hub layer. |
| ~~GC review announcement text missing ground/hospital/maps data~~ | Closed — won't do | The announcement section on the GC review page is unnecessary. GC's role is approval / return, not distribution. The captain handles announcement from Captains Corner. Ground, hospital, and maps data are not required on the GC review page. |
| Notification to GC when squad submitted for review | Medium | Currently passive — GC must manually check the page. A WhatsApp or email nudge would close the loop. |
| Audit log UI in Captains Corner | Low | API exists (`GET /api/captain-availability`), no UI to surface it yet. Useful for accountability but not urgent. |
| `isActive` on session token | Low | Currently the API does not block inactive players from submitting (by design — auto-reactivation handles it). But `isActive` is not yet surfaced on the session object, which limits future conditional UI. |
| Ghost "taken elsewhere" on re-edit after O/E squad approval | Low | When a squad containing an O/E player is returned by GC and re-edited, deselecting that player still shows them as taken in the cross-slot view until a full re-render. Fix: explicitly remove from `allSelected` at the grid level on deselect, not just from the local slot's `selected` set. |
| ~~Availability withdrawal guard after squad announcement or Thursday lock~~ | Closed — superseded | Design replaced by blanket hard-lock. See Section 10. |

---

## 10. Availability Freeze — Implemented Design

### Decision (June 2026 — ratified by club leaders)

Availability is **hard-locked** for players once a slot is frozen. No warnings, no notification flows, no player autonomy exceptions. Captains manage any post-lock pool changes directly via the captain proxy route.

### Three independent freeze triggers (additive)

| Trigger | Condition | When |
|---|---|---|
| **Thursday cron** | Blanket lock on all confirmed Sat/Sun slots | Every Thursday at 08:00 IST (02:30 UTC) — no Y-count condition |
| **GC submission** | Squad status reaches `pending_approval`, `approved`, or `announced` | Whenever captain submits squad for GC review |
| **Squad draft save** | `POST /api/squad` saves a non-empty draft, for a booking in the weekend currently open for selection | Whenever a captain first drafts a squad for that weekend (see §10.1) |

Any trigger is sufficient to freeze the slot. A slot locked by more than one trigger (e.g. Thursday cron fires, then GC approval follows) remains locked by all of them — the union applies.

### Player behaviour matrix

| Slot state | Player updates availability | Player withdraws Y/O/E | Player withdraws L |
|---|---|---|---|
| Before Thu 8 AM, squad in `draft` / no squad | ✅ Allowed | ✅ Allowed | ✅ Allowed |
| `availability_locked = true` (Thu cron fired) | ❌ Hard block | ❌ Hard block | ✅ Allowed |
| Squad `pending_approval` or `approved` | ❌ Hard block | ❌ Hard block | ✅ Allowed |
| Squad `announced` | ❌ Hard block | ❌ Hard block | ✅ Allowed |

**Error message shown to player in all blocked states:** `"Availability locked — Squad selection in progress"`

**Exception — a player may always withdraw their own `L` (added August 2026).**
The blanket freeze in §10 is about *claiming or holding a slot* once squad
selection is underway — a player pulling themselves out of the pool via `L`
isn't doing that, so it was carved out as a standing self-service exception
rather than routed through the captain proxy. This was a deliberate rejection
of the alternative fix (widening `AddPlayerPanel` in Captains Corner to let a
captain re-set an already-`L` player's response) — the product decision was
that this stays player-initiated only, captains don't get a UI to touch it.

`DELETE /api/player-availability` checks the player's *existing* response
before applying `checkFreeze()`: if it's `L`, the freeze check is skipped
entirely and the row is deleted unconditionally (self only — captain/GC/admin
already bypassed the freeze regardless of response). If it's `Y`/`O`/`E`, the
freeze still applies exactly as before — this exception does not loosen
withdrawal of a real availability commitment, only a leave declaration.

**Deliberately asymmetric with POST.** `POST /api/player-availability` is
untouched and still fully blocked while locked, for every response value
including `L` — a player can clear their `L` down to blank once frozen, but
cannot then re-mark `L` (or `Y`/`O`/`E`) themselves; only a captain/GC/admin
can set a response for them at that point, via `POST /api/captain-availability`.
Once cleared, the player is indistinguishable from any other true
no-response player — including to `AddPlayerPanel`'s `unrespondedPlayers`
filter in Captains Corner, so a captain can add them from that point on
using the existing proxy flow, same as anyone else who never responded.

### Captain override

Captains (and GC / Admin) bypass the freeze entirely. Any post-lock availability change — adding a late responder, handling a dropout — is done via `POST /api/captain-availability`. This route always bypasses `checkFreeze()`.

### API implementation — `src/app/api/player-availability/route.ts`

A shared `checkFreeze()` helper checks the booking's own lock flag before any write:

```typescript
async function checkFreeze(supabase, booking_id): Promise<string | null> {
  const { data: booking } = await supabase
    .from('bookings').select('availability_locked').eq('id', booking_id).single()
  if (booking?.availability_locked) return LOCK_MSG
  return null
}
```

> Corrected September 2026 — this section previously showed a two-query
> `Promise.all()` version that also checked live `squad.status` directly.
> The shipped route has never done that; it only ever reads
> `bookings.availability_locked` (which §10.1 and the Thursday cron are
> what actually keep in sync with squad state). Updated to match the real
> code, found while tracing why a captain/GC/admin's own re-mark was
> blocked in the UI — see the fix note below.

Called in both POST and DELETE handlers. Skipped entirely when
`session.isCaptain || session.isGC || session.isAdmin` — this is the
*server-side* bypass; see below for a client-side bug where the UI didn't
mirror it.

### UI didn't mirror the server's captain/GC/admin bypass (fixed September 2026)

**Reported symptom:** a captain (also GC) could clear their own `O`
response on an already-locked, squad-announced booking (`DELETE` isn't
blocked for them), but then couldn't tap any button to mark a new
response — every Y/O/E/L button rendered disabled, as if they were a
regular player hitting the freeze.

**Root cause:** `FixturesAvailability.tsx`'s `upstreamBlock` — the
client-side gate that disables every response button — only ever checked
`hasDues` and `slotLocked`:

```typescript
const upstreamBlock =
  hasDues    ? '...' :
  slotLocked ? 'Availability locked — Squad selection in progress' :
  null
```

It never looked at role at all, even though the component already
received an `isCaptain` prop (declared, destructured, and then never used
in this logic) and `checkFreeze()` on the server has always skipped the
lock entirely for `isCaptain || isGC || isAdmin` (see above). So once
`bookings.availability_locked` was `true` — which it reliably is by the
time a squad is announced, via the Thursday cron and/or §10.1's
squad-draft-save trigger — every button was disabled for *every* viewer,
privileged or not, even though a POST from a captain/GC/admin would have
been accepted by the API without any freeze check at all.

**Fix:** `FixturesAvailability.tsx` now accepts `isGC`/`isAdmin` props
alongside the existing `isCaptain`, computes
`bypassesFreeze = isCaptain || isGC || isAdmin`, and only applies the
`slotLocked` block when `!bypassesFreeze` — mirroring the server exactly.
The dues guard (`hasDues`) is untouched and still applies to everyone,
since the API's own wallet-dues guard is never skipped by role either.
The "🔒 Availability locked" notice under the buttons is likewise
suppressed for a privileged viewer, since it would otherwise contradict
buttons that are actually still tappable. `isGC`/`isAdmin` are threaded
down from both server pages that render this component
(`src/app/fixtures/page.tsx` and `src/app/fixtures/[id]/page.tsx`, the
standalone share page) through `FixturesWeekendGroup`
(`src/components/fixtures/FixturesWeekend.tsx`), the same way `isCaptain`
already was. `getBlockReason()`'s own Y/O/E cross-game validation is
unaffected by any of this — that still applies equally to every viewer,
privileged or not, since only the freeze/dues guards were ever meant to
have a role-based bypass.

### §10.1 — Squad-draft-save implementation — `src/app/api/squad/route.ts`

`POST /api/squad` (the captain's save-draft route, see `features/squad-selection.md`) also
sets `bookings.availability_locked = true` — a squad being actively drafted freezes the
booking immediately, without waiting for the Thursday cron or a GC submission. Two
conditions must both hold:

```typescript
// Only when the draft actually has players:
if (player_ids.length > 0) {
  await supabase
    .from('bookings')
    .update({ availability_locked: true })
    .eq('id', booking_id)
}
```

and, upstream of that, the first-draft time gate only allows creating a squad for a
**weekend** booking (`isWeekend(game_date)`) whose own `game_date` falls in the weekend
currently open for selection (Thu 8am IST → Sun), via `getActiveLockWeekend()` — not just
"today is Thu–Sun." A weekday booking skips this gate entirely, at any time — see
`features/squad-selection.md` §4's September 2026 incident note for why.

> ⚠️ **Incident (28 Jul 2026) — this trigger existed undocumented and unscoped since
> squad selection shipped, and it froze a booking more than a week early.**
> Captains Corner lists up to 20 upcoming confirmed bookings across multiple future
> weekends (`src/app/captains-corner/page.tsx`), and the original time gate only
> checked *today's* day-of-week — never which weekend the target booking belonged to.
> The lock write itself also fired unconditionally, even for an empty save
> (`player_ids: []`). Together this meant a captain interacting with any visible
> slot card — including one for a weekend still a week-plus out — immediately froze
> that booking's player availability, with no GC step and sometimes no actual squad
> behind it. Caught when the Aug 1 2026 07:30 game showed `availability_locked = true`
> with **zero** rows in `squad` for that booking (confirmed via direct DB query — no
> `squad_audit` row either, since audit only fires on reopening an already-`LOCKED_STATUSES`
> squad, not on a first empty draft). Root cause and fix: both conditions above —
> `getActiveLockWeekend()` scoping on the time gate, and the `player_ids.length > 0`
> guard on the lock write. The one already-affected booking was manually unlocked in
> Supabase as a one-off data fix, separate from the code fix.

### Cron implementation — `src/app/api/cron/lock-availability/route.ts`

Blanket UPDATE — no Y-count filter:

```typescript
await supabase
  .from('bookings')
  .update({ availability_locked: true })
  .in('game_date', [saturday, sunday])
  .eq('status', 'confirmed')
  .eq('availability_locked', false)   // idempotent
```

Schedule: `"30 2 * * 4"` (02:30 UTC = 08:00 IST Thursday)

### UI implementation — `src/components/fixtures/FixturesAvailability.tsx`

`upstreamBlock` covers both freeze conditions with the same message:

```typescript
const upstreamBlock =
  hasDues        ? 'Your account has outstanding dues...' :
  slotLocked     ? 'Availability locked — Squad selection in progress' :
  squadAnnounced ? 'Availability locked — Squad selection in progress' :
  null
```

The old partial-lock carve-out (allowing L/O for Y-holders when `slotLocked`) is removed. Frozen slot notice below the buttons: `🔒 Availability locked — Squad selection in progress`.

### What is explicitly out of scope

- Warning modals or confirmation dialogs before withdrawal — hard block only
- Automatic unlock on Y-count drop — not applicable (blanket lock is time-based, not count-based)
- WhatsApp withdrawal notifications — not needed; captains own post-lock pool management
- Per-captain unlock from the UI — admin PATCH on `/api/bookings/[id]` remains the unlock path if needed

---

## 10.1 Date-Chip Quick Filter (added September 2026)

A horizontal date-chip row ("All" + one chip per group) sits above the
weekend groups on `/fixtures`, in the Warm Light palette (`#F8F4EE` panel,
`#D97706` active chip) rather than the page's existing dark-ink theme — a
self-contained light "island" on the page, same convention as the Home
Page dashboard rebuild (`navigation.md` §3.1).

**Deliberately a "jump to this weekend" control, not a per-card date
filter.** A Sat/Sun weekend group shares one `weekendResponses` OYE
validation state by design (§5's `FixturesWeekendGroup`) — hiding just the
Sunday card while a Saturday chip is selected would visually separate two
games whose availability responses constrain each other, which is exactly
the thing this page's shared-state architecture exists to keep visible
together. So selecting a chip shows the **whole weekend group** that date
belongs to, not just that one card; an isolated weekday game (already its
own group, §4) shows alone as expected.

**Chips mirror the grouping, not the raw date list (fixed September
2026).** The first cut rendered one chip per distinct `game_date` — so a
weekend still showed two separate chips (e.g. "24 OCT" and "25 OCT"), and
tapping either one correctly revealed both days (per the "jump to the whole
weekend" behaviour above) but with no visual hint that was about to happen
— a reported "why does tapping Oct 25 also show me Oct 24?" confusion. Fixed
by deriving the chip row directly from the same `weekendOrder`/`weekendMap`
grouping `fixtures/page.tsx` already uses to render each
`<FixturesWeekendGroup>`, instead of a flat `Array.from(new Set(...))` over
every booking's `game_date`. Each entry is now a `DateChipGroup { key,
dates }` — `dates.length === 1` for an isolated weekday game (renders as
before: day-of-week/day-number/month stacked), `dates.length === 2` for a
Sat+Sun weekend (renders as one combined chip: `SAT–SUN` / `24–25` /
`OCT`, or `OCT/NOV` if the pair straddles a month boundary). Weekday chips
were already one-per-day and needed no change — only weekends were ever
being split across two chips that both did the same thing.

**Implementation stays entirely outside `FixturesWeekendGroup` — zero
changes to its live availability/validation logic.** `fixtures/page.tsx`
wraps each rendered `<FixturesWeekendGroup>` in a plain
`<div data-dates="2026-09-12,2026-09-13">` (the group's own distinct
`game_date`s, sorted and comma-joined). `FixturesDateFilterBar` (client
component, wraps the whole list as `{children}`) renders the chip row and,
when a chip is selected, injects one `<style>` rule —
`[data-dates]:not([data-dates*="<selected>"]) { display: none }` — a plain
CSS attribute-substring selector, matched against the chip group's first
(earliest) date, which is always one of the tokens present in that same
group's `data-dates` wrapper. Safe here specifically because every date
token is a fixed 10-character ISO string (`YYYY-MM-DD`), so a substring
match can't accidentally hit a different date. No prop threading, no state
lifted into `FixturesWeekendGroup`, no risk of disturbing its
`weekendResponses`/`savingMap`/`errorMap` state — the filter is purely a
CSS visibility toggle over server-rendered output that already exists.

`DateChipSlider` (`src/components/ui/DateChipSlider.tsx`) is the shared,
presentational chip-row component — also used by `/matches/history`'s own
day-level filter (`features/post-match-scorecard.md` §16), including that
page's own combined-weekend-chip treatment (via the shared
`groupDatesIntoChips()` helper, `src/lib/dateChipGroups.ts`) with the same
Warm Light styling, so the two "date slider" surfaces the club coordinator
asked for don't drift visually. `DateChipSlider` itself is purely
controlled (`groups`, `selected`, `onSelect`) — no grouping logic of its
own; each page derives its own `DateChipGroup[]` the way that best fits its
own data (`/fixtures` from its existing `weekendMap`, Match History via the
shared helper since it has no per-match grouping of its own).

**Page shell widened to Warm Light too (added September 2026).** After
seeing the date-chip slider, the club coordinator asked for the same
treatment on the rest of `/fixtures` — hero, the "not registered"/expelled
banners, the Y/E/O/L legend, and the footer all switched from the dark
ink theme to the Warm Light palette (`#F8F4EE` page bg, `#FFFFFF` hero/
legend cards, `#D97706` gold accent). `FixturesCard`/`FixturesAvailability`
themselves were explicitly asked to stay as they are — both already carry
their own hardcoded dark gradient background via inline `style` (not a
class inherited from the page), so they render correctly as dark cards on
the new light page with zero changes needed. `SiteNav` on this page now
passes `mobileTabBarTheme="light"` (`navigation.md` §4.1) so the bottom
tab bar matches. Scope is deliberately just this page and
`/matches/history` (§16 there) — not a site-wide reskin; see
`navigation.md` §4.1's "Warm Light variant" note for the full reasoning.

**Light/Dark/System (added September 2026) — supersedes the "stays as they
are" decision above.** The Hub gained a real OS-style Light/Dark/System
toggle (full mechanism in `ui-theme.md`'s "Light/Dark/System Theme"
section). `/fixtures`' page shell (hero, not-registered/expelled banners,
the Y/E/O/L legend, footer) and `FixturesDateFilterBar.tsx` now read their
colours from a `--fx-*` CSS-variable set in `globals.css` instead of the
literal hex values this section describes — the light values are byte-
identical to what's documented above, and a new dark counterpart was added
alongside them, so the shell now genuinely follows the visitor's choice
rather than being fixed Warm Light. `<SiteNav activePage="fixtures" />` no
longer passes `mobileTabBarTheme="light"`, so the bottom tab bar follows
the toggle too instead of being pinned light. **`FixturesCard`/
`FixturesAvailability`'s "stays dark, deliberately" decision is being
reversed in this same pass** — both are being converted to read from the
same `--fx-card-*`/`--fx-badge-*` tokens, with their current dark gradient
preserved exactly as the `dark` state and a new light variant designed
alongside it (modelled on `SelectedMatchCard.tsx`, a close analog already
built in Warm Light). See that component's own file for the final result.
(Conversion of `FixturesCard.tsx`, `FixturesAvailability.tsx`, and
`FixturesWeekend.tsx` is still landing incrementally as of this note.)

---

## 10.2 "Matches" — Fixtures + Match History merged into one bottom tab (added September 2026)

The mobile bottom tab bar originally shipped with "Fixtures" and "Matches"
as two separate tabs (`navigation.md` §4.1's first cut). After seeing the
reference screenshot again, the club coordinator pointed out it used a
single "Matches" tab with **Upcoming / Past Matches as an in-page toggle**
instead of two tab slots — matching what the desktop nav's "Matches ▾"
dropdown had already been doing since before the mobile rebuild (`SiteNav`
§4's `links` array: one "Matches" menu, "🏏 Upcoming" → `/fixtures` and
"📜 Past Matches" → `/matches/history` as its two items).

**Deliberately two real routes still, not one merged page.** `/fixtures`
(§4-§10 above) and `/matches/history` (`features/post-match-scorecard.md`
§9) each carry substantial independent live architecture — Fixtures' own
shared weekend availability state, Match History's own client-paginated
filter/list — that would be riskier to fold into a single page than to
link between. `MatchesSegmentedTabs` (`src/components/matches/
MatchesSegmentedTabs.tsx`) is the shared two-pill control both pages
render at the top of their hero: a plain server component (no client
state) — two `<Link>`s, `active` passed in explicitly (`"upcoming"` on
`/fixtures`, `"past"` on `/matches/history`) rather than derived from
`usePathname()`, since each page already knows which one it is. Both
pages' `<h1>` and `<title>` were retitled from "Upcoming Fixtures"/"Past
Matches" to plain "Matches" to match — the segmented control is what now
conveys which half you're looking at.

**Bottom tab bar** (`MobileTabBar.tsx`) collapsed its two tabs into one:
"Matches" always links to `/fixtures` and is active for both
`activePage === 'fixtures'` and `activePage === 'matches'` — see
`navigation.md` §4.1 for the updated tab table. Tapping it always lands on
Upcoming; the segmented control is how a viewer gets to Past Matches from
there. This also freed a tab slot (Home · Matches · Dugout · More, down
from five) — deliberately left at four rather than filled with something
new, since nothing else was asked for.

---

## 10.3 Light/Dark/System theme support (added September 2026)

The page shell (`src/app/fixtures/page.tsx`) was already Warm Light-only
(§10.1's "Page shell widened to Warm Light too" note); it's now genuinely
theme-aware instead — every inline colour that used to be a literal hex now
reads one of the `--fx-*` CSS custom properties (`ui-theme.md`'s Light/Dark/
System tokens, `src/app/globals.css`), which flip automatically with the
visitor's Light/Dark/System choice via the `data-theme` attribute on
`<html>`. The page's own current look is unchanged for a Light-preference
visitor — the `[data-theme="light"]` block was seeded from this page's
existing colours — and a Dark-preference visitor now gets the app's
original dark-ink look instead of a jarring light island. Two small new
tokens, `--fx-danger-bg`/`--fx-danger-border`/`--fx-danger-text`, were added
to both light and dark blocks for the Expelled banner, which had no
existing danger/crimson token to reuse. `<SiteNav activePage="fixtures" />`
no longer passes `mobileTabBarTheme="light"` — the bottom tab bar now
follows the visitor's own theme choice too, the same way it already does on
the Home dashboard.

**`FixturesCard.tsx` and `FixturesAvailability.tsx` reverse their earlier
"deliberately stays dark by design" decision.** Both of these were
previously hardcoded to a permanently-dark palette via inline `style`,
regardless of what theme the page around them used — `squad-selection.md`
and the earlier revisions of this section documented that as intentional,
on the reasoning that a squad-announced card's content ported cleanly from
the legacy spreadsheet look and didn't need re-theming. That decision is
reversed here at the product level: both components now read a local
`LIGHT`/`DARK` token object selected via `useTheme()`
(`src/components/ui/ThemeProvider.tsx`), the same client-side pattern
`SelectedMatchCard.tsx` (the Home dashboard's near-identical squad-announced
card, §3.1 of `navigation.md`) already established. `FixturesCard.tsx`
gained an explicit `'use client'` directive to go with it — it already used
`useState` and was only ever reachable through a `'use client'` ancestor
(`FixturesWeekendGroup`), so this is a formality, not a behaviour change.

The **dark** token values in both components are the componentsʼ original,
always-dark colours, copied byte-for-byte — nothing about the dark
appearance changed. The **light** values are new, built from the same Warm
Light palette `SelectedMatchCard.tsx` uses for the equivalent content (card
background/border, heading/body/muted/faint text, the gold-tinted
match-stage and C/VC badge pills, the fee/wallet-projection text). A
handful of small, self-contained status chips are left as plain literals in
both themes rather than threaded through the token objects — the format
pill, the WK badge, the "IN PROGRESS" pill, the ground/maps green link, and
the Y/O/E/L response-button colours in `FixturesAvailability.tsx` (which
must keep matching the fixed legend colours on the page shell above them
regardless of theme) — since they already read fine on either card
background, the same call `SelectedMatchCard.tsx` made for its own format
and WK chips. `FixtureShareButton` (exported from `FixturesCard.tsx`,
reused by `FixturesAvailability.tsx` and `FixturesWeekend.tsx`'s dues
banner) also picks its icon colour from `useTheme()` now, darkening on
hover in light mode instead of lightening.

`FixturesWeekend.tsx`'s own "⚠ Outstanding dues" banner (rendered in place
of `FixturesAvailability` when the signed-in player owes money) is themed
the same way — dark preserved exactly, light reusing the same amber warning
combo (`#FEF3C7`/`#F5D9A8`/`#92400E`) the page shell's "not registered"
banner already uses. `FixturesDateFilterBar.tsx`'s own wrapper panel now
reads `--fx-shell-bg`/`--fx-border` instead of literal hex; `DateChipSlider`
itself (out of scope here — shared with Match History) was not touched.

---

## 11. File Map

| File | Role |
|---|---|
| `src/app/fixtures/page.tsx` | Server component — fetches bookings, availability, squads; groups by `validationGroupKey`; renders `FixturesWeekendGroup` per group, each wrapped in a `data-dates` div for §10.1's date-chip filter; theme-aware via `--fx-*` CSS vars (§10.3) |
| `src/components/fixtures/FixturesDateFilterBar.tsx` | Date-chip quick filter (§10.1) — wraps the weekend-group list, toggles visibility via a CSS attribute-substring rule; never touches `FixturesWeekendGroup`'s own state; wrapper panel theme-aware via `--fx-*` CSS vars (§10.3) |
| `src/components/ui/DateChipSlider.tsx` | Shared Warm Light date-chip row — controlled component, also used by `/matches/history` (`features/post-match-scorecard.md` §16) |
| `src/components/matches/MatchesSegmentedTabs.tsx` | Shared "Upcoming / Past Matches" pill control (§10.2) — plain server component, rendered on both `/fixtures` and `/matches/history` |
| `src/app/fixtures/[id]/page.tsx` | Single match share page — same squad fetch pattern as fixtures page |
| `src/components/fixtures/FixturesWeekend.tsx` | `FixturesWeekendGroup` — shared state owner; handles API calls; renders card + availability pairs; own "outstanding dues" banner theme-aware via `useTheme()` (§10.3) |
| `src/components/fixtures/FixturesAvailability.tsx` | Controlled availability button row; runs `getBlockReason()` validation on every render; theme-aware via `useTheme()` — no longer permanently dark (§10.3) |
| `src/components/fixtures/FixturesCard.tsx` | Match card display; squad section uses `is_match_captain`, `is_vc`, `is_wk` from squad row; theme-aware via `useTheme()` — no longer permanently dark (§10.3) |
| `src/app/api/player-availability/route.ts` | Self-update API — GET, POST, DELETE; explicit SELECT(`id, response`) → INSERT/UPDATE; auto-reactivation; audit log |
| `src/app/api/captain-availability/route.ts` | Captain proxy API — POST (set availability on behalf of player); GET (audit log fetch) |
| `src/app/captains-corner/page.tsx` | Captain-only server page — fetches all data; renders `CaptainsCornerGrid` per week |
| `src/components/captains/CaptainsCornerGrid.tsx` | Per Slot + Matrix views; `SlotCard` squad selection; `AddPlayerPanel` proxy flow; `liveAvailMap` for proxy-add reflection; `allSelected` + `liveSquadMap` for cross-slot `takenElsewhere()` blocking; `isoWeekKey()` for cross-week bleed prevention |
