# Captaincy Stats — My Players & Under Each Captain

**Spartans Hub · Added: September 2026**

---

## 1. Overview

Two views of the same data: which players did what, in matches led by which
match captain.

| Who | Sees | Where |
|---|---|---|
| Captain | Their own matches only: the top 3 batters at each batting position, and the bowlers they used most | `/captains-corner/my-players` ("📈 My Players") |
| Player | Their own record split by the captain who led each match: positions used, batting and bowling under each, a chronological strip, and a season-by-season table | "Under each captain" section on their own `/players/[id]/stats` |
| GC / Admin | Both. A captain picker on `/captains-corner/my-players`, and the "Under each captain" section on every player's stats page | Same two places; GC reaches the page from Council ⚖ as "📈 Captaincy Records" |

Everyone else sees neither. A captain viewing another player's stats page
does not see that player's breakdown, since it shows how other captains used
the player.

**"Captain" means the match captain**, `squad.is_captain` on that booking,
not `players.is_captain` (the permanent club flag). This is the same source
Team Record's Captain split uses. A match with no captain recorded in `squad`
shows under "Captain not recorded" in the player view and is left out of the
captain view.

**Scope:** confirmed Hub bookings with a `match_id`, practice games excluded
(tournament or booking flag, see `practice-games.md`). Pre-Hub analytics
matches with no booking are not included, which is the same rule as Team
Record. Stats are keyed by the analytics DB's reconciled `player_id`, so an
unreconciled scorecard name doesn't appear.

---

## 2. Ranking rules

- **Top 3 per position:** runs scored at that position, then fewer innings,
  then higher average, then name. Runs lead rather than average because runs
  reflect both how often the captain trusted the player there and what the
  player did with it. A single not-out cameo can't top a position.
  Positions 1–12 only. An innings with no recorded `batting_order` is left
  out of this view.
- **Bowlers used most:** balls bowled, then wickets, then name. The bar shows
  each bowler's share of all balls bowled in that captain's matches. Overs
  are summed in balls, not as decimals (3.4 + 2.5 = 6.3, not 6.9).
- **Usual position (season table):** the position with the most innings
  that year, ties going to the lower number.
- **Player view:** captains ordered by matches played under them, with
  "Captain not recorded" always last. Positions within a captain are
  ordered by **batting order (position ascending)**, not by how often each
  slot was used (changed September 2026 — see below).
- **Recommended position (player view, added September 2026):** which of a
  captain's positions actually got the most out of the player, with a
  plain-language reason. See below.

---

## 3. Data — `src/lib/captaincyStats.ts` + `captaincyStatsCore.ts`

Split the same way as `teamStats.ts` / `teamStatsCore.ts`: the fetch is
server-only, and the aggregators are pure and client-safe (unit-tested in
`captaincyStats.test.ts`).

- `getCaptaincyInnings({ captainId?, playerId? })` returns one
  `CaptaincyInnings` row per (match, player). It reads Hub bookings and
  `squad` captain rows, then the analytics DB's `batting_stats` and
  `bowling_stats`, scoped by the captain's match IDs (captain view) or by
  `player_id` (player view), paged with the shared `fetchAllRows()` (now
  exported from `playerStats.ts`). A player carrying two rows in one match
  (two aliased scorecard spellings, see `player-identity-resolution.md`
  §5.2) keeps the row that shows real participation.
- `getMatchCaptains()` is Hub-only and lists every match captain with a
  match count. It feeds the GC/admin picker without an analytics read.
- `buildCaptainRecord()`, `buildPlayerUnderCaptains()`,
  `buildSeasonProgression()`, `battingLine()`, `bowlingLine()`, and
  `filterCaptaincyInnings()` (§4.1) are the pure aggregators.

No new table, migration or API route. Both views fetch server-side.
`/captains-corner/my-players` stays a Server Component throughout — its
own filter (season only) is a URL param, handled server-side same as
before. `/players/[id]/stats`, as of September 2026, is different: its
page.tsx fetches the raw `CaptaincyInnings[]` rows but no longer
aggregates them — see §4.1.

