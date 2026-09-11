
CricHeroes scorecard extraction and database strategy
Last message Jun 14
Improving captain selection in tournament pages
Last message Jun 12
Streamlining captain-led squad selection process
Last message Jun 9
Documenting gaps between conversation intent and GitHub implementation
Last message Jun 5
Optimising project memory for Claude
Last message Jun 5
Cricket club weekend scheduling system
Last message Jun 5
API rate limiting implementation with Upstash Redis
Last message Jun 1
Creating a system architecture map from markdown files
Last message Jun 1
Matrix view for organiser schedule
Last message May 31
Updating site color scheme and theme configuration
Last message May 29
Spartans Hub tiered tournament scheduling proposal
Last message May 27
Site navigation revamp for role-based access
Last message May 23
Updating player availability and building captains' corner
Last message May 23
Remote GitHub repository access for context sharing
Last message May 22
Verifying U7, U25, and U26 from pending backlog
Last message May 22
Prioritized to-do list with security and dependencies
Last message May 21
Fixing U2, U5, and U6 from backlog
Last message May 20
Tournament planner view for captains
Last message May 13
Player login redirect to profile dashboard
Last message May 11
Availability update restrictions and overrides
Last message May 7
💬 Will it be possible to have a…
Last message Apr 25
Instructions
when the file changes are minimal, please provide only the changes in the responses along with the full file path. Do not send entire file to be replaced. Always reference the security guidelines in the uploaded SKILL.md file when reviewing or suggesting code. Specifically, audit my Supabase RLS policies and Next.js middleware according to the 'vibe-security' patterns before providing any fixes. Wherever player name is coming into picture provide hyperlink to their respective CricHeroes profile if set in their profile.

Files
18% of project capacity used
Search mode

spartans-cc-blr/spartans-book-a-slot
main

GITHUB



pending_backlog.md
639 lines

md



system_map.md
519 lines

md



push_notifications.md
232 lines

md



player_availability.md
374 lines

md



site_navigation.md
303 lines

md



gc_players.md
388 lines

md



post_match_scorecard_plan.md
849 lines

md



limitations.md
45 lines

md



session_context.md
16 lines

md



security.md
248 lines

md



player_profile.md
223 lines

md



captains_corner.md
224 lines

md



squad_selection_announcement.md
246 lines

md



match_card.md
238 lines

md



ui-theme.md
243 lines

md



Tournament Planner
8 lines

text



family_emergency_access.md
529 lines

md



admin_console.md
309 lines

md



SKILL.md
123 lines

md


squad_selection_announcement.md


# Squad Selection & Announcement — Feature Summary
 
**Spartans Hub · Sprint 2 · Last updated: July 2026**
 
---
 
## 1. Overview
 
The squad selection and announcement feature covers the full lifecycle from a captain building a squad to players seeing it on their fixture card. It is gated behind a GC (Governing Council) approval step before any squad can be publicly announced.
 
The flow is: **Captain selects → submits for GC review → GC approves → Captain announces → Players see squad on fixtures card**.
 
---
 
## 2. Status State Machine
 
Each squad is tied to a `booking_id` and every player row in the `squad` table carries a `status` column.
 
```
draft → pending_approval → approved → announced
                ↓
             draft  (returned by GC)
 
announced → draft  (captain edits post-announcement)
draft     → pending_approval  (resubmit)
approved  → announced  (re-announce)
```
 
The DB column uses `pending_approval`; the UI maps this to `pending` for display. The status badge in `SlotCard` shows: **Draft / Pending GC / GC Approved / Announced**.
 
---
 
## 3. Database Schema
 
### `squad` table (current, post-migrations)
 
| Column | Type | Notes |
|---|---|---|
| `id` | uuid PK | Auto-generated |
| `booking_id` | uuid FK → bookings | Which match |
| `player_id` | uuid FK → players | Selected player |
| `status` | text | `draft | pending_approval | approved | announced` |
| `is_captain` | boolean | Match captain — one per booking |
| `is_vc` | boolean | Vice captain — one per booking |
| `is_wk` | boolean | Wicket keeper — multiple allowed |
| `created_at` | timestamptz | Auto |
 
