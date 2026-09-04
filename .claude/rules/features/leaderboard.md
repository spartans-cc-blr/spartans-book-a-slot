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

All of the above only applies when **no** Tournament/Ground filter is
active — see §5.1 for what a scoped filter does instead.

`page.tsx` fetches `getPerformances({ ...overallFilters, includePractice: true })`
when `category === 'overall' && (year !== 'all' || scoped)` —
`yearlyPerformances`, passed down as `centuries`/`fiveWicketHauls` props
only (`null` when not applicable, which the component treats as "don't
show any band/list", not "zero this year"). `getPerformances()` still
computes `halfCenturies`/`threeWicketHauls` internally (one shared
batting/bowling fetch, splitting into bands is free) but `page.tsx` no
longer passes them down, and `LeaderboardMilestones.tsx` no longer accepts
those two props at all — trimmed August 2026, see the practice-games
callout below.

---

## 5.1 Tournament/Ground-Scoped Lists (added August 2026)

A Tournament/Ground filter shrinks the sample further than a plain year
filter does — a single tournament might only run a handful of games all
season, so even the year-scoped `>1` gate on "Most 100s" (§5) doesn't
reliably rescue a "most" card from being a tie-break artifact once scoped.
When `scoped` (a Tournament or Ground is selected, independent of which
year is picked — including "All Time"), Overall drops the card/band
treatment for Centuries and 5-Wicket Hauls and instead mirrors the Monthly
tab exactly: always-open lists (`ScopedInningsPanel` in
`LeaderboardMilestones.tsx`, visually identical to `CollapsibleInningsPanel`
minus the toggle — same shell `LeaderboardMonthly.tsx`'s own `InningsPanel`
uses) for **Centuries and 5-Wicket Hauls only**, every qualifying
performance listed with no threshold gate. "Most 100s" doesn't render as a
card at all while scoped — there is no in-between "most, but only if >1"
treatment here, unlike the year-only case. "Most 50s" keeps its normal
tied-cards treatment (§4) even while scoped — half-centuries never got the
list treatment at all (see the trim note below), so there's no scoped
variant of it to drop either.

Scoped always wins over the year-band treatment (§5) — a scoped-and-yeared
selection (e.g. Tournament X + 2025) shows the scoped lists, not the year
bands, and the `>1` gate on Most 100s never applies while scoped.

Every other card (Leading MVP/Runs/Wickets, Most Dismissals, Best
Average/S/R/Economy, Most 50s) is unaffected — `minGamesThreshold()`/
`minDismissalsThreshold()` already had a `scoped` floor of 1 game/dismissal
for exactly this filter, and that's unchanged; only Centuries and 5-Wicket
Hauls change presentation.

**Half-Centuries and 3-Wicket Hauls lists — trimmed August 2026, Monthly's
restored days later.** `LeaderboardMilestones.tsx`'s scoped lists and
`LeaderboardMonthly.tsx`'s always-open panels originally showed all four
rare-performance categories (Centuries, Half-Centuries, 5-Wicket Hauls,
3-Wicket Hauls). Per a product decision, Half-Centuries and 3-Wicket Hauls
were dropped from both — common enough club-wide that an individual list
wasn't adding much (and "Most 50s" already covers half-centuries as a tied
card) — leaving **Centuries and 5-Wicket Hauls only** on each. Days later, a
follow-up request restored Half-Centuries and 3-Wicket Hauls **on Monthly
only** — Overall (both the year-scoped bands and the Tournament/Ground-
scoped lists) stays Centuries + 5-Wicket Hauls only, per that request's
explicit scope. `LeaderboardMonthly.tsx` once again accepts
`halfCenturies`/`threeWicketHauls` props and renders all four panels;
`LeaderboardMilestones.tsx` still only accepts `centuries`/`fiveWicketHauls`.
`WicketIcon.tsx` (the 3-wicket-haul icon) is imported by
`LeaderboardMonthly.tsx` again as a result — `LeaderboardMilestones.tsx`
still doesn't import it, so its only other consumer remains
`MilestoneCelebrationModal.tsx`'s unrelated 3-wicket badge (see
`features/milestone-recognition.md`).

