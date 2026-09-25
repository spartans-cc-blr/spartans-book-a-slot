# Player Stats — Runs by Batting Position & Pitch Type Tabs

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

**Pitch Type tabs (added September 2026, see §9)** — a second, independent
narrowing control directly above "Innings History": All / Matted / Astro /
Turf, hidden whenever a Ground is already selected. Extends the identical
tabs `/leaderboard`'s Detailed → Bat/Bowl tabs already ship
(`features/leaderboard.md` §6.2) to this page.

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

## 8. Light/Dark/System (added September 2026)

`/players/[id]/stats` (`PlayerStatsClient.tsx` and its server wrapper
`src/app/players/[id]/stats/page.tsx`, including this feature's own
`BattingPositionChart`) is now theme-aware, following the app's new
Light/Dark/System toggle — full mechanism documented in `ui-theme.md`'s
"Light/Dark/System Theme" section.

**Correction to the note this section originally carried:** this page's
existing look (white cards, near-black text, muted-gold accents on a
parchment shell) was already a Warm Light design when this pass started —
not the dark-ink look the earlier version of this note assumed. That
existing look is now the **light** theme, essentially unchanged (its
literal Tailwind classes — `bg-white`, `text-ink`, `border-parchment-3`,
`text-stone-500`, `text-gold`/`text-gold-dim` — were swapped for the
matching `--stats-*` light-token values, which read as the same colours).
A new **dark** variant was added on top, using the pre-built `--stats-*`
dark tokens in `globals.css` (`--stats-shell-bg`, `--stats-card-bg`,
`--stats-text*`, `--stats-accent*`, `--stats-badge-*`, `--stats-row-*`,
`--stats-divider`) — the same dark-ink palette the rest of the app's
classic theme already uses (`#080808`/`#111111` surfaces, `#C9A84C` gold),
so a dark-theme visitor sees a properly dark page instead of the light one
regardless of preference.

**Pattern used:** structural chrome (page/card/row backgrounds, borders,
dividers, body/muted/faint text, the gold accent and its "badge" pill
triad) reads its colour via `var(--stats-*)` inside a Tailwind arbitrary
value (e.g. `text-[var(--stats-text)]`, `bg-[var(--stats-card-bg)]`) —
since these CSS custom properties are already redefined per
`[data-theme="light"|"dark"]` in `globals.css`, no `dark:` class pairs or
`useTheme()` calls are needed for these; the browser repaints them the
instant `<html data-theme>` changes. One-off *semantic/data* colours that
don't have a `--stats-*` counterpart — the win/loss/tie result letters,
the three MVP category colours, and the "big innings"/"bar selected"
highlight blue — instead use plain literal Tailwind `dark:` pairs (e.g.
`text-red-700 dark:text-red-400`), each darker `-600`/`-700` light shade
paired with a lighter `-400` shade for dark-background contrast, matching
the same shade-stepping already used for `--home-tile-emerald-text`/
`--home-tile-crimson-text` in `src/app/page.tsx`. The chart's own
unselected-bar fill (`bg-gold/50`) and the Position-pill's hover tint
(`hover:bg-gold/20`) were deliberately left untouched in both themes —
translucent-gold accents that read fine over either a light or dark card
background, the same allowance `ui-theme.md`'s dataviz guidance gives a
semantic accent that isn't structural chrome.

No new `--stats-*` tokens were needed — the triad already pre-built for
this page (`--stats-badge-bg`/`--stats-badge-border`/`--stats-badge-text`)
turned out to double as the right choice for every "readable gold text"
role (headings, selected-filter labels, non-highlighted stat values), not
just literal pill badges — its dark value (`#E8C97A`) is legible against
the dark card background where the more muted `--stats-accent-dim`
(`#7A6030` in dark) would not have been.

---

## 9. Pitch Type Tabs (added September 2026)