**Unique constraint:** `UNIQUE(player_id, booking_id)` — one squad row per player per match.
 
**Key architectural decision:** The `POST /api/squad` route deletes **all** existing rows for a `booking_id` (regardless of status) before re-inserting. This sidesteps unique constraint violations when a captain edits a squad that was already announced.
 
### Role columns — important separation
 
- `players.is_captain` = permanent club captain flag (controls Captains' Corner access)
- `squad.is_captain` = match-specific captain designation (goes into the announcement)
These are distinct. A player with `players.is_captain = false` can be designated match captain via `squad.is_captain = true`.
 
---
 
## 4. API Routes
 
### `POST /api/squad` — save draft
 
- Auth: captain or admin
- Body: `{ booking_id, player_ids: string[], roles: { captain, vc, wk: string[] } }`
- Deletes **all** existing rows for the booking regardless of status, then re-inserts with role flags
- Hard cap of 12 enforced server-side
- Validates that captain/vc/wk player IDs are all within `player_ids`
- **Time gate (first draft only, weekend bookings only):** creating a squad where none exists yet,
  for a booking whose `game_date` falls on a Saturday or Sunday (`isWeekend()`, shared from
  `src/lib/validation.ts`), is blocked Mon–Wed and before Thu 8am IST, and — as of 28 Jul 2026 —
  also requires the booking's own `game_date` to be in the weekend the Thu 8am–Sun window is
  currently governing (`getActiveLockWeekend()`). **A weekday (Mon–Fri) booking is never subject to
  this gate at all** (fixed September 2026 — see the incident note below) — a captain can draft its
  squad any day, since the Thursday lock-availability cron and its Sat/Sun-scoped window have
  nothing to do with a weekday fixture (weekday games are already fully isolated from every other
  weekend-scoped constraint in the app — see `features/player-availability.md` §4). Editing an
  already-existing draft is always allowed regardless of window, for any day of week.

  > **Incident (September 2026)** — the time gate checked only the calendar day/time when the
  > request arrived, never the target booking's own `game_date`, until the `isBlockedWindow` check.
  > A captain reported being unable to start a squad for a plain weekday fixture on a Monday, even
  > though the gate's entire purpose (per the comment above it) is to keep a squad from freezing a
  > *weekend* booking's availability more than a week early — a concern that doesn't exist for a
  > weekday game, which was never part of the Thu 8am–Sun lock window to begin with. Fixed by
  > fetching the booking's `game_date` first and skipping the whole gate (`isBlockedWindow` check
  > and `getActiveLockWeekend()` check both) whenever `!isWeekend(game_date)`.
- **Lock on draft save:** sets `bookings.availability_locked = true` the moment a *non-empty*
  draft is saved — this is a third freeze trigger alongside the Thursday cron and GC submission.
  See `features/player-availability.md` §10/§10.1 for the full freeze design and a 28 Jul 2026
  incident write-up (this trigger was previously unscoped and could freeze a future weekend's
  booking over a week early, or freeze one with an empty/never-submitted squad).
### `POST /api/squad/submit` — submit for GC review
 
- Auth: captain or admin
- Body: `{ booking_id }`
- Flips all `draft` rows for the booking to `pending_approval`
### `POST /api/squad/announce` — announce squad
 
- Auth: captain or admin
- Body: `{ booking_id }`
- Guards that at least one row is in `approved` status before flipping to `announced`
- GC approval is always required — even after post-announcement edits
### `GET /api/squad?booking_id=xxx` — fetch squad
 
- Auth: captain or admin sees all statuses; non-captains see only `announced` rows
- Returns: `player_id, status, is_captain, is_vc, is_wk, players(id, name, primary_skill, cricheroes_url)`
### `PATCH /api/gc/weekend-review` — GC decision
 