---

## 4. UI

- **`/captains-corner/my-players`**: season pills (All time plus each year
  with data, `?year=`, navigated with `replace`), a match count and date
  range, then `CaptainRecordView`: a card per position with ranks 1–3 (name,
  runs, innings, average, strike rate, best), and a bowlers table (overs
  with a share bar, innings, wickets, economy, average, best). GC/admin get
  `CaptainSelect` (`?captainId=`, also `replace`). `back` goes to Squad
  Selection. A position card no longer shows its own total-innings figure
  (dropped September 2026 — see below); it's just the "No. N" header over
  the top 3.
- **"Under each captain"** (`PlayerCaptaincyBreakdown`, rendered from inside
  `PlayerStatsClient` on `/players/[id]/stats` — see §4.1 for why): one
  collapsible card per captain (the first is open). Each card shows an
  expandable list of batting positions used (innings, runs, average, strike
  rate), batting and bowling summary lines, and a "Bowling, oldest →
  latest" chip strip. A captain the player never batted under reads "Did
  not bat" in the card header rather than "0 runs". A "Season by season"
  table follows with batting innings, usual position, runs, average,
  strike rate, overs, wickets and economy. As of September 2026 it follows
  the page's own Year/Format/As-Captain/Innings filters — see §4.1.
- **Usual position, not average position (changed September 2026).** The
  season table first showed matches played and the average batting
  position. Both were replaced on feedback: matches counted games where the
  player didn't bat, and an average position (8.9, say) tells neither a
  captain nor a player where he actually bats. The table now shows batting
  innings ("Inn") and the most-played position with its innings count
  ("No. 6 (5)"). A tie goes to the higher order (lower number).
- **Position-card total-innings figure dropped (changed September 2026).**
  Each position card on `/captains-corner/my-players` used to show a
  right-aligned "N innings" total (the sum of every batter's innings at
  that position, under this captain). Reported as redundant — the captain
  picker already shows total matches led, and the card itself doesn't need
  a second, position-scoped count to be readable. `CaptainPositionChoices.
  totalInnings` was removed from the data layer, not just hidden, since
  nothing else read it.
- **Batting positions used + the batting bar chart consolidated into one
  expandable list (changed September 2026).** The player-facing "Under each
  captain" card originally showed two separate things for batting: a row of
  static "No. N · innings · runs · avg · SR" chips, and — further down,
  inside the same card — a horizontal bar chart plotting every innings
  oldest-to-latest (bar height = runs, label = position). Reported as
  redundant and unusable at volume: a player with many innings under one
  captain produced a wide, horizontally-scrolling chart that a phone
  visitor had no visual cue even existed, and the chips above it already
  named the same positions with no way to see the matches behind them. Per
  the explicit request, the bar chart is gone outright (not just hidden or
  shrunk) and each position chip became a `<details>` row instead
  (`PositionRow` in `PlayerCaptaincyBreakdown.tsx`): the aggregate line
  (innings/runs/avg/SR) is always visible, and tapping it expands a
  newest-first list of the actual matches at that position — date, opponent,
  runs (with `*` for not-out) and balls faced, each linking to
  `/matches/history/[bookingId]`. This is a genuine consolidation, not a
  second UI bolted next to the first: the aggregate and the match list now
  live in the same row, and nothing else on the card repeats either. The
  bowling side (a "Bowling, oldest → latest" chip strip — wickets/runs,
  overs, linking to the match) is unaffected — it was never the reported
  problem (chips wrap on a phone rather than requiring horizontal scroll)
  and has no separate "chip summary" to consolidate with, so it kept its
  own, unchanged component (`BowlingTimeline`, the batting half of the old
  combined `Timeline` component was deleted entirely rather than kept
  side-by-side with the new position rows).
  `PositionUsage` (`captaincyStatsCore.ts`) gained a `matches:
  PositionMatch[]` field (bookingId/gameDate/opponentName/runs/balls/notOut,
  sorted newest-first) built directly from the same `CaptaincyInnings` rows
  already grouped by position in `buildPlayerUnderCaptains()` — no new
  fetch, no new query; the match-history page it links to already handled
  the batting-order chart's own click-through the same way
  (`/players/[id]/stats`' own "Runs by Batting Position" chart, see
  `player-stats-batting-position.md` §4), so this reuses an established
  navigation pattern rather than inventing one.