An "All / Matted / Astro / Turf" tab row directly above the "Innings
History" card, narrowing it the same way `selectedPosition` (§4) already
does — extends the identical tabs already shipped on `/leaderboard`'s
Detailed → Bat/Bowl tabs (`features/leaderboard.md` §6.2) to this page.
Reuses `tournaments.pitch_type` (migration 079 — see
`features/team-stats.md` §6), the same tournament-level classification
Team Record and the leaderboard already read, rather than inventing a
second signal.

**Hidden whenever a Ground is already selected.** This page has no
separate Tournament filter (only Ground), so "no location filter already
narrowing the result" reduces to `groundId === 'all'` — the direct
counterpart of the leaderboard's `tournamentId === 'all' && groundId ===
'all'` gate. `showPitchTabs` in `PlayerStatsClient.tsx` gates both the
tabs' visibility and whether the filter is actually applied, so a stale
`selectedPitch` left over from before a Ground was picked can never
silently keep filtering underneath a hidden control.

**No "Not set" tab** — same All/Matted/Astro/Turf-only convention as
`/leaderboard`'s tabs and Team Record's own Pitch Type *filter*. Most
tournaments still have no `pitch_type` classified, so picking Matted/
Astro/Turf can legitimately show a thin (or empty) Innings History —
expected, not a bug.

**Data — `getPlayerMatchHistory()` (`src/lib/playerStats.ts`)** widens its
existing `bookings` select from `tournament:tournaments(name)` to
`tournament:tournaments(name, pitch_type)` and adds `pitchType` to each
returned row, resolved the same array-vs-object-embed way
`tournamentName` already is. `PlayerMatchHistoryRow.pitchType: PitchType |
null` (`src/types/index.ts`) is the new field — `null` when the match's
booking couldn't be resolved, or its tournament has no surface classified
yet. `GET /api/players/[id]/match-history` needed no changes at all, same
"already forwards the result verbatim" story `battingOrder` had in §2 —
the field reaches the client for free.

**Purely client-side, no new fetch** — unlike `/leaderboard` (which
re-renders server-side per filter tap), this page already holds its full
`matches` array in client state (from the initial page load, or the most
recent `fetchScoped()` re-fetch). `selectedPitch` is local component state
filtering that already-fetched array, exactly like `selectedPosition`.

**Only ever narrows Innings History — never the "Runs by Batting
Position" chart above it.** `positionData` stays derived from `matches`
directly, unaffected by `selectedPitch`, matching the "chart above stays
unaffected, only the table narrows" convention `features/leaderboard.md`
§6.2 established for the near-identical `battingPositionLeaders`/`rows`
split there. The filtering chain is `matches` → `matchesForPitch`
(pitch) → `matchesForPosition` (position) → `tabMatches` (stat tab) — pitch
applied first since it sits visually above the position chart's own filter
and is the coarser of the two, though the two are independent (a match can
be excluded by either without affecting how the other is computed).

**Reset alongside `selectedPosition`.** `fetchScoped()` sets
`selectedPitch` back to `'all'` the moment any top-of-page filter changes
(year/ground/format/captain/innings/practice) and pulls in a new match
set — same rationale as `selectedPosition`'s own reset (§4): a pitch that
had matches under the old filter combination may not exist at all under
the new one, and changing Ground specifically is also what makes the tabs
disappear, so there'd otherwise be a stale, invisible filter left active.

**UI styling matches this page's own tab row** (`STAT_TABS`'
Batting/Bowling/Fielding buttons), not `LeaderboardFilters.tsx`'s
`pillClass()` — this page reads every colour via `var(--stats-*)` with no
`dark:` Tailwind pairs at all (§8's theming pattern), so a second styling
convention borrowed from the leaderboard's own `dark:`-paired pills would
have been visually inconsistent within this one file.

### Security (vibe-security)

Same posture as §5 — read-only, no new write path, no new API route.
`pitchType` is scoped identically to every other field already returned by
`GET /api/players/[id]/match-history`. `selectedPitch` is pure client-side
UI state narrowing an already-fetched, already-authorized array; nothing
about it is ever sent back to the server.

### File Map additions

| File | Role |
|---|---|
| `src/components/players/PlayerStatsClient.tsx` | `PITCH_TABS`, `selectedPitch`/`showPitchTabs` state, `matchesForPitch` derivation, the Pitch Type tab row above Innings History |
| `src/lib/playerStats.ts` | `getPlayerMatchHistory()` — now also selects `tournament.pitch_type` and includes `pitchType` per match |
| `src/types/index.ts` | `PlayerMatchHistoryRow.pitchType` |
| `src/app/api/players/[id]/match-history/route.ts` | Unchanged — already forwards `getPlayerMatchHistory()`'s result verbatim |

---

## 10. Career Summary — Highest Score & Best Bowling (added September 2026)

The Career/Filtered Summary card (`PlayerStatsClient.tsx`'s "{isFiltered ?
'Filtered' : 'Career'} Summary" grid — Matches/Runs/Avg/S/R/Wickets/
Economy/Dismissals/MVP Pts) gained two more tiles: **Highest Score**
(`87* (52)`, `*` for not-out, ball count in brackets when known) and
**Best Bowling** (`4/18`, wickets/runs), placed next to Runs and Wickets
respectively. Both read `'—'` when the scoped match set has no qualifying
batting/bowling row at all (e.g. a player who's only ever fielded under
the current filter).

**Sourced from `PlayerStatsTotals` directly, not a separate fetch or a
client-side scan of `matches`.** `PlayerStatsTotals` (`src/types/index.ts`)
gained two new fields — `highestScore: { runs, balls, notOut } | null` and
`bestBowling: { wickets, runs } | null` — computed inside `aggregate()`
(`src/lib/playerStats.ts`) in the same per-row loops that already sum
runs/wickets/etc., so every existing caller of `aggregate()` (via
`getPlayerStats()`/`getPlayerCareerStats()`/`getPlayerSeasonStats()`, and
`getLeaderboard()`) gets these two fields for free with no extra analytics
round trip. `getPlayerStats()` is exactly what this page's `scoped`
already came from (both `initialCareer` from the server page and every
`fetchScoped()` re-fetch via `GET /api/players/[id]/match-history`), so no
route or server-page change was needed — the new fields simply flow
through the existing `scoped`/`career` payloads.

**Tie-break rules mirror the `/players` directory's career-highlights
card** (`src/lib/playerHighlights.ts`'s `pickHighlights()`, see
`features/player-directory.md`) exactly, since both now derive from the
same underlying logic: highest score is most runs, a not-out beating an
out on equal runs, then fewer balls faced; best bowling is most wickets,
then fewest runs conceded. **This scoping is genuinely different from that
directory card, though** — the directory's `getCareerHighlightsByPlayer()`
is always unfiltered "all time, real tournaments only," while this page's
`highestScore`/`bestBowling` reflect whatever Year/Ground/Format/As
Captain/Defending-Chasing/Practice filters are currently applied, same as
every other tile in the Summary card.

**`getCareerHighlightsByPlayer()` was simplified to reuse this**, rather
than keeping two copies of the identical best-innings/best-bowling
tie-break logic — it already called `aggregate()` to build its
per-player totals, so its own duplicate loops were dropped in favour of
reading `t.highestScore`/`t.bestBowling` straight off that result
(mapped onto `CareerHighlights.bestInnings`/`bestBowling`, which keep
their original field names in that module). No behaviour change for the
`/players` directory — same numbers, same tie-breaks, one implementation
instead of two.

### Security (vibe-security)

Same posture as §5/§9 — purely additive, read-only fields on an
already-authorized aggregate; no new route, no new client input, no new
access surface. `highestScore`/`bestBowling` carry only runs/balls/
wickets figures already visible elsewhere on this same page (the Innings
History table).

### File Map additions

| File | Role |
|---|---|
| `src/types/index.ts` | `PlayerStatsTotals.highestScore` / `.bestBowling` |
| `src/lib/playerStats.ts` | `aggregate()` computes both fields inline while summing batting/bowling rows; `emptyTotals()` defaults them to `null`; `getCareerHighlightsByPlayer()` now reuses them instead of recomputing |
| `src/components/players/PlayerStatsClient.tsx` | Two new Summary-card tiles + `formatHighestScore()`/`formatBestBowling()` display helpers |

---

## 11. Career Summary — grouped into Overview / Batting / Bowling columns (added September 2026)

The Summary card's single flat 10-tile grid (§10 above) was reorganized,
per a direct request, into three named sections — `Overview`, `Batting`,
`Bowling` — each a `grid-cols-2` mini-grid of its main stats with its
category MVP pinned below a divider. **First shipped as three separate
bordered/shadowed boxes, corrected the same week** to a single shared
card (per a follow-up request: "the entire career summary can be in one
card instead of multiple cards for each discipline") — the outer
`bg-[var(--stats-card-bg)] border ... rounded-2xl` Summary card (unchanged
from §10) now contains one `grid-cols-1 sm:grid-cols-3` row of the three
`SummaryColumn` sections, separated by a thin 1px divider
(`divide-y sm:divide-y-0 sm:divide-x divide-[var(--stats-card-border)]`)
instead of by gaps between three independent cards — a row on desktop/
tablet, a stacked column on mobile, matching "batting related to one row
or column and bowling similarly" either way the viewport folds it:

| Panel | Tiles | MVP pinned below |
|---|---|---|
| **Overview** | Matches (with the "Bat N · Bowl N" caption, unchanged), MVP Pts, Dismissals | Fielding MVP |
| **Batting** | Runs, Highest, Avg, S/R | Batting MVP |
| **Bowling** | Wickets, Best Bowling, Economy, S/R | Bowling MVP |

**Replaces the old separate 3-column MVP breakdown row** (Batting MVP /
Bowling MVP / Fielding MVP, previously below the flat grid) — each
category's MVP now sits inside its own panel instead of in a fourth,
disconnected row, so a batting figure and "how many of those points came
from batting" read together.

**Bowling S/R needed no new data** — `PlayerStatsTotals.bowlingStrikeRate`
(balls per wicket, `t.ballsBowled / t.wickets`) already existed in
`aggregate()`'s output, just never surfaced on this page before; the
Bowling panel's `S/R` tile is `scoped.bowlingStrikeRate?.toFixed(2) ?? '—'`.
Both panels' `S/R` tiles are deliberately unqualified ("S/R", not "Batting
S/R"/"Bowling S/R") — the panel header already disambiguates units (runs
per 100 balls vs. balls per wicket), the same way a printed scorecard
doesn't need to spell that out per column either.

**`Highest` and `Best Bowling` keep the same `formatHighestScore()`/
`formatBestBowling()` helpers from §10** — only the tile's label shortened
from "Highest Score" to "Highest" to match the panel-grouped request; the
underlying value and formatting are unchanged.

`SummaryColumn` (`PlayerStatsClient.tsx`) is a small shared wrapper —
`title`, `children` (the section's `Stat` tiles), and `mvpLabel`/
`mvpValue`/`mvpColor` for the pinned `MvpStat` below — reused three times
rather than duplicating the header/divider markup per section. It no
longer renders its own `border`/`bg` (that was the first cut's per-panel
card look); it's just padding (`py-4 sm:py-0 sm:px-5`, with `first`/`last`
resets so the outer card's own edge padding isn't doubled) plus the
section header and its two-tile-wide mini-grid — the parent grid's
`divide-x`/`divide-y` draws the only separator line between sections now.
`MvpStat` itself is unchanged, same emerald/blue/purple colour convention
as before.

### Security (vibe-security)

Purely a layout change — no new data, no new fetch, no new route. Same
posture as §10.

### File Map additions

| File | Role |
|---|---|
| `src/components/players/PlayerStatsClient.tsx` | `SummaryColumn` — the three-panel wrapper; Summary card JSX regrouped into Overview/Batting/Bowling; Bowling panel's `S/R` tile reads the pre-existing `scoped.bowlingStrikeRate` |

---

*Maintained by: Spartans CC BLR*