- Auth: `isGC` or `isAdmin`
- Body: `{ booking_id, decision: 'approved' | 'returned', note }`
- Approved: flips `pending_approval` → `approved`
- Returned: flips `pending_approval` → `draft`

Push notifications on announce:

POST /api/squad/announce fires push notifications after flipping squad status. Two batches:


All players in the squad with status = 'announced' — personalised congratulatory message
All players with is_gc = true — squad summary message


The route allows re-announcing already-announced squads (gate check allows ['approved', 'announced']) so notifications fire on every announce action including re-announcements after squad changes.

Push only reaches players who have subscribed via the bell button on /profile. Players without a push_subscriptions row receive nothing — expected behaviour, opt-in only.
---
 
## 5. Key Components
 
### `src/components/captains/CaptainsCornerGrid.tsx` — v4
 
**`CaptainsCornerGrid`** lifts `allSelected` state up across all `SlotCard` children so every slot has a live, shared view of who is selected where. This powers the taken-elsewhere cross-slot detection.
 
```typescript
const [allSelected, setAllSelected] = useState<Record<string, Set<string>>>(() => {
  const init: Record<string, Set<string>> = {}
  const bookingIdSet = new Set(bookings.map(b => b.id))
  for (const [bId, squad] of Object.entries(initialSquadMap)) {
    if (!bookingIdSet.has(bId)) continue  // skip stale entries from other weeks
    init[bId] = new Set(squad.selected)
  }
  return init
})
```
 
`liveSquadMap` is derived from `allSelected` via `useMemo` and passed to each `SlotCard`. Each card calls `onSelectedChange(bookingId, next)` on every toggle, keeping the shared map current.
 
**`SlotCard`** is the core unit. One per booking slot. Manages:
 
- `selected: Set<string>` — player IDs in the squad
- `roles: MatchRoles` — `{ captain: string|null, vc: string|null, wk: Set<string> }`
- `status` — hydrated from DB on page load via `initialSquad` prop
- `everAnnounced: boolean` — tracks whether squad has ever been announced (drives Edit button visibility)
- `saving`, `saveError` — API call state
**Key functions:**
 
| Function | What it does |
|---|---|
| `toggle(playerId)` | Checks/unchecks a player; calls `saveDraft` and `onSelectedChange` immediately; clears roles if player removed |
| `handleRoleToggle(playerId, role)` | Computes next roles outside `setRoles` to avoid stale closure; calls `saveDraft` |
| `saveDraft(selected, roles)` | `POST /api/squad` — saves current selection + roles as draft |
| `handleSubmit()` | `saveDraft` then `POST /api/squad/submit` — moves to `pending_approval` |
| `handleAnnounce()` | `POST /api/squad/announce` — moves to `announced` |
| `buildAnnouncementText()` | Inline function building full WhatsApp message with date, reporting time, venue, jersey, squad, CricHeroes URL, hospital |
| `takenElsewhere(playerId)` | Returns slot label if player is in another slot's squad **within the same ISO weekend**; Y-response players are never blocked |
 
**`SelectablePlayerRow`:** Each player row in the per-slot view. When a player is selected and status is `draft`, a role toggle sub-row appears beneath the player with C / VC / WK buttons. Roles display as read-only badges in non-draft states. Player names link to CricHeroes profile if `cricheroes_url` is set — `e.stopPropagation()` prevents the link click from toggling the checkbox.
 
**`MatrixView`:** Read-only availability overview (desktop default). Players × slots grid showing Y/O/E responses. Player names link to CricHeroes. No squad selection happens here.
 
**Select all button:** Lives in the "Available" section header. Respects the 12-player cap, skips players taken in other slots, only active in `draft` status.
 
### `src/app/captains-corner/page.tsx`
 
