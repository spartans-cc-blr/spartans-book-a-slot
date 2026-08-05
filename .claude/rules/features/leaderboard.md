# Leaderboard — "Yours Statistically" Honor Board

**Spartans Hub · `/leaderboard` · Added: ~June–July 2026 · This doc added: August 2026**

---

## 1. Overview

`/leaderboard` (page title "Yours Statistically") is the club's stats hub —
individual milestone cards, a month-by-month view, and sortable detailed
tables, all driven off the separate analytics Supabase project (see
`features/post-match-scorecard.md` and `features/player-identity-resolution.md`
for how scorecard data gets there and gets resolved to a Hub `player_id`).

**Access:** any signed-in, non-expelled member — `getServerSession` required,
redirect to `/login` if absent, redirect to `/` if `playerStatus === 'expelled'`.
No role gate beyond that; nothing on this page is captain/GC/admin-only.
Entirely read-only — no write path exists anywhere in this feature.

This doc was written retroactively (the feature predates it) after a
session that fixed a real production bug and added two new cards — see
§5 for what's new and §8 for the incident. Sections on parts of the page
untouched by that session (Detailed tables, the filter bar's own internals)
are kept deliberately brief.

---

## 2. Nav Structure — `LeaderboardFilters.tsx`

Two top-level branches, plus sub-tabs:

```
Honor Board
  ├─ Overall   → LeaderboardMilestones.tsx  (career/year milestone cards)
  └─ Monthly   → LeaderboardMonthly.tsx     (month-scoped cards + innings lists)
Detailed
  ├─ MVP
  ├─ Bat
  ├─ Bowl
  └─ Field     → LeaderboardTable.tsx (sortable columns, one tab per category)
```

**Year filter** — shown for Detailed and for Honor Board → Overall (both are
genuinely year-scoped). Options: current year, previous two years, or "All
time". Disabled (not hidden) once a Tournament is picked, since narrowing an
already-specific tournament down to one year on top would usually produce
an empty result.

**Tournament / Ground filters** — apply to Detailed and to Honor Board →
Overall. They do **not** apply to Monthly, which is forced back to "all"
tournament/ground the moment it's selected (its own month stepper is the
timeframe control, and combining two scoping axes at once wasn't wanted).

**Format (T20/T30) checkboxes** — apply everywhere. Both checked (or the
URL param absent) means no restriction; unchecking down to zero snaps back
to both checked rather than showing an empty result.

**Month stepper** — Monthly only, mirrors `MatchHistoryClient.tsx`'s month
navigator on `/matches/history`. Clamped so a hand-edited URL can't request
a future month.

---

## 3. Data Layer — `src/lib/playerStats.ts`

Server-only (reads `ANALYTICS_SUPABASE_KEY` directly — never import into a
`'use client'` file). Two entry points feed `/leaderboard`:

### `getLeaderboard(filters)` → `LeaderboardRow[]`

One row per player who appears in `batting_stats`/`bowling_stats`/
`fielding_stats`/`team_list` within the resolved match scope (via
`getScopedMatchIds()`, shared with `getPlayerStats()`/`getPlayerMatchHistory()`
for the individual player stats page). Aggregates `PlayerStatsTotals`
(runs, wickets, average, strike rate, economy, MVP points, catches/run
outs/stumpings, etc.) plus `centuries`/`halfCenturies` counts. Rows whose
`player_id` never reconciled to a live Hub player are dropped (see
`features/player-identity-resolution.md`), same guard as everywhere else
that reads this analytics data.

### `getPerformances(filters)` → `{ centuries, halfCenturies, fiveWicketHauls, threeWicketHauls }`

Every individual 50+ batting innings and 3+ wicket bowling innings within
scope — single-match lines (`MonthlyInnings`/`MonthlyBowlingInnings`,
`src/types/index.ts`), not aggregated, so a player who hit two centuries
shows up twice. Sorted best-first, most-recent-date tiebreak. Originally
built for the Monthly view only (scoped by `month`) as
`getMonthlyPerformances(month)`; generalized in this session to accept the
same `{ year, month, tournamentId, groundId, formats }` shape
`getLeaderboard()` takes, so Overall's year-scoped Centuries/5-Wicket Hauls
bands (§5) could reuse it without a second parallel implementation.

---

## 4. Milestone Cards — `LeaderboardMilestones.tsx` (Overall) / `LeaderboardMonthly.tsx` (Monthly)

Both render the same dark-gradient, gold-top-bar card treatment (matches
`FixturesCard.tsx`). Each card is "whoever has the best value among
players who qualify":

| Card | Metric | Icon |
|---|---|---|
| Leading MVP | `stats.mvpPoints`, highest | 🏆 |
| Leading Run Scorer | `stats.runs`, highest | 🏏 |
| Leading Wicket Taker | `stats.wickets`, highest | 🎯 |
| Most Dismissals | `catches + runOuts + stumpings`, highest | 🧤 |
| Most 100s | `centuries`, highest (Overall: gated, see §5) | 💯 |
| Most 50s | `halfCenturies`, highest | 5️⃣0️⃣ |
| Best Average | `stats.battingAverage`, highest | 📊 |
| Highest S/R | `stats.strikeRate`, highest | ⚡ |
| Best Economy | `stats.economy`, **lowest**, min `MIN_BALLS_FOR_ECONOMY` (30) balls bowled | 🛡️ |

**Highest S/R minimum-balls gate (added August 2026):**
`LeaderboardMonthly.tsx`'s `bestSR` requires at least
`MIN_BALLS_FOR_STRIKE_RATE` (10) balls faced — same motivation as Best
Economy's `MIN_BALLS_FOR_ECONOMY` gate, a one- or two-ball innings
shouldn't be able to win "highest strike rate" for the month.
`LeaderboardMilestones.tsx`'s `bestSR` (Overall tab) carries its own,
higher floor — `MIN_BALLS_FOR_STRIKE_RATE_OVERALL` (30), matching Best
Economy's own club-wide bar — since even a year-long or all-time sample
can still be dominated by one short, unrepresentative innings without one.

### Qualification — `minGamesThreshold(year, scoped)`

YTD ratchet: 0 games required through March, 3 from April, 6 from July, 9
from October, full-year bar of 12 for a completed past season or "All
Time". A Tournament/Ground filter (`scoped = true`) drops the bar to a flat
1 game — a single tournament is too short a season for the club-wide
ratchet to make sense.

### Tie handling — `bestByAll()` (`src/lib/leaderboardMilestones.ts`)

**One card per player tied for the best value**, not one arbitrary
"winner". A plain single-winner reduce (`v > bestVal`, keep first match)
silently picks whichever tied player happens to come first in the
analytics-DB query's row order — an accident of the query, not a real
ranking. This was a real bug: three players tied at exactly 1 century each
for 2026, and the card showed only one of them ("Gunasagar") as if he had
a clear lead. `bestByAll()` collects every row tied for the max/min value;
`toMilestones()` maps each into its own card. `bestBy()` (single-winner,
first tied row) is kept only for `LeaderboardMonthly.tsx`'s cards — ties
are rarer on a single month and weren't part of this fix.

---

## 5. Year-Scoped Collapsible Bands (Overall tab only) — added August 2026

Centuries and 5-wicket hauls are rare enough club-wide that even the
tie-inclusive card treatment above was still misleading much of the time —
players tied at exactly 1 century each aren't really competing for a
"most" title. For a **specific year** (not "All Time" — no per-year
fallback list exists there, so it keeps the plain tied-cards behaviour),
Overall instead:

- **"Most 100s" card only appears once a player has genuinely scored more
  than one century that year** — `centuryCardRows` in
  `LeaderboardMilestones.tsx` checks `mostCenturies[0].centuries > 1`
  before including it in the cards array at all. Below that bar, the
  Centuries list (next bullet) is the only place centuries show up.
- **New "Centuries" and "5-Wicket Hauls" collapsible bands** render
  underneath the cards — collapsed by default (`CollapsibleInningsPanel`),
  tap to expand, one row per individual century/5-for for that year
  (sourced from `getPerformances()`, §3). Each row is a whole-row click
  target to `/matches/history/[bookingId]` (`ClickableRow` /
  `BattingInningsRow` / `BowlingInningsRow`, extracted into
  `src/components/leaderboard/InningsRow.tsx` so both this and
  `LeaderboardMonthly.tsx`'s always-open equivalent panels share the exact
  same row component instead of two copies).
- **"Most 50s" is unaffected** — half-centuries are common enough that the
  tied-cards treatment from §4 stays as the only treatment; no collapsible
  list, no `>1` gate.

`page.tsx` only fetches `getPerformances(overallFilters)` when
`category === 'overall' && year !== 'all'` — `yearlyPerformances`, passed
down as `centuries`/`fiveWicketHauls` props (`null` when not applicable,
which the component treats as "don't show the bands", not "zero this
year").

---

## 6. "Most Dismissals" Card — added August 2026

Fielding dismissals (`catches + runOuts + stumpings`, already aggregated
into `PlayerStatsTotals` — no new data fetch was needed) get their own
card, gated by a **prorated bar** rather than the flat games-count
threshold alone — `minDismissalsThreshold(year, scoped)`:

| Scope | Bar |
|---|---|
| Tournament/Ground-scoped | 1 dismissal (token floor — same reasoning as `minGamesThreshold`'s scoped case) |
| Current year, in progress | 12 × completed calendar quarters (0 through Mar, 12 from Apr, 24 from Jul, 36 from Oct) |
| Completed past year, or "All Time" | 50 |

50 dismissals across a full season was agreed as "a genuinely good year in
the field"; prorating to ~12/quarter (50 ÷ 4 ≈ 12.5, rounded down to keep
the bar honest rather than generous) avoids crowning whoever has the most
catches a few weeks into a new season off a trivially small sample — same
motivation as the century gate in §5, just applied unconditionally (every
year, including "All Time") since there's no collapsible-list fallback for
dismissals to defer to. `mostDismissals` itself also excludes anyone with
zero dismissals from the tie pool (mirrors `mostCenturies`' `> 0` guard),
so an early-season "everyone's tied at 0" state never produces a card.

---

## 7. Architecture — `src/lib/leaderboardMilestones.ts`

Plain module, deliberately **not** `'use client'` and **not** importing
React/JSX: `MIN_BALLS_FOR_ECONOMY`, `minGamesThreshold()`,
`minDismissalsThreshold()`, `bestBy()`/`bestByAll()`, `totalDismissals()`.

**Why it's split out of `LeaderboardMilestones.tsx`:** that component needs
`'use client'` for the collapsible bands' `useState` (§5), but
`src/lib/leaderboardGlossary.ts` — which builds the "What do these numbers
mean?" copy at the bottom of the page and runs **server-side** inside
`src/app/leaderboard/page.tsx` (a Server Component) — needs to call
`minGamesThreshold()`/`minDismissalsThreshold()`/`MIN_BALLS_FOR_ECONOMY` to
quote the real thresholds currently in effect. Importing plain utility
functions out of a `'use client'` module into server-only code crosses the
RSC client boundary; see §8 — this is exactly what broke production.

`LeaderboardMonthly.tsx` (itself `'use client'`) also imports `bestBy`/
`MIN_BALLS_FOR_ECONOMY` from here rather than from
`LeaderboardMilestones.tsx` directly, for the same reason in spirit even
though client→client would have technically still worked — one shared
source of truth, no ambiguity about which module is safe to import from
where.

**Rule of thumb for future edits to this feature:** if a function needs to
be called from `src/app/leaderboard/page.tsx` or `src/lib/leaderboardGlossary.ts`
(both server-only), it must live in `src/lib/leaderboardMilestones.ts`, not
inside `LeaderboardMilestones.tsx` itself.

---

## 8. Incident — 1 Aug 2026, production crash on `/leaderboard`

**Symptom:** `/leaderboard` returned Next.js's generic
"Application error: a server-side exception has occurred" for every
visitor, immediately after a same-day push to `main` that added the
collapsible Centuries/5-Wicket Hauls bands (§5).

**Root cause:** `LeaderboardMilestones.tsx` had just gained `'use client'`
(needed for the new collapsible panels' `useState`). At that point,
`src/lib/leaderboardGlossary.ts`'s `import { minGamesThreshold, MIN_BALLS_FOR_ECONOMY }
from '@/components/leaderboard/LeaderboardMilestones'` — pre-existing,
unchanged in that commit — started reaching into a client module from
server-only code. `leaderboardGlossary.ts` is called synchronously inside
`src/app/leaderboard/page.tsx` (a Server Component) to build
`buildOverallGlossary()`'s copy. Calling a plain function pulled in across
the RSC client boundary this way throws at runtime.

**Fix:** extracted every pure, non-JSX export (`MIN_BALLS_FOR_ECONOMY`,
`minGamesThreshold`, `minDismissalsThreshold`, `bestBy`/`bestByAll`,
`totalDismissals`) into the new `src/lib/leaderboardMilestones.ts` (§7) —
no `'use client'`, no React import — and repointed every non-component
consumer at it. `LeaderboardMilestones.tsx` now only exports the actual
React component, which is the correct way for a Server Component
(`page.tsx`) to consume it — rendered as JSX, never called as a function.

**Take-away:** a component file gaining `'use client'` isn't a purely
local change — audit every other module that imports *named function
exports* (not the component itself) from it, especially anything reachable
from a Server Component's render path. This is a narrower version of the
same class of mistake `features/post-match-scorecard.md` and
`features/availability-nudge.md` already document repeatedly for
migrations/crons (code merged ≠ code actually safe to run) — here it was
"file compiles and typechecks" ≠ "file is safe to import from every one of
its existing callers."

---

## 9. File Map

| File | Role |
|---|---|
| `src/app/leaderboard/page.tsx` | Server component — auth guard, filter parsing, all data fetching (`getLeaderboard`, `getPerformances`, `getFilterOptions`, `getAvailableMonths`), glossary building |
| `src/lib/playerStats.ts` | `getLeaderboard()`, `getPerformances()` (§3), plus `getPlayerCareerStats()`/`getPlayerSeasonStats()`/`getPlayerMatchHistory()`/`getPlayerBookingContextStats()` for the individual player stats page and Captains' Corner recent-form; `getScopedMatchIds()` excludes `is_practice` tournaments by default (§10) |
| `src/components/players/PlayerStatsClient.tsx` | `/players/[id]/stats` filter bar — Year/Ground/Format/As Captain/Defending/Chasing, plus the "Include Practice Games" opt-in (§10) |
| `src/app/api/players/[id]/match-history/route.ts` | Feeds `PlayerStatsClient.tsx` — parses `practice=1` into `includePractice` (§10) |
| `supabase/migrations/054_tournament_is_practice.sql` | `tournaments.is_practice` flag (§10) |
| `src/lib/leaderboardMilestones.ts` | Plain thresholds/tie-handling module (§7) — the fix for §8's incident |
| `src/lib/leaderboardGlossary.ts` | `buildOverallGlossary()`/`buildMonthlyGlossary()`/`buildDetailedGlossary()` — server-side, quotes real thresholds |
| `src/components/leaderboard/LeaderboardFilters.tsx` | Nav tree + filter bar (§2) — pushes `searchParams`, page re-fetches server-side |
| `src/components/leaderboard/LeaderboardMilestones.tsx` | Overall tab — tie-inclusive cards (§4) + year-scoped collapsible bands (§5) + Most Dismissals (§6) |
| `src/components/leaderboard/LeaderboardMonthly.tsx` | Monthly tab — single-winner cards + always-open Centuries/Half-Centuries/5-for/3-for panels |
| `src/components/leaderboard/InningsRow.tsx` | Shared `ClickableRow`/`BattingInningsRow`/`BowlingInningsRow` — whole-row click to `/matches/history/[bookingId]`, used by both Milestones and Monthly |
| `src/components/leaderboard/LeaderboardTable.tsx` | Detailed branch — sortable MVP/Bat/Bowl/Field tables |
| `src/components/leaderboard/LeaderboardGlossary.tsx` | Renders the glossary entries built server-side |
| `src/components/leaderboard/PlayerAvatar.tsx` | Shared avatar (photo or initials) used across every card/row on this page |
| `src/components/leaderboard/WicketIcon.tsx` | 3-wicket-haul icon, Monthly tab only |
| `src/components/matches/BallIcon.tsx` | Gold-ball icon reused here for the 5-Wicket Hauls band header |
| `src/types/index.ts` | `LeaderboardRow`, `MonthlyInnings`, `MonthlyBowlingInnings` |

---

## 10. Practice Games Exclusion (added August 2026)

**Only real tournament fixtures count as stats.** The club runs an
umbrella "Practice games" tournament (`tournaments.name = 'Practice
games'`, no `ground_id` of its own — see `getScopedMatchIds()`'s existing
ground-union comment in `src/lib/playerStats.ts`) for informal games that
were never meant to feed the leaderboard or a player's career record.

**Schema:** `tournaments.is_practice boolean not null default false`
(migration `054_tournament_is_practice.sql`), set `true` on that one row.
A flag rather than a hardcoded name match, so a future rename of the
tournament — or a second practice-style umbrella tournament — doesn't
silently break the exclusion.

**Where it's enforced — `getScopedMatchIds()` in `src/lib/playerStats.ts`:**
every caller of this shared resolver (`getLeaderboard()`, `getPerformances()`,
`getPlayerStats()`, `getPlayerMatchHistory()`) excludes bookings under any
`is_practice` tournament by default. Two ways to see through the exclusion,
both already-established patterns in this file rather than new concepts:

1. **An explicit `tournamentId` filter always wins.** Scoping to one
   specific tournament (whichever one that is) is a deliberate, narrow
   request, not a default aggregate — so `/admin/stats` and
   `/tournament-planner` can still show a per-tournament breakdown for the
   Practice games tournament itself if someone explicitly picks it there.
2. **`includePractice` — the personal stats page's opt-in.** `/players/[id]/stats`
   (`PlayerStatsClient.tsx`) has an "Include Practice Games" checkbox next
   to Defending/Chasing, **off by default** — same both-checked/one-checked
   convention as every other filter on that page, except this one starts
   unchecked. Threaded through `GET /api/players/[id]/match-history`'s
   `practice=1` query param into `getPlayerStats()`/`getPlayerMatchHistory()`.
   The compact "My Stats" summary on `/profile` (`getPlayerCareerStats()`/
   `getPlayerSeasonStats()`, no filter UI at all) always excludes practice
   games — there's no toggle there, only a link to the Full Stats page.

**Leaderboard itself has no toggle** — `/leaderboard` always excludes
practice games, and `getFilterOptions()` drops the Practice games
tournament from the Tournament dropdown entirely (both the unrestricted
and format-restricted branches), so it isn't offered as something to
scope to from that page. The footer disclaimer under the tables/cards
(`src/app/leaderboard/page.tsx`, same line as the "stats synced from
CricHeroes on a best-effort basis" note) says so explicitly — "Practice
games are excluded — only real tournament fixtures count towards these
numbers" — since the exclusion is otherwise silent (there's no filter
control whose absence would hint at it).

**Deliberately unaffected:** `getPlayerBookingContextStats()` (the
Captains' Corner "Form" panel's tournament/ground/format context stats)
does **not** go through `getScopedMatchIds()` — it has its own
`matchIdsForFilter()` — and intentionally still counts practice matches
played at a given ground, per the existing documented ground-union
rationale (a captain checking a player's form at a specific ground cares
about every game played there, practice included). `getRecentForm()`
(Captains' Corner recent-form strip) is also unchanged — "last N matches"
there is about picking a squad from recent activity, not a stats ranking,
and wasn't part of this change.

---

## 11. Explicitly Out of Scope

- No write path anywhere in this feature — pure read/display.
- Monthly tab's cards remain single-winner (`bestBy`) — ties there weren't
  part of the August 2026 fix, on the reasoning that a single month's
  sample makes exact ties much rarer than a full year's.
- "All Time" view keeps the pre-tie-fix "Most 100s" behaviour for
  `>1`-gating and has no collapsible Centuries/5-Wicket Hauls bands — both
  are deliberately scoped to "a specific year selected," not extended to
  "All Time" in this pass.
- No "Most 3-Wicket Hauls" or "Most Half-Centuries-only-list" card/band —
  only centuries and 5-wicket hauls were called out as rare enough to
  warrant the §5 treatment.

---

*Maintained by: Spartans CC BLR*
