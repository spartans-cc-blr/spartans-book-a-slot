# Site Navigation & Home Page — Feature Summary
 
**Spartans Hub · Last updated: September 2026**
**Sprint:** 2 (going live with player-facing features); mobile nav rebuilt September 2026
 
---
 
## 1. Overview
 
The home page (`/`) replaced a simple redirect to `/schedule` that was organiser-only. The new approach is a **split-audience landing page** — the correct first impression is served to each visitor based on their session state, without requiring any manual navigation.
 
### The Problem It Solved
 
`hub.spartanscricketclub.in` previously redirected everyone to `/schedule` (the organiser slot grid). Players had to know to navigate to `/fixtures` and then find the sign-in button. With 100+ members being onboarded for availability marking and squad announcements, this was the wrong default.
 
### Approach Chosen
 
**Option 2 — Split-audience home page** was selected over:
- Option 1 (smart redirect based on session) — too invisible, players without a session still saw the organiser view
- Option 3 (fixtures as the root) — broke the organiser-facing URL that was already being shared externally

### Two different "default landing page" mechanisms — kept in sync (fixed September 2026)

There are two independent things that decide what a player sees first, and
they can drift apart:

1. **A normal signed-in browser session** — there is no server-side
   redirect away from `/` for a logged-in player. `middleware.ts`'s
   `matcher` only guards `/gc/:path*`, `/gc-review`, `/gc-players`, and
   `/admin/:path*`; `/lib/auth.ts` has no custom `callbacks.redirect`. The
   Home page's own "Sign in with Google" button links straight to
   `/api/auth/signin` with no `callbackUrl` query param, so NextAuth's
   default post-sign-in redirect (back to the site's base URL) already
   lands the player on `/` — this page, with the personalised dashboard
   (§3.1), has been the real default here since it shipped.
2. **The installed PWA** ("Add to Home Screen" — the install path
   `features/push-notifications.md` walks iPhone players through so web
   push works) — this is governed entirely separately, by `start_url` in
   `src/app/manifest.ts`. That value had never been updated when this
   split-audience Home page replaced the old `/schedule` redirect — it was
   still `/fixtures`, so tapping the installed app's icon skipped Home
   entirely and opened Fixtures directly, regardless of what `/` itself
   would have shown. **Fixed** — `start_url` is now `'/'`, so the PWA's own
   default matches the browser one. A player who already installed the app
   before this fix needs to reinstall it (remove and re-"Add to Home
   Screen") to pick up the new `start_url` — a PWA manifest is normally
   cached and isn't re-read on every app launch.
---
 
## 2. File Map
 
| File | Role |
|---|---|
| `src/app/page.tsx` | Server component — home/landing page, role-aware rendering |
| `src/components/ui/SiteNav.tsx` | Sticky top nav bar — shared across all pages; full desktop dropdown nav, plus a slim mobile row (avatar/admin/GC shortcuts) that renders `MobileTabBar` below it — see §4.1 |
| `src/components/ui/MobileTabBar.tsx` | Mobile-only (`md:hidden`) fixed bottom tab bar + "More" bottom sheet — replaced the old hamburger drawer, September 2026 — see §4.1 |
| `src/components/ui/GenerateInviteItem.tsx` | "Generate Invite Link" action (GC/admin) — extracted out of `SiteNav.tsx` so both it and `MobileTabBar.tsx` can import one copy without a circular import between the two nav components |
| `src/app/profile/page.tsx` | Player self-service profile edit page |
| `src/app/api/players/[id]/route.ts` | GET + PATCH for single player — IDOR-protected |
| `src/lib/auth.ts` | JWT callback — enriches session with player context, saves Google photo on first sign-in |
| `src/app/manifest.ts` | PWA manifest — `start_url` is the installed app's own "default landing page," independent of a browser session's; kept in sync with `/` (§1) |
 
---
 
## 3. Home Page — `src/app/page.tsx`
 
### Rendering Strategy
 
Server component with `revalidate = 60`. Session is read server-side via `getServerSession(authOptions)`. All role checks and data fetching happen before any HTML is sent to the browser — no client-side loading states on the home page.
 
### Role Detection
 
**No forced admin redirect (changed September 2026).** This page previously checked `isAdmin` and `redirect('/admin')`'d **before** any dashboard data was fetched or rendered, so an admin could never reach this page's player dashboard — even one who is also a registered player, and even by deliberately clicking the logo/Home link. This was reported as a real usability problem for an admin who is *also* a signed-in club member: they had no way to land on their own player dashboard from Home, only the nav's "Admin" pill (`SiteNav.tsx`, ~line 217-218 desktop / ~292-293 mobile) to go the *other* direction, into `/admin`. The redirect was removed — `isAdmin` is now just another independent flag on this page, the same way `isCaptain`/`isGC` already were, and is no longer exclusive with `isPlayer`. (The pre-September-2026 version of this doc listed an "Admin shortcut" panel on the dashboard; that JSX was already dead code by the time this page's admin-redirect first shipped, since `isAdmin` could never be `true` inside the dashboard branch. Removed in the earlier September 2026 dashboard rebuild rather than left as unreachable code — unrelated to this later change, which removes the redirect itself.)
 
| State | Condition | What they see |
|---|---|---|
| Logged out | No session | Both audience cards + sign-in prompt |
| Registered player | `player.playerId` set, status ≠ `expelled` | Personalised dashboard (§3.1) + both audience cards below |
| Captain | `player.isCaptain = true` | Player dashboard + "Squad Selection" quick action |
| GC | `player.isGC = true` | Player dashboard + "Squad Review" quick action |
| Admin, also a registered player | `player.isAdmin = true` and `player.playerId` set | Personalised dashboard (§3.1), same as any other registered player — no admin-specific content on this page |
| Admin, not a registered player | `player.isAdmin = true`, no `player.playerId` | "Not registered yet" callout (same as any unmatched Gmail) + both audience cards below |
| Expelled | `player.playerStatus === 'expelled'` | Suspension notice only |
| Unmatched Gmail | Signed in but no `playerId` | "Not registered yet" callout — contact admin |

Reaching `/admin` itself is unchanged — still exclusively via the nav's "Admin" pill (`isAdmin`-gated, unaffected by this change) or a direct URL; `/admin/layout.tsx`'s own guard (redirect unauthenticated visitors to `/login`, redirect authenticated non-admins to `/?error=unauthorized`) is a separate, still-live check on the *admin* subtree and was not touched by this change.

---

## 3.1 Player Dashboard — Warm Light rebuild (September 2026)

Rebuilt from a dark-ink 3-card layout to a stat-tile dashboard, modelled on a
reference screenshot the club coordinator shared (a different app's home
screen — welcome banner, 2×2 stat tiles, an Upcoming Fixtures card, a Quick
Actions list). The dashboard is a **self-contained Warm Light "island"**
(`background: '#F0F4F5'`, white/parchment cards, `#D97706` gold accent) —
the same "light content on an otherwise dark app" pattern already
established by `/gc-players` (Slate & Teal) and the admin Kit Room page, not
a site-wide reskin. The dark hero band above it (`SPARTANS HUB` title) and
everything below it (Quick Links divider, split-audience cards, footer) are
unchanged, still dark-ink themed — only the dashboard section itself
switched palette.

### `getPlayerData(playerId)` — Server Function

Called only when `isPlayer = true`. Nine independent queries fetched via
one `Promise.all` (unchanged from the pre-existing parallelization pass —
see §7's architectural-decisions table), plus one further query that
genuinely depends on query 9's result and so runs as a follow-up after the
`Promise.all` resolves rather than inside it — see the "You're Selected to
Play" note below:

| # | Query | Feeds |
|---|---|---|
| 1 | `bookings` count, `status='confirmed' AND game_date >= today` | Upcoming Matches stat tile |
| 2 | `availability` rows for this player | `nextFixtureResponse`, `previewResponses` |
| 3 | Next **3** confirmed bookings (`.limit(3)`, was `.limit(1).single()` pre-rebuild) with tournament join | Upcoming Fixtures preview list; `nextFixture = upcomingPreview[0]` |
| 4 | `squad` rows for this player, joined to `bookings(game_date, status)` | Matches Played stat tile (this year's count + all-time last-played date) |
| 5 | `players.wallet_balance, dues_override` | Wallet Balance stat tile |
| 6 | `squad` rows for this player, joined to `bookings(tournament_id)` | My Tournaments stat tile (distinct tournament count) |
| 7 | `squad` rows for this player with `status='announced'`, joined to `bookings(...tournament, ground)` | "You're Selected to Play" card (added September 2026 — see below) |
| 8 | `getNudgeForPlayer()` | Availability nudge banner |
| 9 | `getWeekendGapForPlayer()` | First-open-of-day greeting dialog |

**Query 3 change (single → preview array):** the pre-rebuild version fetched
exactly one row via `.single()`. The rebuild widens this to `.limit(3)` and
derives `nextFixture` as `upcomingPreview[0]` — one query now serves both
the existing "Next Match" nudge logic and the new Upcoming Fixtures preview
list, rather than adding a second overlapping query.

**Bug fixed (September 2026) — only the first preview row ever showed its
availability badge.** The initial rebuild computed a single
`nextFixtureResponse` scoped to `nextFixture` (`upcomingPreview[0]`) and
reused that same value for every row's badge via `fx.id ===
playerData.nextFixture?.id ? nextFixtureResponse : null` — so the 2nd and
3rd cards in the preview list always fell through to `null` and rendered
"Not marked," even when the player had genuinely responded (visible
correctly on `/fixtures` itself, which reads the full per-booking
`availability` set with no such truncation). Fixed by deriving a
`previewResponses: Record<bookingId, response>` map over all of
`upcomingPreview` from the same already-fetched `avail` rows (query 2) —
no new query — and having each row look itself up in that map instead of
comparing against `nextFixture.id`. `nextFixtureResponse` is kept
unchanged for the nudge logic that already depended on it.

**My Tournaments (query 6)** counts distinct `tournament_id`s from every
`squad` row this player has ever been announced in — Hub-side only (`squad`
→ `bookings.tournament_id`), deliberately not sourced from the analytics DB,
same "avoid the player_id reconciliation gaps" reasoning
`features/gc-players.md`'s "last played" field documents for an identical
choice. Counts a tournament regardless of whether the match has been
played yet — a player announced in an upcoming squad already counts.

**Matches Played (query 4, replaced the old Pending Availability tile —
added September 2026).** The original fourth tile showed a bare pending-
response count with no way to see *which* match it referred to — flagged
by the club coordinator as giving "no clue to user." Rather than build a
second surface to name the specific match (the dashboard's separate
availability nudge banner, `getNudgeForPlayer()`, already does that one
job), and since the Upcoming Fixtures preview immediately below already
shows a live "Not marked" badge per fixture, the tile itself was judged
redundant with content already on the same page and was replaced outright
with a genuinely new stat: a running tally of matches actually played.

Sourced the same Hub-side way as My Tournaments — `squad` rows for this
player joined to `bookings(game_date, status)`, filtered in code to
`status = 'confirmed' && game_date <= today` (an announced-but-not-yet-
played squad row doesn't count as "played"). From that filtered set:
`matchesPlayedThisYear` counts rows whose `game_date` falls in the current
calendar year (the tile's big number + its tag, e.g. `2026`);
`lastPlayedOn` is the max `game_date` across *all* of them, all-time, not
just this year — same "last played" convention `features/gc-players.md`
§7/§9 already established for the GC roster grid, reused here rather than
inventing a second one. Rendered as a small muted caption under the label
via `StatTile`'s new optional `sublabel` prop (`formatLastPlayed()` — e.g.
"Last played 6 Sep", year appended only when it isn't the current one) —
`"No matches yet"` when `lastPlayedOn` is null (a brand-new player with no
squad history at all).

**Clickable → `/matches/history?month=all`.** Landing on Match History's
own default view (current month only) would often show nothing at all for
a tile whose whole point is career-to-date context, so the tile deep-links
past that default. `MatchHistoryClient.tsx` reads `?month=all` once at
mount (`useSearchParams()`) and seeds its `monthFilter` state to `''`
(all-time) instead of the usual `currentMonthStr()`; every other filter on
that page is still local component state, not URL-driven, so this is the
one query param the page understands and nothing else changes. The role
filter needed no equivalent param — `roleFilter` already defaults to
`'played'` ("I Played") for any viewer with a `playerId`, which is exactly
who this tile is rendered for.

**Wallet Balance (query 5)** reuses the same `wallet_balance`/`dues_override`
fields `/fixtures` already reads for its own dues gate — there is no
separate "ground fee" vs "match contribution" breakdown in this schema
(single `wallet_balance` per player), so the reference screenshot's two
separate fee tiles were deliberately collapsed into this one real tile
rather than fabricated as two. **Changed September 2026 — shows the actual
signed balance, not a zeroed dues-clearance state.** The tile originally
showed `₹0`/"Clear" whenever `wallet_balance >= 0 || dues_override`, and
only the absolute amount owed otherwise — i.e. a player in credit and a
player with waived dues both rendered identically as "₹0 · Clear", with no
way to see their real balance. Per a product decision, the tile now always
renders `formatSignedRupees(wallet_balance)` (e.g. `-₹500`) — the actual
number, never zeroed or absoluted-away — with the tag/tone reflecting
context rather than clearance: no tag at all (just the emerald-tinted
icon) when `wallet_balance >= 0` — there are no dues to call out, so a
"Positive" pill was redundant with the already-positive number sitting
right below it and was dropped (fixed September 2026; `StatTile`'s `tag`
prop is now optional, and the pill itself only renders when `tag` is
truthy — no other tile passes an empty tag today, but the prop stayed
generic rather than adding a wallet-tile-specific flag) — `Exempted`/amber
when negative but `dues_override` is set (still not blocked from booking,
but the tile is honest that the balance itself is negative), else
`Overdue`/crimson. `duesAmount`/`duesCleared` were renamed to
`walletBalance`/`duesOverride` in `getPlayerData()`'s return shape to
match.

**"You're Selected to Play" (added September 2026)** — a card per upcoming
confirmed booking this player has an *announced* squad row for (query 7
above), rendered **ahead of** the Upcoming Fixtures card (see the Dashboard
Sections table below), between it and the availability nudge banner.
Deliberately additive, not a
replacement: a booking that has an announced squad this player is in still
also appears in the ordinary Upcoming Fixtures preview list underneath —
this section is a highlight layered on top, not a dedupe/filter of that
list.

Query 7 only resolves *which* upcoming bookings qualify (one row per
squad-membership, via the same "join broadly via `booking:bookings!inner(...)`,
filter/sort in code" pattern queries 4 and 6 already use, rather than
fighting PostgREST's embedded-resource filter syntax). Once `Promise.all`
resolves, a second, genuinely-dependent query fetches the *full* squad
(every announced player, not just this one) for those specific booking
IDs — this is the one query in `getPlayerData()` that can't be parallelized
with the rest, since it needs query 7's booking-id list first.

Each card is `SelectedMatchCard` (`src/app/page.tsx`) — deliberately **not**
a reuse of `FixturesCard.tsx` itself, which is tightly coupled to
`FixturesWeekendGroup`'s shared live-availability state and carries fields
(fee-per-player, wallet-after-this-match projection, Y/O/E/L buttons) that
don't apply here — the squad is already announced by the time this card
renders, so there's nothing left for the viewer to mark. Instead it's a
self-contained, read-only card mirroring `FixturesCard`'s squad-announced
*content* (date/slot/format, tournament name linking to
`cricheroes_points_table_url` when set, opponent + ground linking to
`maps_url`, a CricHeroes match link, and the full squad list sorted
alphabetically with C/VC/WK badges — same fields, same sort, same
name-linking fallback chain `FixturesCard`'s own squad grid uses:
`/players/[id]/stats` if the row resolves to a Hub player, else
`cricheroes_url`, else plain text) — but **re-themed to the dashboard's own
Warm Light palette** (`#FFFFFF` card, `#D4C9B0`/`#F5D9A8` borders, `#D97706`
gold accents) rather than `FixturesCard`'s hardcoded dark gradient
(`player-availability.md` §10.1 already documents why `FixturesCard`/
`FixturesAvailability` stay dark even on an otherwise-Warm-Light page
shell — this card is a different, dashboard-native component, not that
same component reskinned in place). The viewer's own row in the squad list
is tinted gold (`#B45309`) rather than the default slate, so they can spot
themselves in the list at a glance.

### Dashboard Sections

| Section | Content |
|---|---|
| Welcome banner | Avatar, "Welcome back, `{firstName}`! 👋", subtitle, a static "🛡️ Spartans CC Bengaluru" badge pill |
| You're Selected to Play | Zero or more `SelectedMatchCard`s (see above) — one per upcoming booking with an announced squad this player is in; rendered above Upcoming Fixtures, entirely absent when there are none |
| Stat tiles (2×2) | Upcoming Matches (gold, **clickable → `/fixtures`**) · My Tournaments (gold, static — no player-facing tournament list page exists yet, see below) · Matches Played (gold, **clickable → `/matches/history?month=all`**, this year's count + "Last played" sublabel) · Wallet Balance (signed amount — emerald, no tag if ≥ 0 (see below), amber "Exempted" if negative but dues-waived, else crimson "Overdue"; **clickable → `/wallet`**, added September 2026 — see `features/wallet-ledger.md`) |
| Availability nudge | Unchanged from pre-rebuild — same `getNudgeForPlayer()` read-only rendering of the Sun–Wed cron logic, restyled to the new palette |
| Upcoming Fixtures | Header + "View All →" to `/fixtures`; up to 3 compact rows (opponent, tournament/format, date, slot, availability badge) from `upcomingPreview`, or a dashed empty-state box ("No Upcoming Matches Scheduled") when there are none |
| Quick Actions | Row-per-action list, icon + title + subtitle + chevron: "Set Availability" (always, → `/fixtures`) · "Squad Selection" (`isCaptain`, → `/captains-corner`) · "Squad Review" (`isGC`, → `/gc-review`) · "My Profile" (always, → `/profile`) — replaces the old separate gold/crimson bordered shortcut panels |

**Stat tiles are drill-down targets, not just numbers (added September 2026).**
The club coordinator flagged that "18 Upcoming Matches" / "9 My Tournaments"
had no way to actually see what those 18/9 were. `StatTile` gained an
optional `href` prop — when set, the whole tile renders as a `<Link>`
(hover/active tint, otherwise identical markup) instead of a plain `<div>`.
Upcoming Matches now links to `/fixtures`, which already lists exactly that
set. **Wallet Balance links to `/wallet`** (added September 2026, alongside
that page itself shipping — see `features/wallet-ledger.md`), the
player's own bank-statement view of every payment and fee debit.
**My Tournaments deliberately stays non-interactive for now** — there
is no player-facing page listing "tournaments I've been announced in";
`/tournament-planner` is the closest existing thing but is gated to
`isCaptain || isGC || isAdmin` (`architecture.md` §3), so linking a plain
player there would just bounce them off its own redirect. A dedicated
tournaments page is a follow-up (see §9's Pending Tasks), not built in this
pass — the tile was intentionally left static rather than pointed at a page
that would reject most of its own viewers.

**Split-audience cards hidden entirely for a registered player (changed September 2026).** The "Quick Links" divider + the "For Players"/"For Organisers" cards below it used to render for every visitor, including a signed-in player — who by that point already has the full dashboard above and doesn't need the pre-sign-in pitch repeated underneath it. Both are now wrapped in a single `{!isPlayer && (...)}` guard, so they render exactly as before for logged-out/expelled/unmatched visitors and not at all once `isPlayer` is true. The divider itself was removed outright rather than kept for a now-single-card case — with the dashboard the only thing left above it, a "Quick Links" separator had nothing left to separate. The player-conditional styling inside the two cards (border colour, "View My Fixtures" vs "View Fixtures" copy) was dead code once the guard made `isPlayer` always `false` inside this block, so it was simplified away rather than left in place.

### Split Audience Cards (Logged-out / Expelled / Unmatched Only)
 
Two side-by-side cards (stacked on mobile), shown only when `!isPlayer`:
 
| Card | Audience | Destination | Access |
|---|---|---|---|
| Players card | Spartans CC members | `/fixtures` | Public (sign-in is on the fixtures page) |
| Organisers card | Tournament promoters | `/schedule` | Public — no login required |
 
### Sign-in Prompt (Logged-out Visitors)
 
A full-width panel at the bottom with a Google sign-in button (using inline Google SVG icon). Redirects to `/api/auth/signin`. Only shown when `!isLoggedIn`.
 
---
 
## 4. SiteNav — `src/components/ui/SiteNav.tsx`
 
### Link Structure
 
```ts
// AFTER
const links = [
  { href: 'https://spartanscricketclub.vercel.app', label: 'Club Site' },
  { href: '/', label: 'Home', key: 'home' },
  // Schedule: public + admin only
  ...(!isLoggedIn || isAdmin
    ? [{ href: '/schedule', label: 'Schedule', key: 'schedule' }] : []),
  ...(isLoggedIn && !isExpelled
    ? [{ href: '/fixtures', label: 'Fixtures', key: 'fixtures' }] : []),
  // The Dugout — all active signed-in players
  ...(isLoggedIn && !isExpelled
    ? [{ href: '/dugout', label: 'The Dugout', key: 'dugout' }] : []),
  ...(isCaptain || isAdmin
    ? [{ href: '/captains-corner', label: "Captains' Corner", key: 'captains' }] : []),
  ...(isGC
    ? [{ href: '/gc-review', label: 'GC Review', key: 'gc' }] : []),
  ...(isCaptain || isGC || isAdmin
    ? [{ href: '/tournament-planner', label: 'Tournaments', key: 'planner' }] : []),
  ...(isLoggedIn && !isExpelled
    ? [{ href: '/profile', label: 'My Profile', key: 'profile' }] : []),
]
```
 
Active page highlight is driven by the `activePage` prop passed from each page (`'home'`, `'schedule'`, `'fixtures'`, `'profile'`, and the rest of the values listed in §4.1). The Club Site entry intentionally has no `key` — it is never highlighted. This `links` array (plus the Matches/Captains'/Council/Wrangler dropdowns rendered alongside it) is **desktop-only** as of September 2026 — see §4.1 for the mobile nav, which no longer reuses this array or these dropdowns.
 
### Logo Link
 
Links to `/`, matching the split-audience home page — the earlier "should be updated" pending task is done.
 
### Profile Dropdown (desktop)
 
Shown when authenticated, opened from the avatar in the top-right. Contains:
- Player display name + email + role badges (CAPTAIN, GC)
- "My Profile" link → `/profile` (hidden if `expelled`)
- "💰 My Wallet" link → `/wallet` (added September 2026, same gate as My Profile — hidden if `expelled` or `playerId` is null; see `features/wallet-ledger.md`)
- "Complete Registration" link → `/join` (shown if `playerId` is null and not expelled)
- Sign out button

This dropdown is desktop-only. On mobile the equivalent content (My Profile, My Wallet, Sign Out) lives in `MobileTabBar`'s "More" sheet instead — see §4.1.

### Role-conditional Nav Elements
 
- **Admin button** — crimson pill linking to `/admin`, shown if `isAdmin`
- **GC Review button** — gold bordered pill linking to `/gc-review`, shown if `isGC && !isAdmin`
- Both are also surfaced in the slim mobile top row (`SiteNav`'s `md:hidden` block), as compact text links next to the avatar — unrelated to `MobileTabBar`, which handles everything else on mobile
### Nav by Role (desktop)

| Role | Nav items visible |
|---|---|
| Public (not signed in) | Schedule · Sign In |
| Player | Home (logo) · Matches ▾ · The Dugout · Stats · My Profile |
| Captain | Home (logo) · Matches ▾ · Captains' Corner ▾ · The Dugout · Stats · Tournaments · My Profile |
| GC | Home (logo) · Matches ▾ · The Dugout · Stats · Tournaments · My Profile · Council ⚖ |
| Wrangler | + Wrangler ⚒ dropdown (Squad Backfill, Grounds) |
| Admin | All of the above · Schedule · Admin ⚙ |
| Expelled | Home (logo) only — every other link/dropdown is gated on `!isExpelled` |

---

## 4.1 Mobile Nav — `MobileTabBar.tsx` (rebuilt September 2026)

### Why

The old mobile nav was a hamburger drawer that reproduced the desktop `links` array plus every dropdown's items as a flat, scrollable list — functional, but not the pattern players actually reach for on a phone. Replaced with a **hybrid nav**: a fixed bottom tab bar for the handful of destinations everyone taps constantly, plus a "More" bottom sheet for everything else, grouped by role the same way the desktop dropdowns already were. `SiteNav.tsx` itself is now `<>`-wrapped and renders `<MobileTabBar>` as a sibling right after `</nav>`, passing down the same role booleans it already computes (`isLoggedIn`, `isExpelled`, `isAdmin`, `isGC`, `isCaptain`, `isWrangler`, `playerId`) — `MobileTabBar` does not call `useSession()` itself.

### Bottom tab bar — `md:hidden fixed inset-x-0 bottom-0`

Tab set depends on auth state (mirrors the same gates the desktop `links` array uses):

| State | Tabs |
|---|---|
| Expelled | Home only |
| Not logged in | Home · Schedule |
| Logged in, not expelled | Home · Matches · My Stats · **More** |

**"Matches" always links to `/fixtures`** and is active for both
`activePage === 'fixtures'` and `activePage === 'matches'` — as of
September 2026 this is one tab, not two (was "Fixtures" + "Matches" as
separate tabs when the hybrid nav first shipped; merged after the club
coordinator pointed out the reference screenshot used a single "Matches"
tab with Upcoming/Past Matches as an in-page toggle instead — see
`features/player-availability.md` §10.2). The desktop `links` array's own
"Matches ▾" dropdown (Upcoming/Past Matches) already worked this way from
the start; this brings mobile in line with it rather than introducing a
new pattern.

**"My Stats" replaced "Dugout" as the third tab slot (added September
2026).** The club coordinator felt "Dugout" — a grab-bag landing page for
Kit Room/Gear Exchange/Store Orders — wasn't the destination players would
actually reach for from the bottom bar as often as their own stats. Losing
its own tab slot doesn't remove Dugout from mobile navigation entirely — it
moved into the **More** sheet instead (see below), the same "still one tap
away, just not a fixed slot" tradeoff every other sheet-only destination
already makes.

**"My Stats" links to the viewer's own personal stats page, not the club
Honour Board (corrected September 2026).** The first cut pointed "My Stats"
at `/leaderboard` — reusing the desktop nav's "Stats" link and the sheet's
then-removed "Stats" row — but that's the club-wide "Yours Statistically"
board (milestone cards, monthly views, sortable Bat/Bowl/Field/MVP tables
across every player, see `features/leaderboard.md`), not the individual's
own numbers. Corrected to `/players/${playerId}/stats` — the same
per-player page `/profile`'s own "📊 View Full Stats" link points at
(`src/app/profile/page.tsx`) — falling back to `/join` when `playerId` is
null (an unmatched Gmail has no stats page to show, same fallback the
sheet's own My Profile row already uses in that case). Active for
`activePage === 'my-stats'`, a new value distinct from `'leaderboard'` —
the two are different pages and must not both light up for the same tab.
`/players/[id]/stats/page.tsx` only passes `activePage="my-stats"` when the
signed-in viewer's own `playerId` matches the `id` in the URL — that route
is also reachable to view *any* player's stats (any signed-in, non-expelled
member, not IDOR-restricted to self — see the route's own vibe-security
comment), where highlighting "My Stats" as active would be wrong. Reuses
the sheet's existing `TrophyIcon` (now accepting an optional `size` prop —
`21` in the tab, its original `16` default everywhere else it's used).

The club Honour Board itself didn't lose its mobile nav entry in the
process — a **"🏆 Leaderboard" row was added back to the More sheet**
(`/leaderboard`, `activePage === 'leaderboard'`), restoring the destination
the sheet's original "Stats" row covered before that row was briefly
repurposed as the tab. **More** is always the last slot, a button (not a
link) that toggles the bottom sheet — it shows the same active-gold
treatment whenever the sheet is open, or whenever `activePage` is one of
the values that only live inside the sheet (`isAdminOrGcHighlighted()`:
`dugout`, `leaderboard`, `profile`, `planner`, `captains`,
`captains-unavailable`, `gc`, `gc-players`, `wrangler`, `schedule` —
deliberately excludes `matches` and `my-stats`, both covered by their own
tab's `active` check instead).

### "More" sheet

A `fixed inset-x-0 bottom-16` panel (rounded top corners, scrollable, capped `max-h-[70vh]`) with a full-screen scrim behind it. Content branches the same way `SiteNav`'s desktop dropdowns do:

- **Expelled** — just an "Account suspended" notice, no links.
- **Logged in** — The Dugout (moved here from its own tab slot, September 2026 — see above; `ShieldIcon` at its sheet-row `size={16}`), Leaderboard (the club Honour Board, `/leaderboard` — added back September 2026 once "My Stats" stopped pointing here, see above), My Profile and My Wallet (both hidden together with the rest of the "logged in" content if `playerId` is null, in favour of "Complete Registration" → `/join`; My Wallet added September 2026, `RupeeIcon` — see `features/wallet-ledger.md`), Tournament Planner (captain/GC/admin), then role-gated sections mirroring the desktop dropdowns 1:1:
  - **Captains' Corner** (`isCaptain || isAdmin`) — Squad Selection, Unavailable Dates
  - **Council** (`isGC`) — Squad Review, Feedback, Players, Store Orders, Grounds, `GenerateInviteItem`
  - **Wrangler** (`isWrangler`) — Squad Backfill, Grounds
  - **Admin** (`isAdmin`) — Schedule, Admin Panel (crimson row)
  - Club Site (muted, external) and Sign Out always last.
- **Logged out** — Club Site + Sign In only.

### Reserving space for the fixed bar — `.has-mobile-tabbar`

Since the tab bar is `fixed`, page content needs bottom padding so the bar doesn't cover it. `MobileTabBar` toggles a `document.body.classList.add('has-mobile-tabbar')` in a `useEffect` (removed on unmount), and `src/app/globals.css` reserves `padding-bottom: 4.5rem` on `body.has-mobile-tabbar` under a `max-width: 767px` media query. This means the padding only ever applies on pages that actually mount `MobileTabBar` (i.e. render `SiteNav`) — the `/admin/*` subtree (which uses `AdminLayout`/`AdminSidebar` instead, see `admin_console.md`) is unaffected.

### Warm Light variant — `theme` prop (added September 2026)

`MobileTabBar` accepts an optional `theme?: 'dark' | 'light'` prop (default
`'dark'`, unchanged look). `SiteNav` forwards it through its own
`mobileTabBarTheme` prop — `<SiteNav activePage="fixtures"
mobileTabBarTheme="light" />` — never inferred from `activePage` or
anything else, so a page opts in explicitly. Both the fixed tab bar and
the "More" sheet read every colour from a small `tokens(theme)` lookup
(`src/components/ui/MobileTabBar.tsx`) rather than hardcoded Tailwind
classes — `'light'` swaps in the same Warm Light palette as
`DateChipSlider` (`#FFFFFF`/`#F8F4EE` surfaces, `#D97706` gold, `#D4C9B0`
borders), `'dark'` keeps the original ink/gold tokens byte-for-byte. Every
icon in the file was changed from a hardcoded `stroke="#C9A84C"` to
`stroke="currentColor"` so a single `color` set on each row's wrapping
`<span>`/`<Link>` (from the token lookup) tints the icon too — no
per-icon colour prop threading needed. Only `/fixtures` and
`/matches/history` pass `'light'` today (see `features/player-availability.md`
§10.1 and `features/post-match-scorecard.md` §16 for why those two pages
went Warm Light in the first place) — the desktop nav and the slim mobile
top row in `SiteNav` itself are unaffected either way, always dark,
regardless of `mobileTabBarTheme`.

### One admin page had to drop its own `<SiteNav>`

`src/app/admin/dugout/kit-room/page.tsx` is nested under `src/app/admin/layout.tsx` (which already renders the admin top bar + `AdminSidebar`, including `AdminSidebar`'s own `md:hidden fixed bottom-0` mobile nav) **and** was separately rendering its own `<SiteNav>` inside the page body — a pre-existing redundancy (double top bar) that predates this change. Before the mobile nav rebuild this only cost an extra header; once `SiteNav` started rendering a second `fixed bottom-0` bar of its own, the two mobile bottom bars would have visually stacked on this one page. Fixed by removing the redundant `<SiteNav>` import/render from this page — `AdminLayout`'s own nav (which already links to this exact page, "Store Orders" under "The Dugout" section) is sufficient, matching every other `/admin/**` page.

---
 
## 5. Auth Flow — `src/lib/auth.ts`
 
### JWT Callback — Key Design Decisions
 
**`isAdmin` is derived from `ADMIN_EMAILS` environment variable, not the database.** An attacker cannot escalate to admin by modifying their player record in Supabase. Changing admins requires a Vercel env var change + redeployment.
 
**Token is enriched on first sign-in and on any token refresh where `playerId` is null** — this handles stale sessions from before a deployment without forcing every request to re-query the DB.
 
**Google profile photo is saved to `players.photo_url` on first sign-in** if the field is currently empty:
 
```ts
const googlePhoto = user.image ?? null
if (player?.id && googlePhoto && !player.photo_url) {
  await supabase.from('players')
    .update({ photo_url: googlePhoto })
    .eq('id', player.id)
}
token.photoUrl = player?.photo_url ?? googlePhoto
```
 
This means photos are populated passively — existing players who have already signed in will have their Google photo saved on their next sign-in. No photo upload feature exists (Supabase free tier has 50MB storage; 100+ members at up to 5MB each would exceed it).
 
### Session Token Fields
 
| Field | Source | Purpose |
|---|---|---|
| `playerId` | `players.id` matched by `gmail_id` | Player identity — null if unregistered |
| `playerName` | `players.name` | Display name |
| `isCaptain` | `players.is_captain` | Captain-gated routes and UI |
| `isGC` | `players.is_gc` | Governing Council access |
| `playerStatus` | `players.status` | Expulsion check (`active` / `inactive` / `expelled`) |
| `isAdmin` | `ADMIN_EMAILS` env var | Admin-gated routes — not from DB |
| `photoUrl` | `players.photo_url` (Google photo on first sign-in) | Avatar display |
 
**Session strategy:** JWT, 8-hour expiry. No database session storage.
 
---
 
## 6. My Profile Page — `src/app/profile/page.tsx`
 
### Access Control
 
- Requires authenticated session with a valid `playerId`
- Expelled players see a suspension message and cannot edit
- Unauthenticated users are redirected to `/`
### Editable Fields (Player Self-Service)
 
| Field | Input Type | Notes |
|---|---|---|
| WhatsApp number | `tel` | Include country code e.g. `919876543210` |
| Date of birth | day + month `select`, year `number` (optional) | `DobInput` (`src/components/ui/DobInput.tsx`) — year left blank stores a sentinel `1900` in `players.dob` so the birthday-wishes feature (day/month only) still works without the player disclosing their birth year; see `features/birthday-wishes.md` |
| Blood group | `select` | A+/A−/B+/B−/AB+/AB−/O+/O− |
| Jersey name | `text` | Uppercased — name printed on back |
| Jersey number | `number` | 0–999 |
| Primary skill | `select` | 17 options covering batting, bowling, keeping roles |
| Secondary skill | `select` | Same list as primary |
| CricHeroes profile URL | `url` | With inline "Test link ↗" preview |
 
### Read-Only Fields (Admin-Managed)
 
- Full name, club Gmail, wallet balance (with dues highlight if < 0), inducted date, captain status
### API — `GET /api/players/[id]`
 
Player can only fetch their own profile. Admin can fetch any. IDOR check:
 
```ts
if (!user.isAdmin && user.playerId !== params.id) {
  return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
}
```
 
### API — `PATCH /api/players/[id]`
 
Non-admin players can only update fields in a fixed allowlist. Sensitive fields are silently dropped server-side even if sent by the client:
 
```ts
const PLAYER_EDITABLE_FIELDS = new Set([
  'whatsapp', 'dob', 'jersey_name', 'jersey_number',
  'blood_group', 'primary_skill', 'secondary_skill', 'cricheroes_url',
])
// photo_url removed from allowlist — set only by auth.ts on sign-in
// wallet_balance, is_captain, status, active — never in the allowlist
```
 
### Hero
 
Displays the player's Google profile photo (from `player.photoUrl ?? player.image`), name, CAPTAIN/ACTIVE badges, and member-since date. No photo upload — profile photo comes exclusively from Google OAuth.
 
---
 
## 7. Architectural Decisions
 
| Decision | Rationale |
|---|---|
| Home page is a server component | No flash of unauthenticated content; role detection and data fetching happen before HTML is sent |
| `revalidate = 60` on home page | Fixture counts stay reasonably fresh without a full SSR on every hit |
| `getPlayerData` runs 4 separate queries rather than one complex join | Supabase query composability; each query is independently cacheable and easier to reason about |
| Google photo saved to DB on sign-in, not fetched live | Avoids Google token expiry issues; consistent avatar even if Google profile changes; zero storage cost |
| No Supabase Storage used for photos | Free tier is 50MB — 100+ members × up to 5MB = would exceed limit immediately |
| `isAdmin` from env var not DB | Prevents privilege escalation via DB manipulation; changing admins requires a deliberate redeployment |
| Player PATCH allowlist is server-enforced | Client cannot send `wallet_balance` or `is_captain` — they are silently dropped even if injected |
| Logo still links to `/schedule` | Not yet updated — see pending tasks |
 
---
 
## 8. Pending Tasks
 
| Task | Priority | Notes |
|---|---|---|
| Update logo `href` in `SiteNav.tsx` from `/schedule` to `/` | ✅ Done | Logo now links to `/` |
| Mobile nav — hamburger drawer → hybrid bottom tab bar + "More" sheet | ✅ Done (Sept 2026) | See §4.1 — `MobileTabBar.tsx`, replaces the old drawer entirely |
| Player-facing "My Tournaments" page | Medium | The Home dashboard's My Tournaments stat tile (§3.1) has no drill-down destination yet — deliberately left non-interactive rather than pointed at the captain/GC/admin-only `/tournament-planner`. Needs its own page listing the tournaments a player has been announced in a squad for (same `squad → bookings.tournament_id` source the tile's count already uses), then the tile's `href` can be wired up the same way "Upcoming Matches" → `/fixtures` was |
| Seed `players.photo_url` for existing members | Medium | Existing players who signed in before the auth.ts change won't have photos until their next sign-in. Passive approach is fine; no one-off migration needed |
| CricHeroes hyperlink wherever player names appear | Medium | Agreed pattern: if `cricheroes_url` is set on the player's profile, their name should render as a hyperlink to that URL in squad announcements, availability grids, and Captains Corner |
| `/join` route for unmatched Gmail users | Low | `SiteNav` links to `/join` for unmatched users but the page doesn't exist yet — currently dead link |
| Optimise `getPlayerData` queries | Low | Queries 3 and 4 both hit `bookings` — could be merged into one query with the pending count derived from the same result set |
| Consider `Promise.all` in `getPlayerData` | Low | Queries 2 and 3 are independent — running them in parallel would reduce TTFB on the home page |
 