Server component. Fetches:
1. Upcoming confirmed bookings (with `match_time`, `cricheroes_url`, ground data)
2. All active players (with `cricheroes_url`)
3. Availability responses
4. **Existing squad rows** — builds `initialSquadMap: Record<bookingId, InitialSquad>`
The `initialSquadMap` is passed to `CaptainsCornerGrid` → `SlotCard`, which hydrates `status`, `selected`, and `roles` from it instead of always starting from scratch. This is what makes the GC Approved badge appear when a captain reopens the page.
 
Status mapping on the server: `pending_approval` → `'pending'`, others pass through as-is.

**Restricted to the next two rolling weekends only (added September 2026).**
The page fetches up to 20 upcoming confirmed bookings, then groups them into
weekend sections via `weekKey()` — an ISO-week bucket that already merges a
midweek game into the same group as the Sat/Sun that follows it (ISO weeks
run Monday–Sunday, so a Tuesday fixture and the Saturday/Sunday five days
later share one `weekKey()`). After grouping, only the **first two distinct
`weekKey()` groups** (in chronological order — the query is already ordered
by `game_date` ascending, so this is just the first two encountered) are
kept; every downstream step — the availability/squad fetch, `bookingIds`,
`initialSquadMap`, and the rendered `weekendMap` — operates on this
restricted `scopedBookings` set, not the full `activeBookings` fetch.

**Why:** a squad for a given weekend can't even be drafted before that
weekend's own Thu 8am–Sun lock window opens (`getActiveLockWeekend()`, this
section's Time gate note above) — so a captain has nothing actionable to do
on Captains' Corner for any weekend beyond the immediate next one. Showing
a longer rolling list of future weekends was pure clutter with no
corresponding action available on any of them. This only trims what's
*displayed and hydrated* on this one page — it doesn't change the time gate
itself, `getActiveLockWeekend()`, or which bookings are eligible for a
draft; a booking two weekends out is simply not fetched into this page's
view until it becomes one of the "next two."
 
### `src/components/admin/GCReviewClient.tsx`
 
Client component for the GC review page. Manages:
- **Fairness check table:** O/E availability players across the weekend, showing whether each is covered in a squad
- **Per-slot squad approval:** Chips showing the submitted squad with role badges (C/VC/WK). Approve and Return buttons only appear for `pending_approval` squads
- **Post-decision WhatsApp nudge:** After approving or returning a squad, a "Notify captain" WhatsApp pre-fill button appears so the GC can inform the captain of the outcome. This is a convenience nudge — **announcement remains the captain's responsibility exclusively from Captains Corner**
### `src/app/gc-review/page.tsx`
 
Accessible to `isGC` or `isAdmin`. GC members see it via the "GC Review" nav link in `SiteNav`. Admins reach it via the admin sidebar. Squads fetched with status filter `['pending_approval', 'approved', 'announced']` — draft squads are invisible to the GC.
 
### `src/lib/announcement.ts`
 
Standalone announcement builder. **⚠️ Not currently imported or called anywhere in the app** — confirmed by grepping the codebase (July 2026): `GCReviewClient.tsx` does not reference it, and no other component does either. The line below and the table in §6 previously claimed it was "used by `GCReviewClient`" — that was inaccurate and has been corrected. It is effectively dead code today; kept in the repo in case a future GC-side share flow revives it. Produces the full WhatsApp message format:
 
```
📅 Date
Format / Venue / Reporting Time (match_time − 15 min)
Maps URL
Jersey type (Colours for white ball, Whites for red/pink)
Team (numbered list with C/VC/WK suffixes)
Opponents
CricHeroes match URL
Nearest hospital URL
```
 
`buildAnnouncementText` in `CaptainsCornerGrid.tsx` is an inline duplicate used for the captain-side Copy and WhatsApp buttons. Both versions use `match_time ?? slot_time` as the base, subtracting 15 minutes for reporting time.
 
### `src/components/fixtures/FixturesCard.tsx`
 
Announced squad display for all logged-in players. Squad section collapsed by default. Expanded view shows players sorted **alphabetically by full name** with C / VC / WK role badges. Player names link to their CricHeroes profile if `cricheroes_url` is set. Jersey number, jersey name, and primary skill are intentionally excluded on the main fixtures page — the squad fetch selects only `id, name, cricheroes_url` from `players`, plus `is_match_captain, is_vc, is_wk` from the squad row.

