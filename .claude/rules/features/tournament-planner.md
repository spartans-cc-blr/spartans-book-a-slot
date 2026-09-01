# Tournament Planner — Captain Bandwidth & Pace Dashboard

**Spartans Hub · `/tournament-planner` · Shipped: ~May 2026 · This doc added: August 2026**

---

## 1. Overview

`/tournament-planner` is the internal (Captain/GC/Admin-only — not public)
dashboard for two related jobs: how much game load each captain is
carrying across their tournaments ("Captain Bandwidth"), and how each
individual tournament is pacing against its own organiser ("By
Tournament"). It exists so captains and coordinators can spot an overdue
tournament, an overloaded captain, or a lopsided slot pattern before it
becomes a scheduling fire drill — everything on this page is read-only
analysis over `bookings`/`tournaments`/`squad`/`captains`, with one
narrow exception (`InlineGameCountEditor`, admin-only inline PATCH of
`tournaments.total_league_games`).

This doc was written retroactively — the feature predates it and had
shipped with no `features/*.md` of its own. See
`.claude/rules/knowledge-base.md` for why that's now a gap this repo's
tooling actively prevents going forward.

**Access:** `getServerSession` required; redirect to `/login` if absent,
redirect to `/fixtures` unless `isCaptain || isGC || isAdmin`. No further
role split on read access — a captain, GC member, and admin all see the
same page, personalised only by whether the viewer resolves to a specific
captain (see §4).

**Public counterpart:** `/tournament-planner/share/[tournamentId]` is a
*different*, unauthenticated page (`TournamentShareCard.tsx`) for sharing
one tournament's status with its external organiser — see
`features/organiser-self-service.md` and `features/knockout-day-protection.md`
§5. This doc covers the internal dashboard only. They share
`src/lib/slotTargets.ts`'s `distributeSlotTargets()`/`ALL_SLOTS` (extracted
specifically so the two pages can't silently disagree on slot targets) —
`TournamentPlannerClient.tsx` itself still keeps its own historical
in-file copy of the identical formula (`distributeSlotTargets` /
`ALL_SLOTS` locally defined at the top of the file), untouched since the
share page's extraction was deliberately scoped to not touch already-shipped
code — see `features/organiser-self-service.md` §7 "Slot balance parity."

---

## 2. Route & Data Loading — `src/app/tournament-planner/page.tsx`

Server component, `revalidate = 0` (always fresh — this is an internal
planning tool, staleness would be actively misleading).

Fetches, in order:

1. **All confirmed bookings with a tournament attached** — `bookings` with
   nested `tournament:tournaments!bookings_tournament_id_fkey(...)` →
   nested `captains!tournaments_captain_id_fkey(id, name, player_id)`.
   Filtered post-fetch to exclude:
   - **Informal formats** (`T10`/`T25`, `isInformalFormat()`) — the
     slot-target/bandwidth model (`ALL_SLOTS`) has no entry for these
     rare admin-only quick-game formats, so including them would either
     skew captain bandwidth counts or silently render an empty
     slot-balance section.
   - **Practice-tournament bookings** (`tournament.is_practice`, see
     `features/leaderboard.md` §10) — the planner is a real-tournament
     pace/bandwidth tool; the "Practice games" umbrella tournament has no
     league-game count, no captain workload, and no slot-target model
     that makes sense here. Same "real stats only" posture as the
     leaderboard.
2. **Match results** for any booking with a `match_id`, read from
   `match_stats_cache` (the same read-through cache
   `features/post-match-scorecard.md` documents) — best-effort attach,
   not every past game has a synced scorecard yet.
3. **Announced squad rows**, capped at the first 100 booking IDs
   (`bookingIds.slice(0, 100)` — the same uncapped-`.in()` risk class as
   `pending-backlog.md` S-4, mitigated the same way here). Drives two
   derived maps:
   - `tournamentPlayersMap` — players who have actually played
     (`game_date < today` only) for each tournament, deduped and sorted,
     feeding the Player Stats table (§6).
   - `bookingCaptainMap` — the match-specific captain (`squad.is_captain`,
     **not** `players.is_captain` — see the permanent-vs-match-specific
     distinction documented in `features/squad-selection.md` §3) per
     booking, used on both the Upcoming and Past Matches rows.
4. **Per-tournament stats board** — for every tournament with at least one
   player in `tournamentPlayersMap`, calls
   `getLeaderboard({ tournamentId })` (`src/lib/playerStats.ts`, see
   `features/leaderboard.md`) in parallel via `Promise.all`. Keyed by real
   Hub `player_id` (already reconciled — see
   `features/player-identity-resolution.md`), scoped purely to that one
   tournament's own synced matches — **never** career-wide stats. A player
   listed in `tournamentPlayersMap` with no reconciled match yet for this
   tournament simply has no entry in `tournamentStatsMap[tid]`, and the UI
   renders "No stats synced" rather than a misleading zero row.
5. **Admin-only knockout awareness** (`isAdmin` only, since nobody else
   can see or act on it) — existing `bookings` rows carrying
   `block_reason = KNOCKOUT_HOLD_REASON`, keyed by `tournament_id`. Purely
   a read/display lookup; creating a knockout hold happens exclusively on
   `/admin/soft-blocks/new` — see `features/knockout-day-protection.md`.
6. **Active captains** (`captains` where `active = true`).
7. **Viewer's own captain identity**, resolved via `captains.player_id`
   matching `session.user.playerId` — deliberately **not** name matching.
   Even once resolved, the personalised "your bandwidth" view (§4) only
   activates if that captain has at least one *upcoming* booking, via
   either the tournament's own default `captain_id` or a per-booking
   override (`bookings.captain_id`, migration `066_bookings_ground_captain.sql`
   — see §7). A captain with only past/completed tournament involvement
   doesn't get the personalised view.

`announcedBookingIds` is currently always passed down as `[]` — the
`announcedSet` prop threading exists in `TournamentPlannerClient.tsx` but
nothing in the component actually branches on squad-announced status
today; it's unused scaffolding, not a bug.

---

### 2.1 Zero-Booking Tournament Visibility (added August 2026)

Before this, the whole page was **entirely booking-driven** —
`TournamentPlannerClient.tsx`'s `tournamentMap` is built purely by
grouping the `bookings` fetched in §2 step 1, and nothing on this page
ever queried the `tournaments` table directly on its own. A brand-new
tournament with zero confirmed bookings therefore had nothing to group
and never appeared anywhere on the page — not even under "Upcoming" —
which is exactly the moment a coordinator most wants to hand its share
link (`TournamentShareButton`, organiser self-service — see
`features/organiser-self-service.md`) to the organiser.

**Fix:** `page.tsx` additionally fetches every active, non-practice
tournament and computes `emptyTournaments` — tournaments whose id isn't
already present among the confirmed bookings — and passes it down as a
new prop. `TournamentPlannerClient.tsx`'s `tournamentMap` merges these in
as zero-game entries (`{ tournament, games: [] }`) after the
booking-derived pass, only when a tournament isn't already represented.
Every downstream computation (`classifiedTournaments`'s
`isUpcoming`/`isOngoing`/`isCompleted`, `paceSignal()`, `computeGapStats()`,
`MatchTabsSection`, slot targets) already had null/empty-array guards for
a tournament with no games, so no changes were needed there — a
zero-game tournament simply classifies as `isUpcoming` (`completedGames.length
=== 0`) and renders with an `unbooked` count equal to its
`total_league_games`.

**Incident (same month) — the zero-booking check itself used the wrong
booking list, resurrecting already-finished tournaments as "Upcoming".**
The set of "tournaments that already have a confirmed booking" was first
computed from the *informal-format-filtered* `bookings` array from §2
step 1 — the same array that deliberately excludes T10/T25 games. A
tournament whose **only** confirmed bookings are T10/T25 (e.g.
"Independence Day Cup 2026" — two confirmed T10 games, both already
played and finished; "Mario Turner Daybreak 3 - Weekday" — four
confirmed T10/T25 bookings, same issue) therefore had zero entries in
that filtered array, looked indistinguishable from a genuinely
zero-booking tournament, and was wrongly resurrected as a fresh
"Upcoming" entry with a phantom unbooked-games count — even though both
are long finished and, by this page's own long-standing design, T10/T25
tournaments are supposed to be excluded from Tournament Planner
entirely (§2 step 1), not shown as upcoming.

**Fixed** by deriving the "already has a confirmed booking" set from
`rawBookings` (every confirmed booking joined to a tournament, any
format — the pre-filter array from §2 step 1) instead of the
informal-filtered `bookings`. This correctly restores the pre-existing
behaviour: a tournament with real confirmed games of any format —
including T10/T25-only ones — is excluded from `emptyTournaments` and so
never appears on this page at all, exactly as it didn't before §2.1
existed. Only a tournament with *zero* confirmed bookings of *any*
format now gets the zero-game treatment.

---

## 3. Slot Model — `ALL_SLOTS` / `distributeSlotTargets()`

Both the in-file copy (`TournamentPlannerClient.tsx`) and the extracted
shared copy (`src/lib/slotTargets.ts`, used by the public share page and
the organiser self-service suggestion engine) define the same 8 slot
buckets:

| Day | Time | Valid formats |
|---|---|---|
| Sat/Sun | 07:30 | T20 / T30 |
| Sat/Sun | 10:30 | T20 only |
| Sat/Sun | 12:30 | T30 only |
| Sat/Sun | 14:30 | T20 only |

`distributeSlotTargets(validKeys, totalLeague)` splits a tournament's
`total_league_games` evenly across only the slot keys valid for that
tournament's actual format mix (`activeFormats`, derived from the
formats its own booked games actually use — falling back to
`tournaments.intended_formats` if set, else both T20 and T30, if the
tournament has no games booked yet — see §3.1). The remainder from
integer division goes to the earliest slots in display order (Sat 07:30 →
Sun 14:30) — an arbitrary but stable tie-break, not a scheduling
preference. This target feeds the `count/target` display in both
`SlotBalanceByDay` (this page) and the public share card's own slot
balance section.

