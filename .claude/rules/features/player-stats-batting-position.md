# Player Stats — Runs by Batting Position

**Spartans Hub · `/players/[id]/stats` · Added: September 2026**

---

## 1. Overview

A vertical bar chart on the full player stats page (`/players/[id]/stats`,
`PlayerStatsClient.tsx`) showing total runs scored at each batting position
(the real scorecard "No." — `batting_stats.batting_order` in the analytics
DB), rendered directly above the existing "Innings History" table.

Tapping a bar filters Innings History to only the matches where this
player batted at that position — across **all three** stat tabs
(Batting/Bowling/Fielding), not just Batting, since an all-rounder's
bowling/fielding line for that same match is still relevant context.
Tapping the same bar again (or the "Position N ✕" pill next to the Innings
History heading) clears the filter.

This is additive to the page's existing year/ground/format/captain/innings
filter bar (`PlayerStatsClient.tsx`'s top-of-page controls) — the chart
itself is built from whatever match set those filters currently produce,
and re-derives (dropping any active position selection) every time they
change, since a position with matches under one filter combination may not
exist at all under another.

---

## 2. Data — `batting_stats.batting_order`

`batting_order` already existed on the analytics DB's `batting_stats` table
before this feature (it predates the current `analytics-db/migrations/`
set — no migration file adds it) and was already read by
`syncMatchStatsForBooking()` to sort the batting card into real innings
order (`src/lib/matchStatsSync.ts`). Its bowling counterpart,
`bowling_stats.bowling_order`, was added later by
`analytics-db/migrations/004_bowling_order.sql`, specifically because
bowlers previously had no equivalent ordering signal — see that
migration's header comment.

This feature is the first place `batting_order` is surfaced as a **value**
(rather than only used to sort a display) — `getPlayerMatchHistory()`
(`src/lib/playerStats.ts`) now includes it on each match's `batting`
object:

```ts
batting: battedThisMatch ? {
  ...
  battingOrder: bat.batting_order != null ? num(bat.batting_order) : null,
} : null,
```

**Nullable, not defaulted to 0** — `num()` (this file's existing
Number-coercion helper) would silently turn a missing value into `0`, a
false position. A scorecard synced before `batting_order` existed on a
given row, or one never re-synced since, simply has `battingOrder: null`
and its runs are excluded from the chart entirely (see §3) rather than
bucketed under a fake "position 0".

`PlayerMatchHistoryRow['batting']['battingOrder']` (`src/types/index.ts`)
is the new field; `GET /api/players/[id]/match-history`
(`src/app/api/players/[id]/match-history/route.ts`) needed no changes at
all — it already returns `getPlayerMatchHistory()`'s result verbatim, so
the new field reaches the client for free once both the type and the
function producing it were updated.

---

## 3. Chart — `BattingPositionChart` (`PlayerStatsClient.tsx`)

Aggregation (`positionData`, a `useMemo` over the page's `matches` state):
total runs summed per `battingOrder`, across every match currently in
scope — independent of which stat tab is active, since the chart sits
above and feeds all three. Matches with no batting innings, or a batting
innings with `battingOrder: null`, are skipped rather than shown as an
unlabeled bucket. The whole chart section is hidden (not shown empty) when
`positionData` comes back empty.

Each bar is a real `<button>` (`aria-pressed`, keyboard-operable) rather
than a clickable `<div>`, and its runs value is always printed above the
bar rather than shown only on hover/tooltip — this app's UI theme doc
(`ui-theme.md`) states a "daylight-first" principle (primary users are on
mobile, outdoors), so nothing on this page should depend on a hover state
to be legible.

Selected bar: `bg-blue-700` (the same "highlight" blue already used
elsewhere on this page for a big individual innings, `BattingCell`'s
`runs >= 30` case) — reused here as "this is the active filter," not
introduced as a new color. Unselected bars: `bg-gold/50`, the page's
existing accent tone at reduced opacity.

---

## 4. Filtering Innings History — `matchesForPosition` / `tabMatches`

```ts
const matchesForPosition = selectedPosition == null
  ? matches
  : matches.filter(m => m.batting?.battingOrder === selectedPosition)

const tabMatches = matchesForPosition.filter(m => /* existing per-tab predicate */)
```

`selectedPosition` (component state) is applied **before** the existing
per-tab predicate, so a position filter narrows the match set first and
the active stat tab (Batting/Bowling/Fielding) still decides which of
those matches have a row to show and which column renders — exactly the
same two-step shape the page already used for tabs alone, with position
filtering layered in front of it rather than replacing it.

`selectedPosition` resets to `null` inside `fetchScoped()` whenever the
top-of-page filters change (year/ground/format/captain/innings/practice) —
a position that had matches under the old filter set may not exist at all
under the new one, so carrying a stale selection forward could silently
produce an empty, confusing Innings History with no visible reason.

### Innings-count line (added September 2026)

Directly under the Batting/Bowling/Fielding tab row, above the table:

- **Batting tab, only while a position is selected:**
  `{tabMatches.length} of {scoped.battingInnings} innings batted at
  Position {selectedPosition}` — `tabMatches.length` is the innings count
  at that position (every row in it already has `battingOrder ===
  selectedPosition` by construction), `scoped.battingInnings` is the
  player's total batting-innings count under the page's top-of-page
  filters *before* the position narrows it further — the same value
  already shown in the Summary card's "Bat N · Bowl N" caption, so this
  reuses existing state rather than a new aggregate.
- **Bowling tab, always:** `{tabMatches.length} innings bowled` — a plain
  count, not a fraction (bowling has no "position" concept to be a
  fraction of). Reflects whatever match set is currently active, so it
  narrows automatically when a batting position is selected too — showing
  how many of the innings at that position also had a bowling line.
- **Fielding tab:** no count line — not requested, and fielding dismissals
  are already surfaced per-row in the table itself.

Both lines are free reads off state the page already computes
(`tabMatches`, `scoped.battingInnings`) — no new data fetch.

---

## 5. Security (vibe-security)

Read-only — no new write path, no new API route. `battingOrder` is scoped
identically to every other field already returned by
`GET /api/players/[id]/match-history` (any signed-in, non-expelled member,
not IDOR-restricted to self — same posture as the rest of this page, since
match stats aren't sensitive). No new inputs are accepted from the client;
`selectedPosition` is pure client-side UI state that only narrows an
already-fetched, already-authorized array.

---

## 6. File Map

| File | Role |
|---|---|
| `src/components/players/PlayerStatsClient.tsx` | `BattingPositionChart`, `positionData`/`matchesForPosition` derivation, `selectedPosition` state and the "Position N ✕" clear pill |
| `src/lib/playerStats.ts` | `getPlayerMatchHistory()` — now includes `batting.battingOrder` per match |
| `src/types/index.ts` | `PlayerMatchHistoryRow['batting']['battingOrder']` |
| `src/app/api/players/[id]/match-history/route.ts` | Unchanged — already forwards `getPlayerMatchHistory()`'s result verbatim |

---

## 7. Explicitly Out of Scope

- No equivalent chart for bowling order or fielding — only batting position
  was requested.
- No admin/backfill tooling for rows still missing `batting_order` — same
  "re-synced matches pick it up, older ones silently don't" posture this
  app already applies to other analytics-DB columns added after the fact
  (e.g. `bowling_stats.bowling_order`, `features/post-match-scorecard.md`
  §15's stale-`match_stats_cache` writeups).

---

*Maintained by: Spartans CC BLR*
