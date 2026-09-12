# Team Record — Team-Level Stats, Knockout Flag & Opponent Master

**Spartans Hub · `/team-stats` · `/opponents` · Added: September 2026**

---

## 1. Overview

Every stats surface before this was per-player (`/players/[id]/stats`,
`/leaderboard`). **Team Record** (`/team-stats`) is the club's own
win/loss record, sliced every way the data allows:

| Ask | Where it shows |
|---|---|
| Win/loss % by tournament, ground, format, year, month, slot time, captain | "Split by" table, one dimension at a time |
| Marquee opponents + head-to-head vs any opponent | Pinned "Marquee opponents" section + the Opponent split; backed by the new opponent master (§5) |
| Highest / lowest team total, best chase, lowest defended, biggest wins, totals conceded | Records cards |
| Chasing vs defending | Innings split + Defending/Chasing filter |
| League vs knockout | Stage split + filter, backed by the new `bookings.stage_type` flag (§4) |
| Toss | Toss split (won/lost the toss; chose to bat/field) |
| Current form | Last-5 pills + current streak in the headline strip |

Reached from the desktop **Stats ▾** dropdown (Yours Statistically · Team
Record) and the mobile More sheet's "Team Record" row. Same access gate as
`/leaderboard`: any signed-in, non-expelled member. Read-only.

**Three product decisions recorded up front (September 2026):**

1. **Separate page, not a fourth tab on `/leaderboard`.** That page is
   player-shaped (qualification thresholds, milestone cards, glossary) and
   its filter bar has no opponent/stage/toss axis. Team Record reuses its
   `--stats-*` theme tokens and hero layout so the two read as one stats
   area, but is its own route.
2. **Hub-linked matches only.** A match counts if it has a confirmed
   booking with a `match_id` whose scorecard has synced into
   `match_stats_cache` (109 at the time of writing). The ~170 older
   analytics-DB matches that predate the Hub have no booking, and so no
   format/ground/stage/opponent identity — including them would need
   bookings backfilled first. This is the same `bookings.match_id ↔`
   analytics `match_id` bridge every player-stats surface uses, so Team
   Record and the leaderboard can never disagree on which matches count.
3. **Opponent management is a shared responsibility** — captains, GC and
   wranglers all manage `/opponents`, reachable from all three of their
   nav dropdowns (§5).

---

## 2. Data layer — `src/lib/teamStats.ts` + `src/lib/teamStatsCore.ts`

Split in two on purpose, after a `next build` failure:

| File | Contents | Importable from |
|---|---|---|
| `teamStatsCore.ts` | `TeamMatch` type, `normaliseResult()`, `applyFilters()`, `summarize()`, `recentForm()`, `currentStreak()`, `splitBy()`, `computeRecords()`, `winMargin()`, `filterOptions()`, `opponentKey()`, `SPLIT_LABEL` — **pure functions, no server imports** | Anywhere, including `'use client'` components |
| `teamStats.ts` | `getTeamMatches()` — the one fetch; `export *` of the core | Server Components / routes only |

The first cut had everything in one file. `TeamFilterBar.tsx` (since
replaced by `TeamFilterPanel.tsx`, §3.1) and
`TeamSplitTable.tsx` (both `'use client'`) imported a constant and two
formatters from it, which pulled `createAnalyticsClient` →
`playerIdentityResolution.ts` → `matchStatsSync.ts` → `webpush.ts` into the
browser bundle and failed the build with `Can't resolve 'net'`. Same class
of mistake as `features/leaderboard.md` §8's RSC-boundary incident, in the
other direction (server code reached from a client file, rather than a
client file reached from server code). Rule of thumb: anything a client
component needs goes in `teamStatsCore.ts`.

### `getTeamMatches()` — one fetch, then slice in memory

