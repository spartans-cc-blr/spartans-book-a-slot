# Player Directory — `/players`

**Spartans Hub · Added: September 2026**

---

## 1. Overview

A club-wide player directory: any signed-in, non-expelled member can find
any player and tap through to their full stats page (`/players/[id]/stats`).
Before this, `/players/[id]/stats` was already open to every member, but
there was no way to *reach* a player except by tapping their name wherever
it happened to appear (a leaderboard row, a squad list, a scorecard). A
player who hadn't played recently and wasn't near the top of any board was
effectively unreachable.

**Repurposed from the GC-only Squad Register (`/gc-players`).** That page
(see `gc-players.md`) was the only player list in the app, but it was
GC/admin-only and built around admin-style fields (active/inactive status,
wallet balance, a dues filter). Per a direct request it was turned into
this directory instead:

- **Removed:** status (Active/Inactive/Expelled filter and badges), wallet
  balance, and the "Dues outstanding" toggle.
- **Added:** a name/jersey-name search box, and per-card career highlights
  (§3) — the numbers that stand out for that player.
- **Kept:** photo/initials avatar, jersey number and name, skill pills,
  Captain badge, A–Z bar, "Last played" date.

`/gc-players` now just `redirect('/players')`, so old links still work.
GC-only members no longer have an in-app view of the roster's wallet
balances or dues. Admins still have `/admin/players` and `/admin/wallet`.

---

## 2. Access & data exposure (vibe-security)

| Check | Status |
|---|---|
| Signed-in session required (redirect to `/login`), expelled → `/` | ✅ |
| Select limited to public-profile fields: `id, name, photo_url, jersey_name, jersey_number, primary_skill, secondary_skill, is_captain` | ✅ No wallet, status, gmail, dob, whatsapp, blood group |
| Expelled players excluded server-side (`.neq('status', 'expelled')`) | ✅ |
| No write path, no new API route | ✅ Server Component reads via `createServiceClient()` |
| Career stats are the same numbers already public on every `/players/[id]/stats` page | ✅ |

`/gc-players` was removed from `middleware.ts`'s matcher, since it's only a
redirect now. `/players` does its own session check, like `/leaderboard`
and `/team-stats`.

---

## 3. Career highlights

### Data — `getCareerHighlightsByPlayer()` (`src/lib/playerStats.ts`)

Makes one analytics round trip for the whole roster (4 paginated tables via
`fetchAnalyticsRows()`), never one per player. The match scope is the same
as the leaderboard's "All time" view and a player's own career stats
(`getScopedMatchIds({})`): confirmed Hub bookings only, with practice games
excluded. Pre-Hub analytics matches with no booking aren't counted, the
same as everywhere else. Per player it returns `CareerHighlights`:
matches, runs, batting innings/average, wickets, bowling average
(runs conceded ÷ wickets), dismissals (catches + caught behind + run outs +
stumpings), **highest score** (most runs; a not-out wins on equal runs, then
fewer balls) and **best bowling** (most wickets, then fewest runs).

It's best-effort. If the analytics DB errors, the page still renders as a
plain name lookup, with every card showing "No synced stats yet".

### Selection — `pickHighlights()` (`src/lib/playerHighlights.ts`, client-safe)

Every candidate is scored against a "genuinely good" club benchmark so the
scores are comparable across kinds. Each of these scores 1.0:

| Highlight | Scores 1.0 at | Shown only when |
|---|---|---|
| Highest score (`87* (52)`) | 50 runs | ≥ 1 run |
| Best bowling (`4/18`) | 3 wickets | ≥ 1 wicket |
| Batting avg | 30 | ≥ 5 innings (`MIN_INNINGS_FOR_BAT_AVG`) |
| Bowling avg | 20 (lower is better, `20 / avg`) | ≥ 8 wickets (`MIN_WICKETS_FOR_BOWL_AVG`) |
| Career runs | 500 | ≥ 100 |
| Wickets | 25 | ≥ 5 |
| Dismissals | 15 | ≥ 5 |

The top three by score are kept. The first is the card's **headline** (big
gold number plus its label); the other two appear as a small line under it.
The result is that a batter with a century leads with it, a bowler's
five-for leads over a modest top score, and a veteran whose single best
innings is ordinary leads with career runs. The sample-size floors keep a
tiny sample from producing a flashy average. Unit tests are in
`src/lib/playerHighlights.test.ts`.

---

## 4. UI — `PlayerDirectoryGrid.tsx`

Client component. It has a search box (name or jersey name, which resets
the letter filter), an A–Z bar (letters with no matches under the current
search are disabled), a result count, and a responsive card grid. The
**whole card is a link** to `/players/[id]/stats`. Theming uses the shared
`--stats-*` tokens, so it follows Light/Dark/System like `/leaderboard` and
`/team-stats`. It replaced the old Slate & Teal palette, which was
light-only. The avatar reuses `PlayerAvatar`.

The footer shows the match count (from highlights) and "Last played
&lt;date&gt;". Last played is still Hub-side: the latest confirmed,
already-played booking the player was squadded for.

---

## 5. Navigation

- **Desktop:** "👤 Players" is now the third item in **Stats ▾** (after
  Yours Statistically and Team Record) and highlights the dropdown when
  `activePage === 'players'`. It was removed from Council ⚖, since the page
  is no longer GC-specific and would otherwise be listed twice.
- **Mobile More sheet:** a "Players" row sits after Team Record for every
  logged-in member. It was removed from the Council section. `players`
  replaced `gc-players` in `isAdminOrGcHighlighted()`.
- The page passes `back={{ fallbackHref: '/', label: 'Home' }}` to `SiteNav`
  (not a bottom-tab destination; see `back-navigation.md`).

---

## 6. File Map

| File | Role |
|---|---|
| `src/app/players/page.tsx` | Server page — auth gate, public-field player fetch, last-played, highlights |
| `src/components/players/PlayerDirectoryGrid.tsx` | Search, A–Z, cards |
| `src/lib/playerHighlights.ts` (+ `.test.ts`) | `CareerHighlights` type, `pickHighlights()` |
| `src/lib/playerStats.ts` | `getCareerHighlightsByPlayer()` |
| `src/app/gc-players/page.tsx` | Redirect to `/players` |
| `src/components/gc/GCPlayersGrid.tsx` | **Deleted** |
| `src/middleware.ts` | `/gc-players` dropped from the matcher |
| `src/components/ui/SiteNav.tsx`, `src/components/ui/MobileTabBar.tsx` | Nav entries (§5) |

---

## 7. Out of scope / ideas

- Sorting the directory by a stat (most runs, most wickets) — the
  leaderboard already ranks; this page is for finding a person.
- Filtering by skill or captain.
- Linking each highlight to the match it happened in.

---

*Maintained by: Spartans CC BLR*