**"Slot underfilled" availability nudge (added August 2026):** a small bottom-left
line on the card — `⚠ Slot underfilled` — shown whenever fewer than 12 players
have marked `Y` availability for that specific game. Deliberately **Y-count
only** — O and E responses are real availability signals too, but they're shared
across other slots that weekend/day (a captain can only place a given O/E
responder in one of them), so folding them in would require solving a cross-slot
assignment/matching problem rather than simple per-slot arithmetic. Y-only was
chosen as a cheap, slightly-over-eager heuristic in place of that: it can flag a
slot as underfilled that would in practice fill fine off O/E responses, but
never silently misses a real gap. Scoped server-side in `src/app/fixtures/page.tsx`
to the **nearest upcoming Sat/Sun weekend group only** (`upcomingWeekendKey`, the
first `validationGroupKey()` result prefixed `weekend-` among date-ascending
confirmed bookings) — never shown on a weekday game or a later weekend's cards.
`yCount` is a plain per-booking tally of `availability` rows where
`response = 'Y'`, fetched once for all active booking IDs and passed down via
`cardData`, then kept live client-side in `FixturesWeekendGroup` (nudged up/down
as the signed-in player's own response crosses in/out of `Y`, so a toggle
reflects immediately without a page reload). The flag keeps showing straight
through draft/pending/approved squad states — it does **not** wait for a squad
to be announced — but is suppressed once a squad has actually been
**announced with a full 12 players** (`squadAnnounced && squad.length >= 12`,
`squad` here being the already-announced-only rows from `squadMap`): at that
point the slot is genuinely filled regardless of what the raw Y-count says
(some of those 12 may have been O/E responders), so continuing to flag it as
underfilled would be actively wrong, not just over-eager. Otherwise gated
purely on `matchStatus !== 'in_progress'` (i.e. it disappears once the match
itself starts) and `yCount < 12`. At 12 or more Y responses, nothing is shown
at all. Purely a read of existing `availability` data; no new write path.

Named "underfilled" rather than "open" deliberately: `FixturesAvailability.tsx`
already renders a separate `🔒 Availability locked — Squad selection in
progress` message on the same card once the Thursday cron or a squad
submission locks the slot (see `features/player-availability.md` §10). Since
this nudge can still show while a squad is in draft/pending/approved (i.e.
already locked but not yet announced), it can render on the same card at the
same time as that lock message — "open" would read as directly contradicting
"locked," even though they describe two different things (whether responses
can still be changed vs. whether Y-count has hit 12). "Underfilled" is a
headcount fact, not an invitation to respond, so it can't clash.
 
---
 
## 6. Announcement Text — Who Does What
 
| Location | Function | Used for |
|---|---|---|
| `CaptainsCornerGrid.tsx` | `buildAnnouncementText()` | Captain's Copy + WhatsApp buttons — **official announcement path** |
| `src/lib/announcement.ts` | `buildSquadAnnouncement()` | ⚠️ Unused — not imported anywhere (verified July 2026); see note in §5 |
 
**Important:** Announcement is the captain's responsibility exclusively. The GC's role is approve or return — not distribute. The WhatsApp button in `GCReviewClient` after a decision is a nudge to notify the captain of the outcome, not to share the squad publicly.
 
Both `buildAnnouncementText()` and `buildSquadAnnouncement()` produce the same full WhatsApp format using `match_time ?? slot_time` minus 15 minutes for reporting time, and include ground, maps URL, hospital, jersey type, CricHeroes match URL, and the match card link (`/fixtures/[id]`) — though only `buildAnnouncementText()` is actually reachable from the running app today (see §5).