1. `bookings` — `status = 'confirmed'`, `match_id IS NOT NULL`, with embeds
   `tournaments!bookings_tournament_id_fkey(id, name, is_practice)`,
   `grounds!bookings_ground_id_fkey(id, name)`,
   `opponents!bookings_opponent_id_fkey(id, name, is_marquee)` (explicit
   FK hints, per `security.md`'s PostgREST-ambiguity note).
2. `match_stats_cache` for those booking IDs (result, both totals/wickets/
   overs, the scorecard's own `opponent_name` as a fallback spelling) — a
   booking with no cache row is dropped, which is what "synced" means.
3. `squad` rows with `is_captain = true` → match captain per booking (the
   match-specific designation, not `players.is_captain`, see
   `features/squad-selection.md` §3).
4. Analytics DB `match_stats.toss_won / toss_decision` for those
   `match_id`s — 100% coverage on every synced match at the time of
   writing. `battedFirst` is derived the same way `deriveBattedFirst()`
   in `playerStats.ts` does it. **Not copied into `match_stats_cache`** —
   the existing Defending/Chasing filters on `/leaderboard` and
   `/players/[id]/stats` already read toss from the analytics DB at
   request time (`getInningsMatchIds()`), so this follows that precedent
   rather than adding two cache columns plus a sync change and backfill.
   Worth revisiting only if this one extra query ever shows up in latency.

All four reads are chunked `.in()` calls (200 IDs each) fired in
parallel. At the club's scale (low hundreds of matches, ever) one fetch +
in-memory `applyFilters()`/`splitBy()` is both simpler and faster than a
query per split, and means every number on the page is one tap from the
matches that produced it (§3).

### Conventions baked into the aggregators

- **Win %** = won ÷ (won + lost + tied) — no-results excluded, the usual
  cricket convention. `null` (rendered "–") when nothing is decided.
- **Form / streak** read newest-first regardless of input order; a
  no-result neither extends nor breaks a streak.
- **Practice games** (`tournaments.is_practice`) excluded by default,
  "Include practice" checkbox opts in — same posture as `/leaderboard` §10.
- **Unclassified `stage_type` counts as league** (§4).
- **Toss split** puts a toss-winning match in two buckets — the outcome
  (won/lost the toss) and the decision (chose to bat/field) — since those
  are two different questions. The toss *filter* is won/lost only (§3.2).
- **Every dimension is both filterable and splittable** (§3.2), and
  `splitByNested()` composes two of them; a match that a dimension can't
  group (no toss data) drops out of both its filter and its split.
- **Margin of victory**: runs when we batted first, wickets (10 −
  `team_wickets`) when we chased; `null` without toss data.
- **Opponent grouping key** is `opponents.id` once reconciled, else the
  normalised raw spelling — so two bookings typed identically still group
  together before anyone links them (`opponentKey()`).
- **Split rows default to Win % descending** (changed September 2026, was
  Played descending) — a group with nothing decided yet (`winPct === null`)
  sorts last, never first, since `null` has no rank to offer. This is the
  default *comparator* inside `splitBy()`, so it applies to every
  categorical dimension (tournament, ground, opponent, format, captain,
  innings, stage) uniformly — three dimensions keep their own fixed order
  regardless: `year`/`month` (newest first, still a timeline) and `slot`
  (chronological by time-of-day), plus `toss`, which follows a fixed
  logical sequence (won → lost → the two toss-winner decisions) rather
  than a ranking. Marquee opponents still pin ahead of everything else on
  the Opponent split, same as before.

Unit tests: `src/lib/teamStats.test.ts` (vitest) cover every aggregator
above against a hand-built fixture, including the toss double-bucketing,
practice exclusion, marquee pinning and the records/margin derivations.

---

## 3. Page — `src/app/team-stats/page.tsx`

Server Component, `revalidate = 0`, `--stats-*` tokens throughout (so it
follows Light/Dark/System like `/leaderboard`, `ui-theme.md`).

**Every filter is a `searchParams` key**, same URL-driven convention as
`LeaderboardFilters.tsx`, so any view is a shareable link:
`year`, `month` (`YYYY-MM`), `format` (`T20`/`T30`/`other`), `tournament`,
`ground`, `opponent` (an `opponentKey()`), `captain` (a `captainKey()`),
`slot` (`HH:MM`), `innings` (`defending`/`chasing`), `toss` (`won`/`lost`),
`stage` (`league`/`knockout`), `practice=1`, `by` (the split dimension) and
`then` (the second-level split, §3.2). Invalid/absent values fall back to
"no restriction"; a `tournament`/`ground`/`opponent`/`captain`/`month`/
`slot` value not present in the data falls back to "all" rather than
rendering a `<select>` with no matching option. The URL shape lives
in one pure module, `src/lib/teamStatsFilters.ts` (`TeamFilterState`,
`buildTeamStatsHref()`, `toTeamFilters()`, `clearFilter()`, …), imported by
both the Server Component and the client panel below so the two can never
disagree on what a link means. Unit-tested in `teamStatsFilters.test.ts`.

### 3.1 Filter panel — `TeamFilterPanel.tsx` (reworked September 2026)

The first cut rendered every filter inline above the numbers: seven
`<select>`s, a checkbox and eleven "Split by" pills, stacked. On a phone
that was the entire first screen — the record itself (Played 103 · Won 55)
only appeared below the fold, and every select change was its own server
round-trip. Reported with a screenshot the same day it shipped; replaced by
`TeamFilterShell`, which wraps the whole results column:

- **Summary row** (all widths) — a "Filters · N" button plus one removable
  chip per active filter ("2026 ✕", "Thunder 5 ✕", "Practice included ✕")
  and a "Clear all". Removing a chip navigates immediately. With nothing
  applied it reads "All matches — no filters applied", so the current view
  is always legible without opening anything.
- **Desktop (`md+`)** — the panel is a persistent left aside (`sticky`,
  272px) beside the results; "‹ Hide" collapses it and the summary row's
  Filters button brings it back.
- **Mobile** — the same panel as a bottom sheet (scrim, drag handle,
  Escape/scrim-tap to close, body scroll locked while open — the idiom
  `MobileTabBar`'s "More" sheet already established, and within thumb
  reach). It was deliberately *not* a left-edge drawer: that competes with
  the iOS edge-swipe gesture and with the app's own "‹ Back" affordance in
  the top-left (`features/back-navigation.md`).
- **Progressive "+ Add filter"** inside the panel — the panel only shows
  the filters that are set; "+ Add filter" lists the rest (Season,
  Tournament, Ground, Opponent, Format, Defending / Chasing, League /
  Knockout, Practice games), and picking one adds its row with a select.
  Adding "Practice games" just means *include them* (there's no value to
  pick), so it toggles straight on.
- **Staged, applied once.** Edits go into a local draft; the footer button
  reads **"Show N matches"** and pushes one URL (`buildTeamStatsHref`) when
  tapped, so a five-filter change is one navigation instead of five. The
  live N is `applyFilters()` over the unfiltered match list the page hands
  down — cheap, because that function lives in the client-safe
  `teamStatsCore.ts` (§2). When the draft equals the URL the button is
  inert and reads "Showing N matches"; a "Reset" link discards a dirty
  draft, and closing the sheet discards it too. The draft resyncs whenever
  the applied href changes (apply, chip removal, browser back).
- **Split by** stays *outside* the panel — it's the primary interaction on
  this page — as `SplitByRow`: one horizontally scrolling row of link pills
  directly above the split table, with the active pill scrolled into view
  on mount. Plain `<Link>`s (`scroll={false}`), since switching dimension
  is a cheap re-render of already-fetched data.

Net effect: the first screen is hero → segmented tabs → one chip row →
Played/Won/Lost/Win % → form, and the panel is one tap away.

### 3.2 Two dimensions at once (added September 2026)

The first cut split the dimensions across two controls: eight were
filters, eleven were splits, and only some were both. That made a
genuinely common question unanswerable — "which captain performs how,
based on the toss" needs captain *and* toss together, and toss existed
only as a split. Closed two ways, deliberately both, since they suit
different shapes of question:

**Every dimension is now filterable.** Toss (won / lost), Captain, Month
and Slot time joined the filter set, so the filter and split lists are
finally symmetric — narrow on one dimension, split by the other, and flip
the chip to see the other side. Notes on the four:

- **Toss** offers only won/lost, not the decision. "Chose to bat" is
  already the Defending/Chasing filter, and offering both would be two
  controls for one question. The *split* still shows all four buckets.
- A match with **no toss data** satisfies neither side of a toss filter
  and drops out entirely — the same treatment the toss and innings
  *splits* already give it (`groupsFor()` returns no group for it).
- **Captain** keys on the squad row's player id via `captainKey()`, with a
  single `unknown` bucket for a booking whose captain was never recorded.
  That's surfaced rather than hidden: it's a real data gap a wrangler can
  fix, and it sorts last in the option list rather than alphabetically
  among real names.
- **Month** values are `YYYY-MM` and labelled "Sep 2026", so a month and a
  season filter set together read consistently. They AND like every other
  pair, so an inconsistent pair gives zero matches and the chips show why.

**And a second-level split, "then by"** (`?then=`) — a second pill row
under Split by, offering every dimension except the primary one plus
"None". `splitByNested()` (`teamStatsCore.ts`) runs `splitBy()` again over
each row's own matches; a `then` that is absent or equal to `by` returns a
plain single-level split, so a caller can pass whatever the URL says
without checking first. Expanding a primary row then shows one sub-row per
second-dimension group, each with its own P/W/L/T-NR/Win %/form/last, and
each expanding again to the matches behind it — so no summary is ever more
than two taps from its matches, the same rule the top level follows.

Sub-rows render as real `<tr>`s in the same table rather than a nested
table, so every column stays aligned with the parent. Two behaviours worth
knowing:

- **A "Not recorded" sub-row appears when the second dimension leaves
  matches ungrouped** (`withUncovered()` in `TeamSplitTable.tsx`). Toss and
  Defending/Chasing give a match with no toss data no group at all, and
  once a "then by" is chosen the parent row no longer lists its matches
  directly — without this they would be unreachable.
- **Toss sub-rows can sum to more than their parent's P**, because the toss
  dimension deliberately puts a toss-winning match in both a "Won the toss"
  and a "Won toss & chose to …" bucket, exactly as it does at the top
  level. The Total footer is unaffected: it still counts distinct matches
  across the *primary* rows only.

**Capped at two levels on purpose.** Three-deep nesting stops being
readable in one table, and the filters cover any further narrowing.

**A pivot matrix was considered and not built** — captains as rows, toss
outcomes as columns. It only reads well when the second dimension has a
handful of values (toss does; opponent or tournament does not, giving a
wide, mostly-empty grid needing horizontal scroll on a phone), and the
nested split answers the same question in the table shape that already
works at every width. Worth revisiting for the low-cardinality pairs if
the nested split proves awkward in use.

### 3.3 Section order (reordered September 2026)

Sections, top to bottom — reordered on request so the most-often-checked
numbers (form, recent results, records) come before the slice-and-dice
controls, and the marquee highlight moved to where it's actually relevant:

1. **Headline strip** — Played / Won / Lost / Win % tiles, then last-5
   form pills and the current streak.
2. **Recent matches** — last five, linking to Match History. Moved up
   (was last) to sit directly under Current form, since both answer the
   same "what's happened lately" question.
3. **Records** — up to eight cards (highest/lowest total, highest
   successful chase, lowest total defended, biggest win by runs / by
   wickets, highest/lowest total conceded), each linking to its match.
   Moved up from below the split table.
4. **Split by / Then by, then the table** — `SplitByRow` (§3.1/§3.2), the
   Marquee highlight when applicable (below), then `TeamSplitTable` for
   the chosen dimension. One table shape for every dimension: label · P ·
   W · L · T/NR · Win % · form · last played. **Every row expands** (`▸`)
   to the matches behind it, or to the second-dimension sub-rows when a
   "then by" is chosen (§3.2) — date, opponent (or tournament, on the
   Opponent split), both scores, format, bat-1st/chased, result + margin —
   each linking to `/matches/history/[bookingId]`. An opponent row grouped
   only by raw spelling carries an "unlinked" hint; on the Opponent split a
   one-line note under the table gives the unlinked count and, for a
   manager, the "⚔️ Manage opponents →" link (see the hero note below for
   why it lives here now).
   **A "Total" footer row** (added the same day, on request) closes every
   split with the aggregate P/W/L/T-NR/Win %/form/last-played across the
   rows above it — computed from the *distinct* matches behind those rows
   (`summarize()` over a `bookingId`-deduped set), not by summing the rows,
   since the Toss split deliberately puts a toss-winning match in two
   buckets. Hidden when the split has a single row (it would just repeat
   it). This total can differ from the headline strip on purpose: the
   Innings and Toss splits drop matches with no toss data, so their total
   is "of the matches we have toss data for", while the headline counts
   every filtered match.

**Marquee opponents — now Opponent-split-only, not pinned everywhere
(changed September 2026).** The original design pinned a marquee
head-to-head preview above *whichever* split was currently selected,
hiding only when the Opponent split itself was already showing (to avoid
listing the same rivals twice). Per a direct request, this inverted: the
marquee table now renders **only when Opponent is the chosen split**, and
sits directly above the full opponent table rather than above an unrelated
split like Captain or Format — a marquee preview above a Captain table
answered a question the viewer wasn't asking.

- `marquee` is now computed only when `state.by === 'opponent'`
  (`splitBy(matches, 'opponent').filter(r => r.meta?.isMarquee)`), instead
  of whenever `by !== 'opponent'`.
- Rendered inside the same `<section>` as `SplitByRow`/`TeamSplitTable`,
  between the pills and the full table — a small "Marquee opponents"
  heading, `TeamSplitTable` scoped to just the marquee rows
  (`hideMarqueeBadge showTotal={false}`, see below), or the "mark your
  rivals" nudge to a manager when none are starred yet.
- **This does duplicate marquee rows** between the small highlight table
  and the full opponent table below it — `splitBy()` already pins marquee
  rows to the top of the Opponent split (§2). That's intentional, the same
  "highlight snippet above the full detail" convention the Honour Board
  uses for its own tied cards vs. detailed tables — not something to
  de-duplicate away.
- **The "Marquee" badge is suppressed inside the highlight table**
  (`TeamSplitTable`'s new `hideMarqueeBadge` prop, threaded to `RowGroup`) —
  every row in that table is definitionally marquee, so the pill would
  just repeat the section heading. The full opponent table below still
  shows the badge, since it's the one place marquee and non-marquee rows
  sit side by side. `showTotal={false}` on the highlight table too — a
  "Total" footer duplicating a subset of the real table right below it
  added nothing.
- The old `/team-stats?by=opponent` deep link in the section heading was
  dropped along with the "All opponents →" label — redundant now that the
  section only ever renders while already on the Opponent split.

**Hero (changed September 2026).** The first cut's hero carried two text
links — "Player stats — Yours Statistically →" and, for a manager,
"⚔️ Manage opponents (N unlinked)". Both were flagged as not belonging
there: the hero is the page's identity, not a link bin. Now:

- The cross-link to player stats is `StatsSegmentedTabs`
  (`src/components/stats/StatsSegmentedTabs.tsx`) — a two-pill
  "Yours Statistically | Team Record" control rendered under the `<h1>` on
  **both** stats pages, the same shape `MatchesSegmentedTabs` gives
  Upcoming / Past Matches. Two real routes, `active` passed in by each
  page; reads the `--stats-*` tokens (active pill white-on-accent in light,
  ink-on-gold in dark). The Stats ▾ dropdown and the More sheet still cover
  navigation, so nothing was lost by dropping the sentence.
- "Manage opponents" moved to where the data it fixes is visible: the note
  under the Opponent split's table (above), and the marquee section's
  empty-state nudge. It's also in the Captains' Corner / Council /
  Wrangler menus (§6) for direct access.

Components: `src/components/team/TeamFilterPanel.tsx` (client —
`TeamFilterShell` + `SplitByRow`, §3.1), `src/components/team/TeamSplitTable.tsx`
(client — the expandable table, plus the shared `FormPills` and `MatchList`
used by the headline strip and Recent matches),
`src/components/stats/StatsSegmentedTabs.tsx` (server — the two-pill stats
switcher, shared with `/leaderboard`).

### 3.4 Multiple rows stay expanded at once (changed September 2026)

`TeamSplitTable`'s top-level rows were a single-row accordion — tapping a
new row silently collapsed whichever one was already open, so comparing
two rows (say, two tournaments' form) meant tapping back and forth and
holding one row's numbers in your head. Per a direct request ("helps to
compare one row with other"), row expansion is now fully independent: each
row toggles open/closed on its own tap and stays open until tapped again,
with no cap on how many can be open simultaneously — the "cap at the last
two" fallback floated alongside the request wasn't needed, since a club's
own split (never more than a few dozen rows) has no real rendering cost to
letting all of them stay open at once, and an unbounded `Set<string>` of
open keys is simpler to get right than tracking an eviction order.

`open` (the top-level expand state in `TeamSplitTable`) changed from
`useState<string | null>` to `useState<Set<string>>`, with a small
`toggleOpen(key)` helper that adds/removes a key from the set. `isOpen` for
a row is now `open.has(r.key)` instead of `open === r.key`. The same
treatment was applied to `openSub` inside `RowGroup` — the second-level
"then by" sub-rows (§3.2) — for consistency, since the same "compare one
against another" rationale applies there too (e.g. comparing two toss
outcomes within one captain's row); it was already scoped per parent-row
instance (so sibling top-level rows never shared sub-row state), only the
single-open-within-one-row-group behaviour changed.

Purely a client-side state change — no new prop, no data-layer change, no
effect on `applyFilters()`/`splitBy()`/`splitByNested()` or what's rendered
inside an open row.

---

## 4. Knockout flag — `bookings.stage_type` (migration 076)

`text CHECK IN ('league','knockout')`, nullable. **A new column, not a
parse of `match_stage`** — `match_stage` is the free-text, player-facing
narrative hint ("Tournament Opener", "Cash Prize", "Game of
Opportunities", "Semi Final") that `features/knockout-day-protection.md`
§4 already says must never be overloaded as a machine-readable signal.
`stage_type` is the machine-readable one; `match_stage` is untouched.

- **Admin form** — a "Game Type" toggle (Not set / 🎖️ League / 🏆
  Knockout, `src/components/admin/StageTypeToggle.tsx`) directly under
  Match Stage on both `/admin/bookings/new` and `/admin/bookings/[id]`.
- **API** — `POST /api/bookings` and `PATCH /api/bookings/[id]` accept
  `stage_type` and 400 on any value other than `league`/`knockout`/null.
- **NULL means unclassified and is treated as league** by Team Record —
  the club's default game is a league game; a knockout has to be
  declared, never inferred.
- **One-off backfill** (in the migration itself, reviewed by hand before
  applying): existing bookings whose `match_stage` unambiguously names a
  knockout round (`%final%`, `%qualifier%`, `%eliminator%`, `%knockout%`,
  `%play-off%`) were set to `knockout` — 8 rows on 11 Sep 2026 (Quarter
  Final, Qualifier, Final, Semi Final ×3, Qualifier 2 ×2). "Cash Prize" /
  "Last League" / "Tournament Opener" deliberately not matched.
- Never read by the R1–R8 booking rules engine. R7 still keys off
  `block_reason` for knockout *holds* (a different concept — a slot held
  for a not-yet-scheduled knockout), unchanged.

---

## 5. Opponent master — `opponents`, `opponent_aliases`, `bookings.opponent_id` (migration 077)

**Why:** `opponent_name` is free text on both `bookings` and
`match_stats_cache` — 109 synced matches carried 93 distinct spellings, so
"how do we do against X" was unanswerable. Same problem
`features/player-identity-resolution.md` solved for player names, same
shape of solution: a canonical table plus an alias table.

### Schema

- `opponents` — `id, name, is_marquee, cricheroes_team_url, notes,
  created_by, created_at, updated_at`; unique on `lower(btrim(name))`.
- `opponent_aliases` — `opponent_id, alias, created_by`; unique on
  `lower(btrim(alias))` — a raw spelling can only ever point at one
  opponent. The canonical name itself is always written as an alias too.
- `bookings.opponent_id` — nullable FK, `ON DELETE SET NULL`.
- RLS: `opponents` has a public SELECT policy (same as `grounds` —
  opponent names already show on public fixture cards, nothing new to
  protect on read); `opponent_aliases` has no policies (service role
  only). All writes go through the API.

### Resolution — `src/lib/opponents.ts`

- `normaliseOpponentName()` — lower/trim/collapse-whitespace, matching
  the DB indexes exactly so JS and DB can never disagree on "the same
  spelling".
- `resolveOpponentIdByName()` — alias match, then canonical-name match,
  **exact (normalised) only, never fuzzy**. Called from `POST /api/bookings`
  and `PATCH /api/bookings/[id]` (whenever `opponent_name` is part of the
  save), so a booking typed with an already-known spelling links itself.
  A client-supplied `opponent_id` is stripped in PATCH — it is always
  server-derived.
- `linkSpellingToOpponent()` — writes the alias (idempotent) and
  back-fills `bookings.opponent_id` on every confirmed booking currently
  carrying that spelling with no opponent yet. A spelling already aliased
  to a *different* opponent throws `AliasConflictError` → 409 (fix the
  master list first, never silently re-point history). Bookings are
  filtered in JS on the normalised spelling — PostgREST can't express
  `lower(btrim())`, and the table is small.

### API — `/api/opponents`, `/api/opponents/link`

| Route | Method | Auth | Purpose |
|---|---|---|---|
| `/api/opponents` | GET | Any signed-in, non-expelled member | Master list with aliases + match counts, plus the **unlinked queue**: every distinct normalised `opponent_name` on a confirmed booking with no `opponent_id`, most-played first, each with up to 3 fuzzy suggestions (`suggestPlayers()` from `src/lib/nameMatch.ts`, reused as-is — same Levenshtein threshold) |
| `/api/opponents` | POST | Captain / GC / wrangler / admin | Create (`opponentCreateSchema`); optional `link_name` links a raw spelling in the same call |
| `/api/opponents` | PATCH | Same | Edit name / marquee / CricHeroes team URL / notes (`opponentUpdateSchema`); a rename also aliases the new name |
| `/api/opponents/link` | POST | Same | `{ opponent_id, name }` → `linkSpellingToOpponent()` (`opponentLinkSchema`) |

Writes are rate-limited with `RATE_LIMITS.captainWrite`; the GET with
`publicRead`. Zod-validated, `.strict()` objects. No DELETE — an opponent
created by mistake is renamed/relinked rather than removed, since
`bookings.opponent_id` history hangs off it.

### Page — `/opponents` (`src/components/opponents/OpponentsClient.tsx`)

Reachable from **Captains' Corner ▾**, **Council ⚖** and **Wrangler ⚒**
(desktop) and the matching three mobile More-sheet sections. Page gate
`isCaptain || isGC || isWrangler || isAdmin` (redirects to `/team-stats`
otherwise) — visibility only; the routes above are the real gate.

1. **Unlinked spellings (N)** — the reconciliation queue. Per row: the
   spelling, match count, last played; then suggestion buttons (one tap
   links), a "Link to…" picker over the whole master list, and "＋ New
   opponent" (creates it and links this spelling at once).
2. **Master list (N)** — ★/☆ marquee toggle, name (links to Team Record
   filtered to that opponent), match count, CricHeroes link, known
   spellings, notes; inline edit; search; "＋ Add opponent" form.

### Data state at launch

Applied 11 Sep 2026: `opponents` and `opponent_aliases` start **empty**,
`bookings.opponent_id` all NULL — nothing was auto-seeded. Deliberately:
seeding 93 distinct spellings as 93 opponents would just move the
duplicates into the master list. The queue on `/opponents` is the intended
path — most rows link in one tap via the suggestions, and Team Record is
fully usable meanwhile (unlinked opponents group by exact spelling and
show an "unlinked" hint).

---

## 6. Navigation changes

- **Desktop `SiteNav`** — the flat "Stats" link became a **Stats ▾**
  dropdown (📊 Yours Statistically → `/leaderboard`, 🛡️ Team Record →
  `/team-stats`), rendered with the other dropdowns (after Captains'
  Corner ▾); highlighted for `activePage === 'leaderboard' || 'team-stats'`.
  "⚔️ Opponents" added as the last row of Captains' Corner ▾, Council ⚖
  and Wrangler ⚒ (`activePage === 'opponents'`).
- **Mobile `MobileTabBar`** — "Team Record" row after Leaderboard in the
  More sheet; "Opponents" row in each of the Captains' Corner / Council /
  Wrangler sections (new `SwordsIcon`); `team-stats` and `opponents`
  added to `isAdminOrGcHighlighted()` so the More tab lights up on both.

---

## 7. Security (vibe-security)

| Check | Status |
|---|---|
| `/team-stats` requires a signed-in, non-expelled session; read-only, no write path | ✅ |
| Every filter is validated server-side against the actual option list / enum before use — an unknown id or value falls back to "all" | ✅ |
| `/opponents` page gate is visibility only; `/api/opponents*` re-check captain/GC/wrangler/admin on every write | ✅ |
| All opponent writes Zod-validated (`.strict()`), rate-limited (`captainWrite`) | ✅ |
| `bookings.opponent_id` never client-supplied — stripped in PATCH, derived server-side from `opponent_name` in both booking routes | ✅ |
| `stage_type` validated to the enum in both booking routes (admin-only routes regardless) | ✅ |
| `opponents` public SELECT exposes only names/marquee/URL — already-public data; `opponent_aliases` service-role only | ✅ |
| Alias conflicts refuse (409) rather than silently re-pointing existing bookings | ✅ |
| Toss read from the analytics DB server-side only (`ANALYTICS_SUPABASE_KEY`), never from the client | ✅ |
| Client-safe module split (`teamStatsCore.ts`) — no server-only import reachable from a `'use client'` file; verified by `next build` | ✅ |

---

## 8. File Map

| File | Role |
|---|---|
| `supabase/migrations/076_bookings_stage_type.sql` | `bookings.stage_type` + one-off knockout backfill (§4) |
| `supabase/migrations/077_opponents_master.sql` | `opponents`, `opponent_aliases`, `bookings.opponent_id`, RLS (§5) |
| `src/lib/teamStatsCore.ts` | Pure types/filters/aggregators — client-safe (§2); `applyFilters()` covers every dimension and `splitByNested()` composes two of them (§3.2) |
| `src/lib/teamStats.ts` | `getTeamMatches()` fetch; re-exports the core (§2) |
| `src/lib/teamStats.test.ts` | Vitest coverage of the aggregators |
| `src/lib/teamStatsFilters.ts` + `.test.ts` | Pure URL ⇄ filter-state helpers (`TeamFilterState`, `buildTeamStatsHref`, `toTeamFilters`, chip labels) shared by the page and the panel (§3) |
| `src/lib/opponents.ts` | `normaliseOpponentName()`, `resolveOpponentIdByName()`, `linkSpellingToOpponent()`, `AliasConflictError` (§5) |
| `src/lib/schemas.ts` | `opponentCreateSchema`, `opponentUpdateSchema`, `opponentLinkSchema` |
| `src/app/team-stats/page.tsx` | The Team Record page (§3) |
| `src/components/team/TeamFilterPanel.tsx` | `TeamFilterShell` — chip summary row, desktop aside / mobile bottom sheet, progressive "+ Add filter", staged "Show N matches" apply; `SplitByRow` — the Split by / Then by scrolling pill rows (§3.1, §3.2) |
| `src/components/stats/StatsSegmentedTabs.tsx` | "Yours Statistically \| Team Record" two-pill switcher under both stats heroes (§3) |
| `src/components/team/TeamSplitTable.tsx` | Expandable split table — every row independently toggleable and stays open until tapped closed again (§3.4); includes the second-level sub-rows and their "Not recorded" fallback (§3.2), and `hideMarqueeBadge`/`showTotal` for the Marquee highlight table (§3.3); `FormPills`, `MatchList` |
| `src/app/opponents/page.tsx` + `src/components/opponents/OpponentsClient.tsx` | Opponent master + reconciliation queue (§5) |
| `src/app/api/opponents/route.ts` | GET / POST / PATCH |
| `src/app/api/opponents/link/route.ts` | POST — link a spelling |
| `src/app/api/bookings/route.ts`, `src/app/api/bookings/[id]/route.ts` | Accept `stage_type`; derive `opponent_id` server-side |
| `src/components/admin/StageTypeToggle.tsx` | League/Knockout toggle on both admin booking forms |
| `src/app/admin/bookings/new/page.tsx`, `src/app/admin/bookings/[id]/page.tsx` | Render the toggle, send `stage_type` |
| `src/components/ui/SiteNav.tsx`, `src/components/ui/MobileTabBar.tsx` | Stats ▾ dropdown, Team Record + Opponents entries (§6) |
| `src/types/index.ts` | `StageType`, `Opponent`, `Booking.stage_type` / `opponent_id` |

---

## 9. Pending / ideas

| Item | Notes |
|---|---|
| Reconcile the 93 existing spellings | Manual, via the `/opponents` queue — nothing auto-seeded (§5). Once done, the "unlinked" hints on Team Record disappear. |
| Pre-Hub matches (~170 in the analytics DB) | Out of scope by decision (§1). Including them needs bookings backfilled with format/ground/opponent first — `/admin/booking-backfill` is the existing tool for that. |
| Unlink / delete an alias | Not built — a mis-link is fixed by renaming/relinking. Add a DELETE on `/api/opponents/link` if it comes up. |
| Toss columns on `match_stats_cache` | Not needed today (§2); revisit only if the extra analytics-DB read shows up in latency. |
| Pivot matrix for low-cardinality pairs | Considered and not built (§3.2) — the nested "then by" split covers the same two-dimension questions in a table shape that already works at phone width. Revisit for pairs like captain × toss if the nested split proves awkward in real use. |
| Per-opponent detail page | The Opponent split + `?opponent=` filter cover H2H today; a dedicated `/opponents/[id]` page with the full match list, records vs them and top performers vs them would be the natural next step. |
| No way back from a tapped match (installed PWA) | ✅ Fixed 11 Sep 2026 — reported here first, fixed Hub-wide: `/matches/history/[bookingId]` (and every other drill-down) now renders the shared `BackButton`, which `router.back()`s to wherever the player came from — Team Record with the exact split and filters, since this page is URL-driven — and falls back to "‹ Past Matches" for a cold open. See `features/back-navigation.md` (backlog U-31). |

---

*Maintained by: Spartans CC BLR*