---

## 3.1 `tournaments.intended_formats` — declaring a format before the first booking (added September 2026)

**The bug this closes:** `activeFormats` (§3) is derived purely from the
formats a tournament's own confirmed bookings already use. Before this
column existed, a tournament with **zero** bookings had no way to declare
its format at all, so every slot-distribution/suggestion engine fell back
to treating it as valid for **both** T20 and T30 — which silently pulled
the T30-only 12:30 slot into a brand-new T20-only tournament's slot
targets and (for a self-service tournament, see
`features/organiser-self-service.md`) its public reserve suggestions,
before its first game was ever booked. Reported and root-caused live: a
tournament named "Thunder 5" (a T20 tournament by name and intent) with
`total_league_games = 9` and zero confirmed bookings was showing a
12:30 target of 1 game on both Sat and Sun — confirmed by querying the
live DB directly (`select * from bookings where tournament_id = ...`
returned zero rows).

**The fix:** `tournaments.intended_formats text[]` (migration
`069_tournament_intended_formats.sql`, `CHECK (intended_formats IS NULL OR
intended_formats <@ ARRAY['T20','T30'])`) lets an admin declare a
tournament's format(s) up front, from the "Intended Format" T20/T30
toggle buttons on `/admin/tournaments` (both the Add form and the Edit
form). `resolveActiveFormats(bookedFormats, intendedFormats)`
(`src/lib/slotTargets.ts`) is the shared resolution order, used everywhere
`activeFormats` is computed:

1. The formats this tournament's own confirmed bookings actually use —
   ground truth once games exist, exactly as before this change.
2. `tournaments.intended_formats`, when set and no bookings exist yet.
3. Both T20 and T30 — the last-resort fallback for a genuinely
   undeclared, bookingless tournament (unchanged prior behaviour).

**Once a real booking exists, `intended_formats` is ignored** — step 1
always wins, so a stale or wrong declaration can never override what the
tournament is actually playing.

**Where it's wired in** (every site that used to compute the
both-formats-fallback locally): `src/lib/suggestedSlots.ts`'s
`getSuggestedOpenDates()` and `getSuggestedSlotDates()` (both now select
`intended_formats` on their `tournaments` fetch and call
`resolveActiveFormats()`), `TournamentPlannerClient.tsx`'s per-tournament
`activeFormats` calc (fed via `page.tsx`'s `rawBookings` tournament join
and the `emptyTournaments` fetch — the exact path a zero-booking
tournament like Thunder 5 renders through, see §2.1), and
`TournamentShareCard.tsx`'s own `activeFormats` calc (fed via the share
page's `tournaments` select). `TournamentPlannerClient.tsx` and
`TournamentShareCard.tsx` keep their historical independent inline
fallback expressions (consistent with §1's note on their standalone
`ALL_SLOTS`/`distributeSlotTargets` copies) rather than importing
`resolveActiveFormats` — only `suggestedSlots.ts`, which already imports
from `slotTargets.ts`, uses the shared helper directly.