**`includePractice: true` stays scoped to Centuries and 5-Wicket Hauls
only — Half-Centuries and 3-Wicket Hauls are practice-excluded even on
Monthly, both before and after the restoration.** Centuries and 5-Wicket
Hauls are the Honour Board's rarest individual-performance recognitions,
so a century or 5-wicket haul scored in a practice game is still worth
surfacing — but Half-Centuries/3-Wicket Hauls are common enough to stay
"real stats only", same posture as every aggregate/ranking metric. Because
`getPerformances()`'s `includePractice` scopes the *entire match set* a
call draws from (not a per-band filter), `page.tsx` makes **two**
`getPerformances({ month })` calls for Monthly — `monthlyPerformances`
(`includePractice: true`, feeds `centuries`/`fiveWicketHauls`) and
`monthlyPerformancesNoPractice` (default, feeds `halfCenturies`/
`threeWicketHauls`) — rather than one call feeding all four props, which
would have leaked practice games into the two bands meant to exclude them.
Overall's single `getPerformances({ ...overallFilters, includePractice: true })`
call didn't need this split since it only ever renders `centuries`/
`fiveWicketHauls` in the first place. **Every aggregate/ranking metric on
Overall, Monthly, and Detailed — Leading MVP/Runs/Wickets, Most Dismissals,
Best Average/S/R/Economy, the tied Most 100s/50s cards, and every Detailed
table — is still sourced from `getLeaderboard()`, which has no
`includePractice` flag and always excludes practice games.** See §10 for
the full practice-games exclusion writeup and the third "way to see through
the exclusion" this added.

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

## 6.1 Runs by Batting Position (Detailed → Bat) — added September 2026

A horizontal bar chart rendered above `LeaderboardTable` on Detailed → Bat
only (`category === 'batting'`) — one bar per batting position (capped
1-12), showing whoever leads runs at that position for the currently
applied Year/Tournament/Ground/Format filters (the exact same
`overallFilters` scope `rows`/the table itself already uses, so the two
never disagree). Pure display — unlike the per-player chart on
`/players/[id]/stats` (`features/player-stats-batting-position.md`), there
is no click-to-filter here: `LeaderboardTable` already shows one row per
*player's season aggregate*, not per-innings, so "filter the table to this
position" has no natural target to narrow down to.

**Data — `getTopScorersByBattingPosition()`** (`src/lib/playerStats.ts`):
sums `batting_stats.runs` per `(batting_order, player_id)` across the same
match scope `getScopedMatchIds()` gives `getLeaderboard()` — no
`includePractice` flag, so practice games are excluded by default, same as
every other Detailed card/table on this page. For each position, the
player(s) with the max total are kept — **tie-inclusive**, the same
convention `bestByAll()` (`leaderboardMilestones.ts`, §4) established after
a real single-winner-pick bug on the Overall tab's Most 100s card. A
position with no batting_order data on record at all (see
`player-stats-batting-position.md` §2 for why some analytics rows still
lack it) simply has no entry — never a fabricated zero bar.