**Where `match_time` comes from:** as of July 2026, `/admin/bookings/new` and `/admin/bookings/[id]` default this field to `slot_time` itself the moment a slot is picked (changed 31 Jul 2026 — was originally `slot_time + 15 min`, found to be the wrong default in practice), unless already set or manually overridden — see `architecture.md` §8.1. So the `match_time ?? slot_time` fallback above now mostly only matters for bookings created before that default shipped, and for those it makes no practical difference either way now that the two defaults agree. The reporting-time subtraction itself (`− 15 min`, in both `formatReportingTime()` implementations) was independently re-verified against the code this same session and is correct as documented — no change was needed there. Net effect of the default change: a freshly-defaulted booking's reporting time is now `slot_time − 15 min` instead of `slot_time` exactly.
 
---
 
## 7. Role Logic
 
| Role | Cardinality | Stored on |
|---|---|---|
| Match Captain (C) | One per booking | `squad.is_captain` |
| Vice Captain (VC) | One per booking | `squad.is_vc` |
| Wicket Keeper (WK) | Multiple per booking (two WKs is valid) | `squad.is_wk` |
 
WK is a `Set<string>` in client state. Captain and VC are `string | null` — selecting a second player for either automatically clears the previous. WK is additive. Roles are cleared automatically when a player is unchecked.
 
---
 
## 8. Cross-slot Taken-elsewhere Logic
 
`takenElsewhere(playerId)` enforces that O/E players can only play one game per weekend. Key rules:
 
1. **Same ISO weekend only** — `isoWeekKey()` maps both Saturday and Sunday to the Saturday date as anchor. A player selected last weekend cannot bleed into the following weekend's view.
2. **Y-response players are never blocked** — only O and E constrain a player to one game. A player who answered Y can appear in multiple slots.
3. **Live via lifted state** — `allSelected` in `CaptainsCornerGrid` updates on every checkbox toggle via `onSelectedChange`, so sibling slots update in real time.
4. **Initialised from DB but scoped** — `allSelected` seeds from `initialSquadMap` on mount, filtered to only booking IDs belonging to the current grid instance. Stale entries from past weeks are excluded via a `bookingIdSet` check.
---
 
## 9. Security (vibe-security pattern)
 
- All API routes re-validate session server-side — no client-trust
- Hard cap of 12 enforced in `POST /api/squad` (never trust client count)
- Role assignments validated server-side: captain/vc/wk IDs must be within `player_ids`
- GC review routes check `isGC || isAdmin` server-side
- `POST /api/squad/announce` verifies `approved` status server-side — GC approval cannot be bypassed from the client
- `/captains-corner` page re-validates `isCaptain || isAdmin` on every load
---
 
## 9.1 Light/Dark/System (added September 2026)

`/captains-corner` is being converted to the app's Light/Dark/System theme
toggle — full mechanism in `ui-theme.md`'s "Light/Dark/System Theme"
section. This page's look has always been dark-ink only, with no light
story at all; that existing look is now specifically the **dark** theme
state (unchanged), and a new **light** variant sits alongside it.

**Landing in two passes.** The page shell (`src/app/captains-corner/page.tsx`
— hero band, Y/O/E legend, dues-badge row, footer) is done: every literal
hex/Tailwind dark class there now reads a `--captains-*` CSS variable
(`--captains-shell-bg`/`--captains-hero-bg`/`--captains-border`/
`--captains-text`/`--captains-text-muted`/`--captains-text-faint`/
`--captains-accent`/`--captains-accent-dim`, defined in `globals.css`
under both `[data-theme="light"]` and `[data-theme="dark"]`) instead of a
fixed `bg-ink`/`bg-ink-2`/`text-parchment`/`text-zinc-*` set. The Y/O/E
legend chip colours and the dues `₹` badge are left as literal, unchanged
status colours in both themes — small saturated accent chips, same
"semantic colours stay put" call every other themed page in this app has
made.

