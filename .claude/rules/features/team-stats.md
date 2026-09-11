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

The first cut had everything in one file. `TeamFilterBar.tsx` and
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
  are two different questions.
- **Margin of victory**: runs when we batted first, wickets (10 −
  `team_wickets`) when we chased; `null` without toss data.
- **Opponent grouping key** is `opponents.id` once reconciled, else the
  normalised raw spelling — so two bookings typed identically still group
  together before anyone links them (`opponentKey()`).

Unit tests: `src/lib/teamStats.test.ts` (vitest) cover every aggregator
above against a hand-built fixture, including the toss double-bucketing,
practice exclusion, marquee pinning and the records/margin derivations.

---

## 3. Page — `src/app/team-stats/page.tsx`

Server Component, `revalidate = 0`, `--stats-*` tokens throughout (so it
follows Light/Dark/System like `/leaderboard`, `ui-theme.md`).

**Every filter is a `searchParams` key**, same URL-driven convention as
`LeaderboardFilters.tsx`, so any view is a shareable link:
`year`, `format` (`T20`/`T30`/`other`), `tournament`, `ground`,
`opponent` (an `opponentKey()`), `innings` (`defending`/`chasing`),
`stage` (`league`/`knockout`), `practice=1`, `by` (the split dimension).
Invalid/absent values fall back to "no restriction"; a `tournament`/
`ground`/`opponent` id not present in the data falls back to "all" rather
than rendering a `<select>` with no matching option.

Sections, top to bottom:

1. **Headline strip** — Played / Won / Lost / Win % tiles, then last-5
   form pills and the current streak.
2. **Marquee opponents — head to head** — pinned above whichever split is
   selected (hidden while the Opponent split itself is showing, to avoid
   listing them twice). Shows a "mark your rivals on Manage opponents"
   nudge to a manager if none are starred yet.
3. **Split by …** — `TeamSplitTable` for the chosen dimension. One table
   shape for every dimension: label · P · W · L · T/NR · Win % · form ·
   last played. **Every row expands** (`▸`) to the matches behind it —
   date, opponent (or tournament, on the Opponent split), both scores,
   format, bat-1st/chased, result + margin — each linking to
   `/matches/history/[bookingId]`. Marquee rows carry a pill; an opponent
   row grouped only by raw spelling carries an "unlinked" hint.
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
4. **Records** — up to eight cards (highest/lowest total, highest
   successful chase, lowest total defended, biggest win by runs / by
   wickets, highest/lowest total conceded), each linking to its match.
5. **Recent matches** — last five, linking to Match History.

The hero links across to `/leaderboard` and, for a manager, to
`/opponents` with a live count of unlinked spellings in the current view.

Components: `src/components/team/TeamFilterBar.tsx` (client — pushes
searchParams), `src/components/team/TeamSplitTable.tsx` (client — the
expandable table, plus the shared `FormPills` and `MatchList` used by the
headline strip and Recent matches).

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
| `src/lib/teamStatsCore.ts` | Pure types/filters/aggregators — client-safe (§2) |
| `src/lib/teamStats.ts` | `getTeamMatches()` fetch; re-exports the core (§2) |
| `src/lib/teamStats.test.ts` | Vitest coverage of the aggregators |
| `src/lib/opponents.ts` | `normaliseOpponentName()`, `resolveOpponentIdByName()`, `linkSpellingToOpponent()`, `AliasConflictError` (§5) |
| `src/lib/schemas.ts` | `opponentCreateSchema`, `opponentUpdateSchema`, `opponentLinkSchema` |
| `src/app/team-stats/page.tsx` | The Team Record page (§3) |
| `src/components/team/TeamFilterBar.tsx` | URL-driven filter bar + "Split by" pills |
| `src/components/team/TeamSplitTable.tsx` | Expandable split table, `FormPills`, `MatchList` |
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
| Per-opponent detail page | The Opponent split + `?opponent=` filter cover H2H today; a dedicated `/opponents/[id]` page with the full match list, records vs them and top performers vs them would be the natural next step. |
| No way back from a tapped match (installed PWA) | Reported here first: tapping a match opens `/matches/history/[bookingId]`, whose only exit is a hardcoded "← Past Matches" link — wrong when you came from Team Record, and the standalone PWA has no browser back button. Hub-wide gap, documented with a plan in `features/back-navigation.md` (backlog U-31). Team Record itself is already URL-driven, so once `BackButton` lands, back returns to the exact split and filters. |

---

*Maintained by: Spartans CC BLR*