**Data fix applied the same session:** `Mario Sixers Thunder 5`
(`dd318e2b-b144-4859-b767-b1f27b8fcda1`) had `intended_formats` set to
`['T20']` directly via Supabase MCP, closing the 12:30 slot-target leak
for that tournament immediately (no code deploy needed for an
already-applied migration + a plain data update).

---

## 4. Captain Bandwidth — `BandwidthSection`

Renders one card per active captain (or, for a resolved captain viewer,
their own card first under "Your bandwidth," then every other captain
under "Other captains" — visually de-emphasised via `opacity-60`).

**Scoped to *ongoing* tournaments only** — a tournament is included in a
captain's card only if it still has something outstanding (`outstanding >
0`, an upcoming booking) or unbooked (`unbooked > 0`, fewer bookings than
`total_league_games`). A captain's fully-wrapped-up tournaments don't
inflate today's workload picture; this scoping is called out explicitly
in the card's own UI caption ("Ongoing tournaments only") so it isn't a
silent filter.

**Per-card contents:**
- **Bandwidth-available badge** — shown when `total <= 4 && unbooked <=
  1`, a green pill flagging the captain as able to take on a new
  tournament.
- **Upcoming / Unbooked stat tiles** — replaced an earlier 3-segment
  stacked bar (see §8). Past matches is relegated to the count line above
  since it's read-only history, not forward planning.
- **Schedule timeline** — today through the captain's furthest-out already
  booked game, across all their ongoing tournaments, so gaps between
  games read as "free" at a glance. `staggerRows()` alternates a 0/1 row
  for date labels whose anchor points land within 10% of each other
  horizontally, so close dates (e.g. two games a day apart) don't
  visually collide. Additive to — not a replacement for — the per-slot
  bar further down; the timeline answers "when are they free," the bar
  answers "how much load, by slot."
- **By-tournament breakdown** — one row per ongoing tournament this
  captain leads, each clickable (`onViewTournament`) to scroll to and
  force-expand the matching `TournamentBlock` further down the page (see
  §5's `forceOpenToken`).
- **Overall slot balance** — a per-slot bar chart (not target-relative
  here, unlike §5's per-tournament version — this is `count` scaled
  against this captain's own `maxSlot`, not a `count/target` ratio) with
  an imbalance nudge (`↗ Heavy on <slot>`) when one slot holds more than
  half this captain's total bookings across 3+ games.

---

## 5. Per-Tournament Block — `TournamentBlock`

One collapsible card per tournament (`sortedTournaments`, see §6 for
sort/classification), each independently expandable. Collapsed state
shows a compact one-row bar (emerald = past, amber = upcoming, faded grey
= unbooked) as a glance-only summary.

**Header** — tournament name (hyperlinked to
`cricheroes_points_table_url` when set, same pattern as
`FixturesCard.tsx` — see `architecture.md` §8.5), a format-mix pill, the
pace-signal pill (§5.2), and — admin/GC only — a
`TournamentShareButton` (native share sheet or clipboard-copy of the
public share-page URL; `e.stopPropagation()` keeps it from also toggling
the header's own expand/collapse).

**`forceOpenToken`** — bumped by a Bandwidth-card "view" click (§4) even
on a repeat click of the same tournament, so a block the viewer had
manually re-collapsed still reopens; `handleViewTournament()` in the root
client component also force-enables whichever Show-filter bucket (§6)
that tournament belongs to, so "view" never dead-ends on a hidden block.

### 5.1 Admin-only knockout panels

Two independent, read-only, `isAdmin`-gated panels inside an expanded
block (never inside the collapsed summary):
- **Existing hold** — if `knockoutHoldsByTournament[tournament.id]` is
  set, an amber banner naming the date/slot already reserved.
- **Qualification nudge** — shown only when no hold exists yet, there are
  still unbooked league games, and this tournament has won at least half
  its completed league games so far (`wins >= Math.ceil(totalLeague /
  2)`, matched the same `.toLowerCase().includes('won')` way
  `ResultBadge` does). Purely informational — never gates or creates
  anything; the actual knockout-day hold is still created exclusively on
  `/admin/soft-blocks/new`. See `features/knockout-day-protection.md` §5
  for the full picture (this nudge, plus the note that this page's
  Suggested-Slots panel documented there as a historical comparison point
  was later removed entirely — see §8 below).

### 5.2 Pace signal — `paceSignal()`

A pill computed from the tournament's own average gap between games
(`avgGapWeeks()`) and its unbooked count:

| Condition | Label |
|---|---|
| No gap data (< 2 games played) | "Not enough data" |
| `unbooked <= 1` | "Good pace" (regardless of gap — nearly done) |
| `avgGap <= 1` week | "Ask to slow down" |
| Last game > 21 days ago and `unbooked >= 2` | "Nudge to schedule" |
| Otherwise | "Good pace" |

Feeds both the block header's pill and `classifiedTournaments`' sort
priority (§6) — "Nudge to schedule" tournaments surface first, then "Ask
to slow down," then everything else.

### 5.3 Matches — `MatchTabsSection`

Three tabs — Upcoming / Past Matches / Unbooked — mirroring the naming
already used on `/fixtures`. Defaults to whichever of Upcoming/Unbooked is
actionable (Upcoming first, else Unbooked, else Past) rather than always
opening on Past, which is read-only and the least useful default view.

- **Past Matches rows** link into the Hub's own `/matches/history/[id]`
  (not out to CricHeroes) — keeps captains self-reliant on the Hub rather
  than round-tripping through an external site.
- **Upcoming rows** link out to `cricheroes_url` when set, else render
  non-interactive.
- Both show a per-game **gap pill** (weeks since the previous game in this
  tournament, colour-coded — red ≤1 week, amber ≥3 weeks, green
  otherwise) and the match-specific captain from `bookingCaptainMap`.
- **Unbooked tab** is a static count, no per-game detail — it explicitly
  points the viewer at the tournament's own public share page for
  suggested open dates/slots, rather than duplicating the suggestion
  engine inline (see §8 — an earlier admin-facing Suggested-Slots panel
  that *did* duplicate this was removed).

### 5.4 Pace insight card

Below the tabs: avg/fastest/slowest gap figures (only rendered once ≥2
games have been played), the organiser's name if set, and a one-line
verdict — "evenly paced" if `slowestGap - fastestGap <= 2` weeks, else a
prompt to ask the organiser to smooth scheduling. The old inline WhatsApp
"ping about pace" nudge that used to live here was dropped in favour of
the more actionable suggested-slots nudge that now lives on the public
share page — see `features/organiser-self-service.md`.

### 5.5 Game timeline — `GameTimelineCard`

A second, denser visual timeline (distinct from §4's captain-level one) —
every played/scheduled game in this one tournament plotted along a single
axis, dot-coloured per gap-to-previous-game (red ≤1 week, amber >
average+2 weeks, green otherwise), with a collapsible legend. Only renders
once the tournament has ≥2 games.

### 5.6 Slot balance — `SlotBalanceByDay`

Grouped by Sat/Sun, one row per valid slot for this tournament's format
mix, showing `count/target` (from `distributeSlotTargets()`, §3) with a
progress bar (emerald once `count >= target`, amber otherwise) and an
imbalance nudge when one slot holds more than half the tournament's total
booked games across 3+ games.

### 5.7 Player Stats — collapsible table

Sourced from `tournamentPlayersMap`/`tournamentStatsMap` (§2, step 4) —
players who actually appeared in an *announced* squad for a *past*
booking in this tournament, joined to their **this-tournament-only**
aggregated stats. Trimmed to five headline columns (Matches / Runs /
Wickets / Dismissals / MVP — `STAT_COLUMNS`) rather than Captains'
Corner's fuller `ContextStatsTable` (Avg/SR/Econ included) — this board is
meant to stay glanceable, not replace the per-player Form panel captains
already have in Captains' Corner. Sortable by any column
(`handleStatsSort`), defaulting to MVP descending since that's the one
figure meant to rank players against each other; a player with no
reconciled stats yet for this tournament always sorts to the bottom
regardless of direction ("No stats synced" isn't a value on any column's
scale, so it must never jump to the top under a descending sort).

---

## 6. Classification & Sorting — `classifiedTournaments`

Every tournament in `tournamentMap` is classified, independent of the
Show-filter toggles below (so filter cards can display a true count per
bucket regardless of which buckets are currently visible):

| Bucket | Condition |
|---|---|
| `isUpcoming` | Zero games played yet (`completedGames.length === 0`) |
| `isCompleted` | `completedGames.length >= totalLeague` **and** nothing scheduled |
| `isOngoing` | Neither of the above |

Sorted by `priorityRank` (0 = "Nudge to schedule," 1 = "Ask to slow
down," 2 = everything else — see §5.2), then by game count descending as
a tiebreak. The **Show: Upcoming / Ongoing / Completed** filter row
(stat-card-styled toggle buttons, not plain checkboxes) defaults to
Upcoming and Ongoing visible, Completed hidden — a club running many
tournaments doesn't want its already-finished ones cluttering the default
view.

**Captain-view split** — when the viewer resolves to an active captain
(§2, step 7), `sortedTournaments` is further split into "Your
tournaments" (rendered first, un-collapsed section header) and "Other
tournaments" — both still governed by the same Show-filter state.

---

## 7. Ground/Captain Per-Booking Override — migration 066

`bookings` gained nullable `ground_id`/`captain_id` FKs (migration
`066_bookings_ground_captain.sql`), each independently overridable per
game rather than always live-joining through `tournaments.ground_id`/
`tournaments.captain_id`. This exists primarily for the "Practice games"
umbrella tournament (`is_practice`, `features/leaderboard.md` §10), which
plays a different ground with different captains every time and has no
single sensible tournament-level default — but it applies to any booking.
Each booking snapshots its own ground/captain at creation time rather than
always reflecting the tournament's *current* values, so a tournament's
default changing later never silently rewrites history for games already
booked or played.

**Where this page reads it:** step 7 in §2 checks *both*
`tournament.captain_id` and the per-booking `bookings.captain_id`
override when deciding whether the viewer has an active upcoming booking
(`hasActiveBooking`) — a captain assigned only via a per-booking override,
never as the tournament's own default captain, still gets the
personalised bandwidth view. `bookingCaptainMap` (§2 step 3) is unrelated
to this column — it comes from `squad.is_captain` (the match-specific
designation), not `bookings.captain_id` (the booking-level default/override
of *who leads this tournament*, independent of whether that person is
even in the squad).

---

## 8. Removed — Internal "Suggested Slots" Panel

An earlier version of this page had its own GC/Admin-only
`SuggestedSlotsPanel`, backed by
`GET /api/tournaments/[id]/suggested-slots` and calling the same
`getSuggestedOpenDates()` the public share page's suggestions use. Since
both surfaces called the identical underlying function, they could never
actually disagree — having suggested dates duplicated in two places was
judged unnecessary. Removed August 2026 alongside the
`features/player-future-availability.md` work; the Unbooked tab (§5.3)
now just points admins at the tournament's own public share page instead.
See `features/player-future-availability.md` §7 for the removal detail
and `features/knockout-day-protection.md` §5, which references this
panel's `isAdmin || isGC` gate as a historical comparison point for its
own (stricter, `isAdmin`-only) knockout-awareness gating.

---

## 9. Security (vibe-security)

| Check | Status |
|---|---|
| Page requires `isCaptain \|\| isGC \|\| isAdmin`, server-side, before any data fetch | ✅ |
| Viewer's captain identity resolved via `captains.player_id` FK, never by name matching | ✅ |
| `InlineGameCountEditor`'s PATCH is admin-gated client-side only for *visibility* — the underlying `PATCH /api/tournaments` route itself re-checks `isAdmin` server-side (see `architecture.md` §5's Admin APIs table) | ✅ |
| Admin-only knockout panels — data fetched server-side only when `user?.isAdmin`, never sent to a non-admin viewer at all | ✅ |
| Squad/booking IDs capped at 100 for the `.in()` query (§2 step 3) — same S-4-class uncapped-query risk mitigated | ✅ |
| Per-tournament stats scoped by `tournamentId` server-side in `getLeaderboard()` — never career-wide data leaking into a tournament-scoped view | ✅ |
| No write path exists on this page beyond the single admin-only inline game-count edit | ✅ |
| `emptyTournaments` (§2.1) only ever adds zero-game display entries, never a write path or a widened data grant — same `active`/`is_practice` scoping as everything else on this page | ✅ |
| `tournaments.intended_formats` (§3.1) is admin-only write (`/admin/tournaments`, `isAdmin`-gated same as every other tournament field); `POST`/`PATCH /api/tournaments` accept it exactly like every other admin-only tournament field, no new access surface | ✅ |
| `intended_formats` never widens a booking's own validation — R1–R8 (`validateBooking()`) still validate every real slot/format independently; this column only ever feeds the *display/suggestion* fallback (§3.1), never the booking-rules engine itself | ✅ |

---

## 10. File Map

| File | Role |
|---|---|
| `src/app/tournament-planner/page.tsx` | Server component — role guard, all data fetching described in §2, `emptyTournaments` computation (§2.1) |
| `src/components/tournament-planner/TournamentPlannerClient.tsx` | Root client component — `BandwidthSection`, `TournamentBlock`, `MatchTabsSection`, `SlotBalanceByDay`, `GameTimelineCard`, `InlineGameCountEditor`; owns `classifiedTournaments`/Show-filter state and `expandRequest` (view-to-scroll-and-expand); `tournamentMap` merges `emptyTournaments` in as zero-game entries (§2.1) |
| `src/components/tournament-planner/TournamentShareButton.tsx` | Native-share-or-clipboard-copy button for the public share page's URL — used both here (admin/GC only) and on `TournamentShareCard.tsx` |
| `src/lib/slotTargets.ts` | Shared `distributeSlotTargets()` / `ALL_SLOTS` / `SlotKey` / `resolveActiveFormats()` (§3.1) — the extracted copy used by the public share page and the organiser self-service suggestion engine; this page keeps its own historical in-file duplicate of `ALL_SLOTS`/`distributeSlotTargets` (§1) but not of `resolveActiveFormats`, which it inlines instead |
| `src/lib/playerStats.ts` | `getLeaderboard({ tournamentId })` — this page's source for §5.7's per-tournament Player Stats table |
| `supabase/migrations/066_bookings_ground_captain.sql` | Per-booking `ground_id`/`captain_id` override columns (§7) |
| `supabase/migrations/069_tournament_intended_formats.sql` | `tournaments.intended_formats text[]` — admin-declared format(s) for a tournament with zero bookings yet (§3.1) |
| `src/app/admin/tournaments/page.tsx` | Admin CRUD for tournaments, including the "Intended Format" T20/T30 toggle (§3.1) |
| `src/types/index.ts` | `isInformalFormat()`, `INFORMAL_FORMATS`, `KNOCKOUT_HOLD_REASON` |
| `src/app/tournament-planner/share/[tournamentId]/page.tsx` + `src/components/tournament-planner/TournamentShareCard.tsx` | The separate public/unauthenticated counterpart — see `features/organiser-self-service.md` |

---

## 11. Explicitly Out of Scope

- No write path beyond `total_league_games` inline admin edit — everything
  else on this page (pace signals, slot balance, bandwidth) is derived,
  read-only analysis.
- No notion of "assign a captain to an unbooked game" here — that's a
  booking-creation-time decision (`/admin/bookings/new`), not something
  this dashboard mutates.
- No historical trend (e.g. "this captain's load over the last 3 months")
  — bandwidth and pace are always computed against *today*, not a time
  series.
- `announcedBookingIds`/`announcedSet` — threaded through as props but not
  currently used to branch any rendering; not a bug, just unused
  scaffolding from an earlier iteration.

---

*Maintained by: Spartans CC BLR*
