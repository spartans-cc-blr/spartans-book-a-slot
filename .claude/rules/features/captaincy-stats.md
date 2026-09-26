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
  "Captain not recorded" always last. Positions within a captain are ordered
  by innings played there.

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
  `buildSeasonProgression()`, `battingLine()` and `bowlingLine()` are the
  pure aggregators.

No new table, migration or API route. Both views are Server Components that
fetch directly.

---

## 4. UI

- **`/captains-corner/my-players`**: season pills (All time plus each year
  with data, `?year=`, navigated with `replace`), a match count and date
  range, then `CaptainRecordView`: a card per position with ranks 1–3 (name,
  runs, innings, average, strike rate, best), and a bowlers table (overs
  with a share bar, innings, wickets, economy, average, best). GC/admin get
  `CaptainSelect` (`?captainId=`, also `replace`). `back` goes to Squad
  Selection.
- **"Under each captain"** (`PlayerCaptaincyBreakdown`, below the main stats
  on `/players/[id]/stats`): one collapsible card per captain (the first is
  open). Each card shows position chips (innings, runs, average, strike
  rate), batting and bowling lines, and the progression strip: a runs bar per
  innings, oldest to latest, labelled with the position, plus wickets/runs
  chips for bowling. Each bar and chip links to that match. A captain the
  player never batted under reads "Did not bat" in the card header rather
  than "0 runs". A "Season by season" table follows with batting innings,
  usual position, runs, average, strike rate, overs, wickets and economy.
  It is all-time and doesn't follow the page's own filters.
- **Usual position, not average position (changed September 2026).** The
  season table first showed matches played and the average batting
  position. Both were replaced on feedback: matches counted games where the
  player didn't bat, and an average position (8.9, say) tells neither a
  captain nor a player where he actually bats. The table now shows batting
  innings ("Inn") and the most-played position with its innings count
  ("No. 6 (5)"). A tie goes to the higher order (lower number).

Both use the shared `--stats-*` tokens, so they follow Light/Dark/System.

---

## 5. Security (vibe-security)

| Check | Status |
|---|---|
| Page gate `isCaptain \|\| isGC \|\| isAdmin`, server-side | ✅ |
| A captain can only ever see their own matches. `?captainId=` is ignored unless GC/admin, and a GC/admin value is validated against the real captain list | ✅ |
| Player breakdown fetched only when the viewer is that player or GC/admin. For anyone else the data never leaves the server | ✅ |
| Read-only, no write path, no new API route | ✅ |
| Analytics DB read server-side only (`ANALYTICS_SUPABASE_KEY`) | ✅ |
| A breakdown fetch failure is logged and hides the section. It never breaks the stats page | ✅ |

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
| `src/app/players/[id]/stats/page.tsx` | Gates, fetches and renders the breakdown |
| `src/components/ui/SiteNav.tsx`, `src/components/ui/MobileTabBar.tsx` | "My Players" in Captains' Corner, "Captaincy Records" in Council |

---

## 7. Out of scope / ideas

- Filters beyond season on the captain view (tournament, format, ground).
- A per-position view for the player that isn't split by captain. The
  existing "Runs by Batting Position" chart already covers it.
- Fielding by captain.
- Letting a captain see another captain's record.

---

*Maintained by: Spartans CC BLR*