`CaptainsCornerGrid.tsx` itself (Per-Slot/Matrix views, `SlotCard`,
`AddPlayerPanel`, role badges, status pills) — the much larger piece — is
now also converted. It reuses the same `--captains-*` token set the page
shell already established, plus one new sub-surface token,
`--captains-surface-2` (light `#F8F4EE`, dark `#242424` — matches `ink-4`'s
literal dark value exactly), for the section header/footer strips and the
"＋ Add player" panel's own background, which have no exact match among the
page-shell's original token set.

**Conversion pattern.** Every structural Tailwind class this component used
(`bg-ink-3`/`bg-ink-4`/`bg-ink-5`/`bg-ink`, `border-ink-4`/`border-ink-5`,
`text-parchment`, `text-zinc-300`–`text-zinc-800`, `border-zinc-500`–
`border-zinc-800`, `bg-zinc-800`, including their `hover:`/`placeholder:`
variants) now carries a `dark:`-prefixed copy of the exact original class
alongside a new light base class reading the matching `--captains-*`
token — e.g. `bg-ink-3` → `bg-[var(--captains-card-bg)] dark:bg-ink-3`,
`text-zinc-500` → `text-[var(--captains-text-muted)] dark:text-zinc-500`.
Dark mode is therefore byte-identical to the component's pre-existing,
always-dark look; light is new. `text-gold`/`border-gold-dim`/`bg-gold/…`
accents were left unconverted throughout, matching the same call
`SiteNav.tsx`'s own Warm Light pass made for these tokens (`ui-theme.md`'s
Tailwind Token Mapping correction) — not the reported symptom, and they
read fine on either background.

**Status/semantic colours were deliberately left untouched, in both
themes** — same "small saturated accent chips don't need theming" call as
the page shell's own Y/O/E legend: the `RESP` (Y/O/E/L) response-code
colours and `Chip`, the `StatusBadge` draft/pending/approved/announced set
(including the grayscale `draft` entry, which stays literal specifically
because it's one state in that same four-state set, not a stray structural
gray), the amber dues `₹` badge and amber wallet-balance text, the "via
CAP"-style CAP/C/VC/WK role badges, the emerald "Announced ✓"/Approve/WA
button family, the red "taken elsewhere" pill and error text, the sky
"selected for this slot" row/checkbox tint, the rose fee-exemption heart
icon, and the `AddPlayerPanel`'s own Y/E/O/L proxy-add button colours
(`PROXY_CODES`) — none of these read from a `--captains-*` token in either
theme.

**Revised the same day, after the first real light render — those "leave
the status chips alone" calls were wrong for this page.** On Home/Fixtures
the status chips are a handful of small badges; here they *are* most of
the row. A screenshot of the light theme showed every one of them
dark-tuned and muddy on a white card: the selected-row `bg-sky-950/30`
rendered as a grey-blue slab, `text-amber-400` dues names washed out to
pale yellow, the `text-gold`/`bg-gold/10` CAP/C/VC/Announced badges read
as faint khaki (`gold` is `#C9A84C` — see `ui-theme.md`'s token
correction), the Y/O/E chips and 14Y/4O count chips sat as filled-dark
blocks, and the navy `Form` pill, `WK` badge, and `-400`-shade
emerald/red/rose/amber text all lost contrast. Dark stays byte-identical
(every change is a light base class paired with the exact original as
its `dark:` copy); light now gets:

- **Y/O/E/L chips (`RESP`, `Chip`, `RespCell`, `Legend`, the Matrix
  footer) read twelve new `--captains-resp-{y,e,o,l}-{bg,text,border}`
  tokens** (`globals.css`) — dark values are the original literals,
  light values a pastel tint with dark text of the same hue (`#DCFCE7`/
  `#15803D`, `#DBEAFE`/`#1D4ED8`, `#FFEDD5`/`#C2410C`, `#F3E8FF`/
  `#7E22CE`). `RESP` itself stays a plain constant — its values are now
  `var(--…)` strings, so every consumer flipped with no per-site change.
  `AddPlayerPanel`'s `PROXY_CODES` keeps its own slightly-different dark
  literals via `useTheme()` and reuses the `RESP` set in light. The
  page-shell legend (`page.tsx`) reads the same tokens now — which also
  fixed a pre-existing inconsistency where that legend drew `E` in yellow
  while every chip in the grid below drew it blue.