**UI — `BattingPositionLeaders.tsx`:** plain component, no `'use client'`
— nothing here is interactive, so unlike `LeaderboardTable.tsx` it doesn't
need the client boundary. Each row is a horizontal progress-bar shape
(track `bg-ink-4`, fill `bg-gold/40` sized to that position's runs relative
to the chart's own max), with the leader's name(s) — `PlayerNameLink`,
comma-joined on a tie — and their run total overlaid as text rather than
placed outside the bar, since a name can be longer than a short bar's
fill width. Hidden entirely (not shown empty) when the aggregate comes
back with zero positions for the current filter.

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

## 8.1 Incident — 22 Aug 2026, PostgREST's default row cap silently
undercounting the Honor Board

**Symptom:** a player crossed a season dismissals milestone (the
celebration modal correctly announced 50) but `/leaderboard`'s "Most
Dismissals" card kept showing 49 for that same player, even after a full
logout/login. No error anywhere — the page just quietly disagreed with the
milestone log.

**Root cause:** `fetchAnalyticsRows()` and the direct analytics-DB reads in
`getPerformances()`/`getRecentForm()` all issued a plain unpaginated
`.select('*')` (or a narrow column list) against `batting_stats`/
`bowling_stats`/`fielding_stats`/`team_list`. PostgREST silently caps an
unpaginated response at a fixed row limit — 1000 for this project — with no
error surfaced to the caller. `getLeaderboard()`'s season-wide, all-players
fetch is exactly the shape that hits this: confirmed live, the current
2026-season scope alone was **1,045 rows** per table — just over the cap,
so roughly the last 45 rows (in whatever order Postgres happened to return
them) were silently dropped from every player's aggregated totals, not just
the one that happened to surface it.

`detectAndLogMilestones()` (which calls `getPlayerSeasonStats()`,
single-player-scoped via `.eq('player_id', ...)`) never hit the cap — at
most ~150 rows for any one player's whole career — which is why the
milestone modal was correct while the Honor Board, built off the exact same
underlying data, quietly wasn't. Confirmed by reproducing the true total
directly against the analytics DB via raw SQL (which has no PostgREST-layer
cap) and getting 50, matching the milestone exactly.

**Fix:** every multi-row analytics-DB read in `src/lib/playerStats.ts` now
pages through with `fetchAllRows()` — a shared helper that loops
`.range(from, from + 999)` until a page comes back short — instead of
trusting one request to return everything. Applied to `fetchAnalyticsRows()`
(the shared helper behind `getPlayerStats`/`getPlayerMatchHistory`/
`getLeaderboard`/`scopedPlayerStats`), and to the two direct queries each in
`getPerformances()` and `getRecentForm()`. Each paginated query also gained
an explicit `.order('match_id').order('player_name')` — every one of the
four analytics tables has `(match_id, player_name)` as its real composite
primary key, and `.range()` pagination is only guaranteed not to skip or
repeat rows across pages when the underlying order is deterministic.
`getInningsMatchIds()` (one row per *match*, not per player-per-match) was
left unpaginated — the club's full match history is nowhere near 1000 rows
by that count, so it isn't at risk the same way.

No data was wrong or needed fixing — the analytics DB and Hub cache were
already correct after the reconciliation work earlier that same session;
this was purely an application-layer read bug. Once deployed, the next
request recomputes correctly with no backfill needed.

**Take-away:** any Supabase/PostgREST read that scopes to *many* rows
across *many* players (a leaderboard, a squad-wide form panel) — as
opposed to one player's own history — needs to either page explicitly or
have an explicit reason it can't cross the row cap. This bug was invisible
for months because the season's synced-match count only recently grew
large enough to cross it; it will recur in any future unpaginated
multi-player analytics query added to this file without the same
`fetchAllRows()` treatment.

---

## 9. File Map

| File | Role |
|---|---|
| `src/app/leaderboard/page.tsx` | Server component — auth guard, filter parsing, all data fetching (`getLeaderboard`, `getPerformances`, `getFilterOptions`, `getAvailableMonths`, `getTopScorersByBattingPosition` for Detailed → Bat only — §6.1), glossary building |
| `src/lib/playerStats.ts` | `getLeaderboard()`, `getPerformances()` (§3), `getTopScorersByBattingPosition()` (§6.1), plus `getPlayerCareerStats()`/`getPlayerSeasonStats()`/`getPlayerMatchHistory()`/`getPlayerBookingContextStats()` for the individual player stats page and Captains' Corner recent-form; `getScopedMatchIds()` excludes `is_practice` tournaments by default (§10); `fetchAllRows()` pages every multi-row analytics-DB read past PostgREST's default 1000-row cap (§8.1) |
| `src/components/leaderboard/BattingPositionLeaders.tsx` | Detailed → Bat only — horizontal bar chart of the leading run-scorer(s) per batting position (§6.1) |
| `src/components/players/PlayerStatsClient.tsx` | `/players/[id]/stats` filter bar — Year/Ground/Format/As Captain/Defending/Chasing, plus the "Include Practice Games" opt-in (§10) |
| `src/app/api/players/[id]/match-history/route.ts` | Feeds `PlayerStatsClient.tsx` — parses `practice=1` into `includePractice` (§10) |
| `supabase/migrations/054_tournament_is_practice.sql` | `tournaments.is_practice` flag (§10) |
| `src/lib/leaderboardMilestones.ts` | Plain thresholds/tie-handling module (§7) — the fix for §8's incident |
| `src/lib/leaderboardGlossary.ts` | `buildOverallGlossary()`/`buildMonthlyGlossary()`/`buildDetailedGlossary()` — server-side, quotes real thresholds |
| `src/components/leaderboard/LeaderboardFilters.tsx` | Nav tree + filter bar (§2) — pushes `searchParams`, page re-fetches server-side |
| `src/components/leaderboard/LeaderboardMilestones.tsx` | Overall tab — tie-inclusive cards (§4) + year-scoped collapsible bands (§5) + Tournament/Ground-scoped always-open lists (§5.1) + Most Dismissals (§6) |
| `src/components/leaderboard/LeaderboardMonthly.tsx` | Monthly tab — single-winner cards + always-open Centuries/Half-Centuries/5-Wicket/3-Wicket Hauls panels (trimmed to 2, then Half-Centuries/3-Wicket Hauls restored on Monthly only, §5.1) |
| `src/components/leaderboard/InningsRow.tsx` | Shared `ClickableRow`/`BattingInningsRow`/`BowlingInningsRow` — whole-row click to `/matches/history/[bookingId]`, used by both Milestones and Monthly |
| `src/components/leaderboard/LeaderboardTable.tsx` | Detailed branch — sortable MVP/Bat/Bowl/Field tables |
| `src/components/leaderboard/LeaderboardGlossary.tsx` | Renders the glossary entries built server-side |
| `src/components/leaderboard/PlayerAvatar.tsx` | Shared avatar (photo or initials) used across every card/row on this page |
| `src/components/leaderboard/WicketIcon.tsx` | 3-wicket-haul icon — used by `LeaderboardMonthly.tsx`'s 3-Wicket Hauls panel (restored, §5.1) and by `MilestoneCelebrationModal.tsx`'s unrelated 3-wicket badge (`features/milestone-recognition.md`); not used by `LeaderboardMilestones.tsx` (Overall stays trimmed) |
| `src/components/matches/BallIcon.tsx` | Gold-ball icon reused here for the 5-Wicket Hauls band header |
| `src/types/index.ts` | `LeaderboardRow`, `MonthlyInnings`, `MonthlyBowlingInnings`, `BattingPositionLeader` (§6.1) |

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
every caller of this shared resolver excludes bookings under any
`is_practice` tournament by default. Three ways to see through the
exclusion, all already-established patterns in this file rather than new
concepts (the third added when the Centuries/5-Wicket Hauls lists' own
exception, above, shipped):

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
3. **`includePractice` — unconditionally passed by `getPerformances()`'s one
   caller, `/leaderboard` itself.** Not a user-facing toggle like #2 above —
   `src/app/leaderboard/page.tsx` always passes `includePractice: true` on
   both of its `getPerformances()` calls, so the Centuries and 5-Wicket
   Hauls lists (the only two rare-performance categories still rendered —
   see the "Exception" callout below and §5.1's trim note) always include
   practice-game performances. Deliberately narrower than #2: it only ever
   affects `getPerformances()`, never `getLeaderboard()`.

**Leaderboard itself has no toggle** — `/leaderboard` always excludes
practice games from every ranking/aggregate, and `getFilterOptions()` drops
the Practice games tournament from the Tournament dropdown entirely (both
the unrestricted and format-restricted branches), so it isn't offered as
something to scope to from that page. The footer disclaimer under the
tables/cards (`src/app/leaderboard/page.tsx`, same line as the "stats
synced from CricHeroes on a best-effort basis" note) says so explicitly —
since the exclusion is otherwise silent (there's no filter control whose
absence would hint at it).

**Exception, added August 2026 — the Centuries and 5-Wicket Hauls lists
include practice games.** `getPerformances()` (§3) is the one caller of
`getScopedMatchIds()` that passes `includePractice: true` — every other
caller (`getLeaderboard()` itself, `getPlayerCareerStats()`/
`getPlayerSeasonStats()`, and `getPlayerStats()`/`getPlayerMatchHistory()`
absent the personal stats page's own opt-in) still excludes practice by
default. The reasoning: a century or 5-wicket haul is a genuine, nameable
individual performance worth recognising wherever it happened, but it
shouldn't move an aggregate "best" ranking — so the Centuries and 5-Wicket
Hauls **lists** (§5's year-scoped collapsible bands, §5.1's Tournament/
Ground-scoped always-open lists, and Monthly's own always-open panels) now
surface a practice-game century/5-for alongside the tournament ones, while
the **cards** (Leading Run Scorer, MVP, Best Average, the tied Most
100s/50s cards, and every Detailed table — all sourced from
`getLeaderboard()`'s `rows`, not `getPerformances()`) are completely
unaffected and still practice-excluded. `src/app/leaderboard/page.tsx`
passes `includePractice: true` on both of its `getPerformances()` calls
(`monthlyPerformances` and `yearlyPerformances`); `getPerformances()`
itself has no default of its own — the flag is required from the caller,
same "explicit opt-in only" posture as the personal stats page's own
`includePractice` toggle above. See §5.1's trim note for why
Half-Centuries and 3-Wicket Hauls were dropped from these lists entirely
(rather than also gaining `includePractice`) the same session this
shipped.

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
- "All Time" view with **no** Tournament/Ground filter keeps the
  pre-tie-fix "Most 100s" behaviour for `>1`-gating and has no collapsible
  Centuries/5-Wicket Hauls bands — that combination (`year === 'all'` and
  not scoped) is the one case §5/§5.1 don't cover, since a scoped filter
  (§5.1) or a specific year (§5) each independently supply a list-based
  fallback, but neither is present here.
- No individual-performance list for Half-Centuries or 3-Wicket Hauls on
  **Overall** — year-scoped Overall (§5) never had one; Tournament/Ground-
  scoped Overall (§5.1) used to, and had it trimmed in the same August 2026
  pass that added `includePractice` to Centuries/5-Wicket Hauls (§5.1's trim
  note, §10). Monthly's own Half-Centuries/3-Wicket Hauls lists were trimmed
  the same pass and then restored days later — see §5.1. "Most 50s" (the
  tied card, not a list) is the only half-century surface on Overall, and
  it never included practice games nor was asked to.
- Half-Centuries and 3-Wicket Hauls (wherever they're shown — Monthly, or
  the Detailed tables) never include practice games — only Centuries and
  5-Wicket Hauls carry the `includePractice: true` exception, on both
  Overall and Monthly.

---

*Maintained by: Spartans CC BLR*
