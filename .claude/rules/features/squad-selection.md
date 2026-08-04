
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
- **Time gate (first draft only):** creating a squad where none exists yet is blocked Mon–Wed and
  before Thu 8am IST, and — as of 28 Jul 2026 — also requires the booking's own `game_date` to be
  in the weekend the Thu 8am–Sun window is currently governing (`getActiveLockWeekend()`).
  Editing an already-existing draft is always allowed regardless of window.
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

**"In: N Y" availability nudge (added August 2026):** a small bottom-left line on
the card — `In: <count> Y` — showing how many players have marked `Y` availability
for that specific game. Scoped server-side in `src/app/fixtures/page.tsx` to the
**nearest upcoming Sat/Sun weekend group only** (`upcomingWeekendKey`, the first
`validationGroupKey()` result prefixed `weekend-` among date-ascending confirmed
bookings) — never shown on a weekday game or a later weekend's cards. `yCount` is
a plain per-booking tally of `availability` rows where `response = 'Y'`, fetched
once for all active booking IDs and passed down via `cardData`. The row hides only
once the squad has been **announced with a full 12 players** (`squadAnnounced &&
squad.length >= 12`, `squad` here being the already-announced-only rows from
`squadMap`) — a draft/pending/approved squad, or an announced squad below 12,
keeps showing it. Purely a read of existing `availability` data; no new write path.
 
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
 
## 10. Pending Tasks
 
| Task | Status | Notes |
|---|---|---|
| GC review announcement text missing ground data | ✅ Closed — won't do | GC role is approve/return only. Announcement is the captain's responsibility from Captains Corner. Ground/hospital/maps data not required on GC review page. |
| WhatsApp nudge to GC on squad submission | ✅ Done | `handleSubmit()` in `CaptainsCornerGrid.tsx` opens a pre-filled `wa.me` link after successful submit — captain picks the GC group as recipient. |
| WhatsApp nudge to captain on GC approve/return | ✅ Done | `GCReviewClient.tsx` shows a "Notify captain" WhatsApp button after both `approved` and `returned` decisions, with a re-notify option for squads approved in a prior session. |
| Automated WhatsApp announcement | Deferred (Sprint 5) | Requires WhatsApp Business API — current flow is manual copy/share from Captains Corner. |
| CricHeroes post-match stats integration using `bookings.match_id` | Deferred (Sprint 5) | Squad rows linked to booking → `match_id` enables per-player stat attribution. |