- **Positions re-ordered by batting order, and a recommended position
  surfaced (changed September 2026).** Two follow-ups from the same
  screenshot, once the consolidated list above shipped: the rows sorted by
  innings count descending, which read as scrambled rather than a lineup
  (a position with 2 innings could sit above one with 11, depending on
  which slot the player happened to bat at more), and there was no signal
  at all for "which of these positions is actually working out."
  - **Ordering** — `buildPlayerUnderCaptains()`'s position sort changed
    from `innings desc, then position asc` to a plain `position asc` —
    the list now reads top-to-bottom the way a real batting lineup does.
    This only affects the player-facing "Under each captain" list;
    `buildCaptainRecord()` (the captain-facing Top-3-per-position view on
    `/captains-corner/my-players`) already sorted by position ascending
    and needed no change.
  - **Recommendation** — `pickRecommendedPosition()` scores every position
    with at least 2 innings (`MIN_INNINGS_FOR_RECOMMENDATION` — a single
    cameo shouldn't be able to "win" a position) by blending runs,
    average, and strike rate, each measured relative to the captain's own
    best at any position so the score is comparable across positions with
    very different sample sizes: `0.4 × (runs / maxRuns) + 0.35 ×
    (average / maxAverage) + 0.25 × (strikeRate / maxStrikeRate)`. Runs
    weighs heaviest, same reasoning the Top-3 ranking already uses (it
    reflects both how much the captain trusted the player there and what
    he did with the trust); average and strike rate refine that by how
    efficiently he did it. Ties go to the lower (earlier) position
    number. A captain with no position reaching 2 innings gets
    `recommendedPosition: null` — nothing is highlighted or claimed for a
    thin sample.
  - **UI** — the recommended `PositionRow` gets a gold-tinted border/
    background (the same `--stats-badge-*` tokens the Top-3 rank-1 pill
    already uses) and a ⭐, and a one-line hint sits above the position
    list naming the position and the reason in plain language (e.g. "⭐
    No. 3 recommended — Best combination of 52 runs in 2 inn, avg 26.0, SR
    100 among positions with 2+ innings under this captain."). Nothing is
    shown when `recommendedPosition` is null.

Both use the shared `--stats-*` tokens, so they follow Light/Dark/System.

---

## 4.1 "Under each captain" follows the page's top filters (added September 2026)

**The gap this closes.** `/players/[id]/stats` already has a top filter bar
(Year, T20/T30 format checkboxes, As Captain, Defending/Chasing, Ground,
Include Practice Games, Pitch Type) narrowing the Summary card and the
Batting/Bowling/Fielding tabs — but "Under each captain" and "Season by
season" sat below it, always all-time, deaf to every one of those
controls. Reported directly: at least Format (T20 vs T30) should narrow
this section the same way it narrows everything above it.

**Architectural change — the section moved from the Server Component into
`PlayerStatsClient`.** Previously `page.tsx` called `getCaptaincyInnings()`
server-side and immediately reduced the result with
`buildPlayerUnderCaptains()`/`buildSeasonProgression()`, handing only the
final aggregate to a standalone `<PlayerCaptaincyBreakdown>` rendered as a
page-level sibling of `<PlayerStatsClient>` — two components with no shared
state, so there was no way for one's filter bar to reach the other's data.
`page.tsx` now stops aggregating: it fetches the same raw `CaptaincyInnings[]`
rows (still gated on `canSeeCaptaincy`, still `[]` for anyone else) and
passes them straight down as a `captaincyRows` prop to `PlayerStatsClient`,
alongside `showCaptaincy`/`isOwnStats`. `PlayerStatsClient` now imports
`buildPlayerUnderCaptains()`/`buildSeasonProgression()` directly from
`captaincyStatsCore.ts` (never from `captaincyStats.ts` — that module is
server-only and importing it into a `'use client'` file is exactly the
RSC-boundary mistake `features/leaderboard.md` §8 documents a real
production incident for) and renders `<PlayerCaptaincyBreakdown>` itself,
as the last element in its own returned fragment — same DOM position as
before, just declared from inside the client component instead of as a
page-level sibling.

**`filterCaptaincyInnings()`** (`captaincyStatsCore.ts`) is the pure filter
predicate this enables — narrows a player's raw rows to the same scope as
the top filter bar, wherever the data can express it:

| Page filter | Applied? | How |
|---|---|---|
| Year | ✅ | `CaptaincyInnings.gameDate` |
| Format (T20/T30) | ✅ | `CaptaincyInnings.format` — both checked (or omitted) means no restriction, same "both-checked = unrestricted" convention the checkboxes themselves use |
| As Captain | ✅ | `r.captainId === viewerPlayerId` — restricts to matches where *this player* was the match captain (of themselves, in effect) |
| Defending / Chasing | ✅ | Needs a per-`bookingId` `battedFirst` lookup `CaptaincyInnings` doesn't itself carry — built once from `initialMatches` (the player's own already-fetched, unfiltered career match list, which already has `battedFirst` per `features/player-stats-batting-position.md`), not from the currently-scoped `matches` array, since that one can already be narrowed by Ground/Practice and would silently drop bookings out of the lookup |
| Ground | ❌ | No `ground_id` on `CaptaincyInnings` — would need widening `getCaptaincyInnings()`'s booking select. Not done in this pass; the section shows a small caveat line instead (see below) rather than silently ignoring the filter |
| Include Practice Games | ❌ | The fetch already excludes practice matches entirely (§1's Scope) — there's nothing to "include" here regardless of the toggle. Same caveat treatment |
| Pitch Type / chart selections (`selectedPosition`/`selectedDismissal`) | ❌ (by design) | Explicitly out of scope per the request — these narrow Batting/Bowling specifically, not "who captained this player" |

All four applied filters AND together, matching how the top filter bar's
own controls already combine.

**Transparency over silent partial support.** `PlayerCaptaincyBreakdown`
takes a `filterLabel: string | null` prop (built in `PlayerStatsClient`,
e.g. `"2026 · T20"`) that replaces the old fixed "All time" wording in the
section's subtitle, plus two booleans (`groundFilterActive`,
`practiceFilterActive`) that add a one-line caveat — "Ground filter isn't
applied to this section." / "Practice games stay excluded here
regardless." — whenever the visitor has one of those two active elsewhere
on the page. Never silently claims to be filtering by something it isn't.

**Empty-state distinction.** `hasAnyData` (computed as `captaincyRows.length
> 0`, i.e. *unfiltered*) is the one thing that hides the whole section —
distinct from `captains.length === 0`, which can now legitimately mean
"the current filter combination matches nothing" (e.g. Year 2019 for a
player who joined in 2022) and renders a "No captaincy data for this
filter." message instead of the section vanishing outright. The original
guard (`if (captains.length === 0) return null`) would have made a narrow
filter combination look like the whole feature had disappeared.

**Season table now follows the filters too, on purpose, not by
oversight.** `buildSeasonProgression()` runs over the same filtered rows as
`buildPlayerUnderCaptains()` — picking a Format narrows "Season by season"
down to just the years/positions that satisfy it, same as everywhere else
on the page. A Year filter can leave it with a single row; that's
consistent with what every other Year-filtered figure on this page already
does.

### File Map additions / changes

| File | Role |
|---|---|
| `src/lib/captaincyStatsCore.ts` | `filterCaptaincyInnings()` + `CaptaincyFilterOptions` — the pure filter predicate |
| `src/components/players/PlayerStatsClient.tsx` | Now imports `buildPlayerUnderCaptains()`/`buildSeasonProgression()`/`filterCaptaincyInnings()` from `captaincyStatsCore.ts` directly; owns the `battedFirstByBooking` lookup and the memoized filtered captaincy data; renders `<PlayerCaptaincyBreakdown>` as the last element of its own fragment |
| `src/components/captaincy/PlayerCaptaincyBreakdown.tsx` | New props: `filterLabel`, `groundFilterActive`, `practiceFilterActive`, `hasAnyData`; empty-filter message distinct from the "hide entirely" guard |
| `src/app/players/[id]/stats/page.tsx` | No longer imports or calls `buildPlayerUnderCaptains()`/`buildSeasonProgression()`/`PlayerCaptaincyBreakdown` — passes `captaincyRows`/`showCaptaincy`/`isOwnStats` straight through to `PlayerStatsClient` |

---

## 5. Security (vibe-security)

| Check | Status |
|---|---|
| Page gate `isCaptain \|\| isGC \|\| isAdmin`, server-side | ✅ |
| A captain can only ever see their own matches. `?captainId=` is ignored unless GC/admin, and a GC/admin value is validated against the real captain list | ✅ |
| Player breakdown fetched only when the viewer is that player or GC/admin — `page.tsx` still resolves `captaincyRows: []` server-side for anyone else, same gate as before. For anyone else the data never leaves the server | ✅ |
| Raw rows (not just the aggregate) now reach the browser for an *authorized* viewer, since aggregation moved client-side (§4.1) — accepted, since `CaptaincyInnings` carries nothing an authorized viewer (self, GC, admin) couldn't already see elsewhere (scorecards, the leaderboard, `/matches/history`), and the server-side gate above still zeroes it out for everyone else | ✅ |
| Read-only, no write path, no new API route | ✅ |
| Analytics DB read server-side only (`ANALYTICS_SUPABASE_KEY`) | ✅ |
| A breakdown fetch failure is logged and hides the section. It never breaks the stats page | ✅ |
| `filterCaptaincyInnings()` is pure and client-side only — it narrows an already-authorized payload, it never widens what was fetched or bypasses the server-side gate above | ✅ |

---

## 6. File Map

| File | Role |
|---|---|
| `src/lib/captaincyStats.ts` | `getCaptaincyInnings()`, `getMatchCaptains()`; re-exports the core |
| `src/lib/captaincyStatsCore.ts` | Types and pure aggregators |
| `src/lib/captaincyStats.test.ts` | Vitest coverage of the aggregators |
| `src/lib/playerStats.ts` | `fetchAllRows()` now exported |
| `src/app/captains-corner/my-players/page.tsx` | The captain view |
| `src/components/captaincy/CaptainRecordView.tsx` | Positions grid and bowlers table |
| `src/components/captaincy/CaptainSelect.tsx` | GC/admin captain picker |
| `src/components/captaincy/PlayerCaptaincyBreakdown.tsx` | "Under each captain" and "Season by season" |
| `src/components/players/PlayerStatsClient.tsx` | Filters, aggregates (client-side, as of §4.1) and renders the breakdown |
| `src/app/players/[id]/stats/page.tsx` | Gates, fetches the raw rows, hands them to `PlayerStatsClient` (§4.1) |
| `src/components/ui/SiteNav.tsx`, `src/components/ui/MobileTabBar.tsx` | "My Players" in Captains' Corner, "Captaincy Records" in Council |

---

## 7. Out of scope / ideas

- Filters beyond season on the captain view (tournament, format, ground).
- Ground and Include-Practice-Games filters on the player view's "Under
  each captain" section — see §4.1's table. `getCaptaincyInnings()` would
  need a `ground_id` select to close the Ground gap; the Practice gap is
  structural (practice matches are never fetched into this feature at all).
- A per-position view for the player that isn't split by captain. The
  existing "Runs by Batting Position" chart already covers it.
- Fielding by captain.
- Letting a captain see another captain's record.
- Syncing "Under each captain" with the two chart-click filters
  (`selectedPosition`/`selectedDismissal`) — explicitly declined per the
  September 2026 request that added §4.1; those narrow Batting/Bowling
  specifically, not "who captained this player."

---

*Maintained by: Spartans CC BLR*