- **Gold badges** (CAP, C/VC role pills and toggles, `Announced`, the
  Submit-for-GC button, the Per Slot/Matrix view toggle, the `text-gold`
  time/heading text) use the `--captains-badge-*`/`--captains-accent*`
  tokens in light (`#FEF3C7`/`#B45309`/`#D97706`) — the same amber
  family the rest of the Warm Light app uses for its gold, not the
  muted khaki Tailwind `gold` token.
- **Selected row** `#EAF3FF` (a real sky-50 tint), **WK badge**
  `sky-100/300/700`, **Form pill** `#DBEAFE`/`#1E40AF`, **taken-elsewhere
  pill** `red-50/300/700`, **active match-role button** `emerald-100/400`,
  **StatusBadge** draft/pending/approved on `zinc/amber/emerald-50`
  backgrounds with `-300` borders and `-700` text, the **dues `₹` badges**
  on `amber-50`, the **GC-note box** on `amber-50`, and the three
  **legend dots** re-tinted to match the row treatments they describe.
- **Every `text-{amber,emerald,red,rose}-400` / `text-amber-300`** steps
  down to its `-700` (rose: `-500`) shade in light, `-400` kept for dark.
- **`RespCell`'s in-squad pip** (`✓`/`·`) darkens from `#34d399`/`#38bdf8`
  to `#059669`/`#0284c7` in light via `useTheme()`, since the dark-tuned
  shades vanish on a white cell.

The "small saturated accent chips don't need theming" rule from the
other pages still holds where it was applied — it just doesn't extend to
a page whose rows are almost entirely made of those chips.

**The "Form" panel is its own local theme, not `--captains-*`.** Both the
navy-gradient card `SelectablePlayerRow` opens (tournament/ground/format
record) and `ContextStatsTable` inside it were always a deliberately
separate styling family from the rest of this page — mirroring
`FixturesCard`'s own card look rather than the ink-token surfaces
everywhere else here (see that panel's own header comment). Since
`FixturesCard` itself has since gone theme-aware the same way
(`player-availability.md` §10.3), this panel now follows suit: a local
`FORM_LIGHT`/`FORM_DARK` token object plus a `useTheme()` lookup — the same
pattern `SelectedMatchCard.tsx` established for an identical problem —
rather than the page's CSS-variable route, since the container background
itself (a gradient, not a flat colour) needed to flip along with its text,
and mixing that with a still-hardcoded-dark container would have put light
text on a still-dark card. `FORM_DARK` reproduces the panel's original,
always-dark colours byte-for-byte; `FORM_LIGHT` is new, built from the same
Warm Light "match info" palette `FixturesCard`/`SelectedMatchCard` use.

---

## 10. Pending Tasks
 
| Task | Status | Notes |
|---|---|---|
| GC review announcement text missing ground data | ✅ Closed — won't do | GC role is approve/return only. Announcement is the captain's responsibility from Captains Corner. Ground/hospital/maps data not required on GC review page. |
| WhatsApp nudge to GC on squad submission | ✅ Done | `handleSubmit()` in `CaptainsCornerGrid.tsx` opens a pre-filled `wa.me` link after successful submit — captain picks the GC group as recipient. |
| WhatsApp nudge to captain on GC approve/return | ✅ Done | `GCReviewClient.tsx` shows a "Notify captain" WhatsApp button after both `approved` and `returned` decisions, with a re-notify option for squads approved in a prior session. |
| Automated WhatsApp announcement | Deferred (Sprint 5) | Requires WhatsApp Business API — current flow is manual copy/share from Captains Corner. |
| CricHeroes post-match stats integration using `bookings.match_id` | Deferred (Sprint 5) | Squad rows linked to booking → `match_id` enables per-player stat attribution. |