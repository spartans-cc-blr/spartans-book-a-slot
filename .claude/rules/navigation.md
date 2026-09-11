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
| `src/components/home/SelectedMatchCard.tsx` | Client component — "You're Selected to Play" card content, replicating `FixturesCard`'s squad-announced fields (icon row, collapsible squad, fee/wallet projection) in the dashboard's Warm Light palette; see §3.1 |
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
a site-wide reskin. `SiteNav` above it and everything below it (split-audience
cards, footer) are unchanged, still dark-ink themed — only the dashboard
section itself switched palette. (The page also had a dark hero band —
"SPARTANS CRICKET CLUB · BENGALURU · EST. 2014" / "Spartans Hub" title /
subtitle — directly under the nav; removed September 2026, see the note
below the Dashboard Sections table, since `SiteNav`'s own logo lockup and
the footer's "© 2026 Spartans Cricket Club · Bengaluru · Est. 2014" line
already said the same thing.)

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
| 3 | Next confirmed bookings (`.limit(8)`, was `.limit(3)` then `.limit(1).single()` pre-rebuild — over-fetched so a full 3 rows are still left over once query 7's bookings are excluded, see below) with tournament join | Upcoming Fixtures preview list, after exclusion (`otherUpcoming`, see "You're Selected to Play" below); `nextFixture = upcomingPreview[0]` |
| 4 | `squad` rows for this player, joined to `bookings(game_date, status)` | Matches Played stat tile (this year's count + all-time last-played date) |
| 5 | `players.wallet_balance, dues_override` | Wallet Balance stat tile |
| 6 | `squad` rows for this player, joined to `bookings(tournament_id)` | My Tournaments stat tile (distinct tournament count) |
| 7 | `squad` rows for this player with `status='announced'`, joined to `bookings(...tournament, ground)` | "You're Selected to Play" card, and — via `selectedBookingIds` — which bookings query 3's preview must exclude (added September 2026 — see below) |
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

**"You're Selected to Play" (added September 2026, exclusion + full
replica shipped a few days later)** — a card per upcoming confirmed
booking this player has an *announced* squad row for (query 7 above),
rendered **ahead of** the Upcoming Fixtures card (see the Dashboard
Sections table below), between it and the availability nudge banner.

**Now exclusive of the plain Upcoming Fixtures list below it, not
additive on top of it (changed September 2026).** The first cut of this
section deliberately left a booking in both places — this card *and* the
ordinary Upcoming Fixtures preview underneath — on the theory that this
section was a highlight layered on top, not a dedupe/filter. The club
coordinator's actual intent, clarified in a follow-up request, was the
opposite: a booking already surfaced here shouldn't also clutter the
plain list below it. `getPlayerData()` now computes `selectedBookingIds`
(the set of upcoming booking IDs with an announced squad this player is
in) immediately once its `Promise.all` resolves, and `otherUpcoming` —
the array that actually feeds the Upcoming Fixtures preview — filters
those IDs out of the fetched candidate pool before capping back down to
3 rows. Because that filter can remove bookings, the candidate query
itself over-fetches (`.limit(8)` instead of the `.limit(3)` a bare
preview would need) so there's still a full 3 rows left over in the
common case once the exclusion runs. `previewResponses` (the per-row
availability badge lookup) is now built from `otherUpcoming` rather than
the raw fetched list, for the same reason.

**Upcoming Fixtures relabels itself "Upcoming Other Fixtures" once this
section is non-empty** (`playerData.selectedToPlay.length > 0 ? 'Upcoming
Other Fixtures' : 'Upcoming Fixtures'`, same conditional on the
section's own empty-state heading — "No Other Matches Scheduled" vs "No
Upcoming Matches Scheduled") — since the plain list no longer includes
every upcoming match once some of them have been promoted above it, the
heading says so rather than reading as a duplicate "Upcoming Fixtures".

Query 7 only resolves *which* upcoming bookings qualify (one row per
squad-membership, via the same "join broadly via `booking:bookings!inner(...)`,
filter/sort in code" pattern queries 4 and 6 already use, rather than
fighting PostgREST's embedded-resource filter syntax) — its select was
widened (same pass as the exclusion/replica work below) to also carry
`match_time`, `match_stage`, `match_fee_override` on the booking, and
`ball_type`/`match_fee`/`cricheroes_points_table_url`/`hospital_url`
(both the tournament's own ground and the booking's own `ground_id`
override) on the joined tournament/ground rows — everything the replica
card below needs, fetched in this one query rather than a second round
trip. Once `Promise.all` resolves, a second, genuinely-dependent query
fetches the *full* squad (every announced player, not just this one,
each joined to their own `fee_exemptions` rows) for those specific
booking IDs — this is the one query in `getPlayerData()` that can't be
parallelized with the rest, since it needs query 7's booking-id list
first.

**Each card is `SelectedMatchCard`** — its own file,
`src/components/home/SelectedMatchCard.tsx` (moved out of `page.tsx`,
which is a Server Component and can't itself hold the `useState` this
card needs for its collapsible squad section — see below), a `'use
client'` component. Originally scoped as a deliberately-trimmed,
read-only replica of `FixturesCard`'s squad-announced content (no fee
row, no wallet projection, no icon row — on the theory that those didn't
apply once a squad is already announced). A follow-up request asked for
those pieces back — **"replicate almost everything in the fixtures card
but the availability slot"** — so `SelectedMatchCard` now mirrors
`FixturesCard`'s squad-announced section field-for-field:

- Date/slot/format row, tournament name linking to
  `cricheroes_points_table_url` when set, opponent + ground linking to
  `maps_url`, `match_stage` badge (same `stageIcon()` lookup).
- **Icon row** — ball (`ball_type`), jersey, a CricHeroes match-link icon
  when `cricheroes_url` is set, a ground/map-pin icon when the resolved
  ground (booking's own `ground_id` override, falling back to the
  tournament's) has a `maps_url`, and a hospital icon when that same
  ground has a `hospital_url` — same icons, same "only render if the URL
  exists" gating `FixturesCard`'s own icon row uses.
- **Collapsible squad section** — a "✅ Squad Announced · N players"
  toggle row (`▼`/`▲`, local `squadOpen` state) matching `FixturesCard`'s
  own collapse-by-default squad panel, rather than the first cut's
  always-expanded grid.
- **Match-fee row + wallet-after-this-match projection** — same
  `Math.ceil(baseFee / nonExemptCount)` split
  `src/app/fixtures/page.tsx` computes (`baseFee =
  booking.match_fee_override ?? tournament.match_fee`, `nonExemptCount`
  via a live `fee_exemptions` date-range check), and the same "chain a
  running balance chronologically across matches" approach for the
  projection — `getPlayerData()` threads a single `runningWalletBalance`
  variable through the `.map()` that builds `selectedToPlay` (already
  sorted ascending by `game_date`/`slot_time`), deducting each match's
  fee before the next card's projection is computed, so a player selected
  for two upcoming matches sees each card's "after this match" balance
  correctly account for the one before it.
- Full squad list sorted alphabetically with C/VC/WK badges, same
  name-linking fallback chain `FixturesCard`'s own squad grid uses:
  `/players/[id]/stats` if the row resolves to a Hub player, else
  `cricheroes_url`, else plain text.

**Deliberately excluded — the "⚠ Slot underfilled" Y-count nudge.** Per
the explicit "but the availability slot" carve-out in the request: the
squad is already announced by the time this card renders, so there's
nothing left for the viewer to mark, and the underfilled-slot nudge is
about *unfilled* squads — moot here. This is the one piece of
`FixturesCard`'s squad-announced content genuinely not replicated; the
Y/O/E/L response buttons themselves were never part of this card to
begin with (`FixturesAvailability` is a separate sibling component
`FixturesCard` never renders).

**"✓ Selected" pill removed (fixed September 2026)** — the card's
date/slot/format row originally carried its own small green "✓ Selected"
pill next to the format pill, left over from when this card was first
scaffolded as a standalone replica of `FixturesCard`'s header row. Once
it's rendered inside a section already titled "You're Selected to Play",
the pill was pure repetition — every card under that heading is
definitionally one the viewer is selected for, so the word was saying the
same thing twice on the same card. Removed; only the format pill (T20/T30)
remains in that row.

To let `SelectedMatchCard` reuse `FixturesCard`'s icon/format helpers
without duplicating ~150 lines of SVG and formatting code, nine
previously-private functions in `src/components/fixtures/FixturesCard.tsx`
gained an `export` keyword (no logic changes): `stageIcon`,
`CricHeroesIcon`, `MapPinIcon`, `HospitalIcon`, `BallIcon`,
`jerseyColour`, `jerseyLabel`, `slotLabel`, `formatDate`.
`SelectedMatchCard` imports these directly rather than re-implementing
them.

Still **re-themed to the dashboard's own Warm Light palette** (`#FFFFFF`
card, `#D4C9B0`/`#F5D9A8` borders, `#D97706` gold accents) rather than
`FixturesCard`'s hardcoded dark gradient (`player-availability.md` §10.1
already documents why `FixturesCard`/`FixturesAvailability` stay dark
even on an otherwise-Warm-Light page shell — this card is a different,
dashboard-native component reusing `FixturesCard`'s *logic and icons*,
not that same component reskinned in place or rendered as-is). The
viewer's own row in the squad list is tinted gold (`#B45309`) rather than
the default slate, so they can spot themselves in the list at a glance.

### Dashboard Sections

| Section | Content |
|---|---|
| Welcome banner | Avatar, "Welcome back, `{firstName}`! 👋", subtitle. The static "🛡️ Spartans CC Bengaluru" badge pill that used to sit alongside it was removed (added nothing every other visitor to this same-club Hub didn't already know) — see the "Welcome banner trimmed" note below |
| You're Selected to Play | Zero or more `SelectedMatchCard`s (see above) — one per upcoming booking with an announced squad this player is in; rendered above Upcoming Fixtures, entirely absent when there are none. Each replicates `FixturesCard`'s squad-announced content (icon row, collapsible squad, fee/wallet projection) minus the underfilled-slot nudge, re-themed Warm Light |
| Stat tiles (2×2) | Upcoming Matches (gold, **clickable → `/fixtures`**) · My Tournaments (gold, static — no player-facing tournament list page exists yet, see below) · Matches Played (gold, **clickable → `/matches/history?month=all`**, this year's count + "Last played" sublabel) · Wallet Balance (signed amount — emerald, no tag if ≥ 0 (see below), amber "Exempted" if negative but dues-waived, else crimson "Overdue"; **clickable → `/wallet`**, added September 2026 — see `features/wallet-ledger.md`) |
| Availability nudge | Unchanged from pre-rebuild — same `getNudgeForPlayer()` read-only rendering of the Sun–Wed cron logic, restyled to the new palette |
| Upcoming Fixtures / Upcoming Other Fixtures | Header ("Upcoming Other Fixtures" once the section above is non-empty — see above) + "View All →" to `/fixtures`; up to 3 compact rows (opponent, tournament/format, date, slot, availability badge) from `otherUpcoming` — bookings already shown in "You're Selected to Play" are excluded — or a dashed empty-state box ("No Other Matches Scheduled" / "No Upcoming Matches Scheduled") when there are none |
| Quick Actions | Row-per-action list, icon + title + subtitle + chevron: "Set Availability" (always, → `/fixtures`) · "Squad Selection" (`isCaptain`, → `/captains-corner`) · "Squad Review" (`isGC`, → `/gc-review`) · "My Profile" (always, → `/profile`) — replaces the old separate gold/crimson bordered shortcut panels |

**Welcome banner trimmed (fixed September 2026)** — the banner originally
paired the avatar/greeting block with a static "🛡️ Spartans CC Bengaluru"
badge pill on the opposite end of the row. Every visitor who reaches this
dashboard is already a signed-in Spartans CC Bengaluru member — the badge
told them nothing they didn't already know just by being logged in, so it
was removed rather than kept as decoration. The banner is now just the
avatar, greeting, and subtitle.

**Page-level hero band removed entirely (fixed September 2026)** — a
different, page-wide element from the welcome banner above: a dark
`bg-ink-2` band directly under `SiteNav`, present for *every* visitor
state (logged-out, player, expelled, unmatched — not just the player
dashboard), reading "— SPARTANS CRICKET CLUB · BENGALURU · EST. 2014" /
"Spartans Hub" / "Club operations platform — fixtures, availability,
scheduling and more." Removed outright rather than trimmed, since it was
pure repetition of identity chrome that already exists twice elsewhere on
the same page: `SiteNav`'s own logo lockup (the Spartans CC mark + "SPARTANS
CC" wordmark, always visible in the nav bar above it) and the page footer's
"© 2026 Spartans Cricket Club · Bengaluru · Est. 2014" line. With both of
those already present, the hero band added a third copy of the same
club-identity statement with no new information — same "cut, don't
decorate" reasoning as the welcome banner badge and the "✓ Selected" pill
right above this note. Every render branch that used to sit directly below
the hero (Expelled notice, Unmatched-Gmail callout, the player dashboard,
the split-audience cards, the sign-in prompt) is unaffected in content —
only the spacing/order shifted up, since each of those blocks already
carries its own top-level padding independent of the hero.

**Footer divider removed too (fixed September 2026, same pass)** — a
follow-up to the hero-band removal above: the footer's `border-t
border-ink-4` drew a horizontal divider line above the copyright text,
which — sitting on the page's dark `bg-ink` background with its own
`py-5`/`mt-8` spacing — visually read as a second, smaller version of the
same "distinct dark band" the hero band was. The footer text itself
(`© 2026 Spartans Cricket Club · Bengaluru · Est. 2014 · Club Site`) is
unchanged and still renders exactly as before; only the `border-t
border-ink-4` class was dropped, so the copyright line now sits directly
on the page background with no divider drawing a line above it.

**Root page background switched to Warm Light too (fixed September 2026,
one more follow-up in the same series)** — the border removals above
stopped the hero and footer from drawing their own extra divider/band, but
`page.tsx`'s outermost wrapper (`<div className="min-h-screen bg-ink
grain">`, wrapping the whole page — nav, dashboard, footer, everything)
was still `bg-ink`, near-black (`#080808` as actually shipped — see the
Tailwind-token correction below §4's "Warm Light nav" note; `ui-theme.md`
had documented this as `#1C1917`, a different dark shade, which was also
wrong). Once the nav went Warm Light too (see §4's "Warm Light nav,
site-wide" note) and the dashboard already was, that root `bg-ink` had
nothing left it was actually needed for on this page except filling in
the gaps *around* the light dashboard box — the empty wrapper div between
the dashboard and the footer (both its own conditional children, the
split-audience cards and sign-in prompt, are hidden once `isPlayer`), and
the footer's own vertical padding — which is exactly the "still a black
band at the bottom" a signed-in player kept seeing. Fixed by switching the
root wrapper to `bg-parchment` (`#F8F4EE`, the same default page
background `ui-theme.md` already specifies for every other page's
`<main>` — and, unlike `gold`/`crimson`/`ink`, the one Tailwind colour
token that genuinely does match its documented value) instead of
`bg-ink`. **Further updated (Light/Dark/System, September 2026 — see
`ui-theme.md`):** the root wrapper now carries a `dark:bg-ink` counterpart
(`bg-parchment dark:bg-ink`) rather than being permanently `bg-parchment`
— the whole dashboard (welcome banner, stat tiles, "You're Selected to
Play"/`SelectedMatchCard`, Upcoming Fixtures, Quick Actions) is
theme-aware via a `--home-*` CSS-variable set in `globals.css`, so this
fix's own reasoning (a black band showing through on an otherwise-light
page) now applies symmetrically in reverse for a visitor who picks Dark. The footer's own text (`text-zinc-600`/`text-zinc-700` —
legible-enough on the old dark bg, but essentially invisible on a light
one) was updated to `#78716C`/hover `#44403C`, matching the Warm Light
"muted"/"secondary text" tokens used everywhere else in this file. The
Expelled/Unmatched banners and the logged-out split-audience/sign-in
cards (`bg-ink-3`/`bg-red-950`/`bg-amber-950`, all self-contained dark
cards with their own background and already-correct light-on-dark text)
needed **no** changes — they carry their own background regardless of
what the root wrapper behind them is, so they still render as intentional
dark accent cards sitting on the new light page, the same way they always
looked like dark cards sitting on the old dark page.

**A second dark element remained after that fix — the mobile bottom tab
bar (fixed September 2026, same "still a black band" report, reproduced
via a real screenshot this time).** The root-background fix above
addressed everything in *normal document flow*, but `MobileTabBar` — the
fixed "Home · Matches · My Stats · More" bar `SiteNav` renders as a
sibling right after `</nav>` (§4.1) — is a **separate** component with its
own independent light/dark `theme` prop, defaulting to `'dark'` unless a
page explicitly opts in. Home's `<SiteNav activePage="home" />` call had
never passed `mobileTabBarTheme="light"`, so on mobile the tab bar kept
rendering its dark tokens (`navBg: '#111111'`) directly underneath the now-
light page content — visually indistinguishable, in a screenshot, from
"the black band is still there," even though the root-background fix
above was already correctly live. Fixed by adding
`mobileTabBarTheme="light"` to Home's `<SiteNav>` call, the same prop
`/fixtures` and `/matches/history` already pass for the identical reason
(§4.1's Warm Light variant note) — the tab bar now reads the same
`'light'` token set (`#FFFFFF`/`#F8F4EE` surfaces, `#D97706` gold,
`#D4C9B0` borders) those two pages already use. The one still-known gap
this doesn't close: `GenerateInviteItem.tsx`'s `mobile` branch, rendered
inside the "More" sheet, stays hardcoded dark regardless of this prop
(§4's "Deliberately still just the nav bar" note already flags this as
pre-existing, GC/admin-only, out of scope) — now slightly more visible
on Home for a GC/admin viewer who opens the sheet, but not the reported
symptom.

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

### Light/Dark/System (added September 2026, same month as the Warm Light nav change below)

`SiteNav` and `MobileTabBar` are now the app's first genuinely theme-aware
surfaces — a real Light/Dark/System toggle (mirroring a phone's own
appearance setting), not a fixed palette. Full mechanism (storage,
no-FOUC script, the `useTheme()` hook, the two conversion patterns used
across the app) is documented centrally in `ui-theme.md`'s "Light/Dark/System
Theme" section — this doc only covers what changed in these two files
specifically. In short: every colour value described in §4/§4.1 below as
"Warm Light, site-wide/unconditional" is now the **light** state of a real
toggle, not a fixed look — `SiteNav.tsx` carries a `dark:`-prefixed
counterpart on each of its Tailwind classes (reusing the exact
pre-September-2026 dark nav values), and `MobileTabBar`'s `theme` prop,
previously defaulted to a hardcoded `'light'`, now defaults to the
signed-in visitor's own `resolvedTheme` from `useTheme()` when no explicit
override is passed. `ThemeToggleNav`/`ThemeToggleSheet`
(`src/components/ui/ThemeToggle.tsx`) are the actual switcher controls,
rendered in `SiteNav`'s profile dropdown and `MobileTabBar`'s "More" sheet
respectively (all three sheet branches — logged-in, logged-out, and
expelled — so even a suspended account can flip the theme).

`Home` (`src/app/page.tsx`) no longer passes `mobileTabBarTheme="light"` to
`<SiteNav>` — its dashboard content became theme-aware in the same pass
(see `ui-theme.md`), so the bottom tab bar should follow the visitor's
choice rather than being pinned light. `/fixtures` similarly dropped its
own hardcoded prop. `/matches/history` still passes `mobileTabBarTheme="light"`
explicitly and is unaffected — its own body content hasn't been converted
to Light/Dark/System yet, so its tab bar stays pinned to match.

### Warm Light nav, site-wide (changed September 2026)

`SiteNav` was previously an intentional dark exception — every page-level
Warm Light adoption in this app (the Home dashboard §3.1, `/fixtures` and
`/matches/history` §4.1's mobile-only `theme` prop, `/gc-players`' Slate &
Teal) explicitly left the top nav dark on top of it, and both
`ui-theme.md`'s checklist and this doc used to say so outright ("nav bar
stays dark... do not lighten it"). Per a direct request for the nav to
match the rest of the light palette everywhere rather than only on the
pages that had already gone light, the nav itself is now Warm Light —
unconditionally, on every page, not behind a per-page opt-in prop the way
`MobileTabBarTheme` works for the bottom tab bar (§4.1).

`bg-ink-2` (the dark surface) was replaced with `bg-white` throughout —
the main bar, every dropdown panel (Matches/Captains' Corner/Council/
Wrangler/Profile), and their hover/active states. Text colours that
assumed a dark backdrop were swapped for the same tokens the rest of the
app's Warm Light surfaces already use: `text-parchment`→`#1C1917`,
`text-zinc-400`→`#44403C`, `text-zinc-500`/`text-zinc-600`→`#78716C`,
`text-red-400`→`#B91C1C` (crimson-dark), and the GC badge's dark-mode
`bg-sky-900/40 border-sky-700 text-sky-400` → a light-mode `bg-sky-50
border-sky-300 text-sky-700`. An active/selected dropdown row's highlight
changed from `bg-ink-3` to `#FEF3C7` (the same `--color-gold-light`
tinted-background token `ui-theme.md` defines for this exact purpose).
`text-gold`/`border-gold-dim`/`bg-gold/10` (the CAPTAIN badge, the sign-in
button, avatar borders) were left untouched, on the assumption they were
already the palette's light-surface accent colours (`#D97706`/`#B45309`)
— **this assumption turned out to be wrong for the bare Tailwind token**,
see the correction below.

**Correction (fixed September 2026, a few messages later) —
`border-ink-5` actually needed a real fix, not "zero edits."** The claim
above (in the original version of this section) that `border-ink-5`
already resolved to the light `#D4C9B0` tan was wrong — it was taken from
`ui-theme.md`'s "Tailwind Token Mapping" section, which turned out to
describe the *planned* Option 1 palette, not what `tailwind.config.ts`
actually ships. The real `ink.5` is `#2E2E2E`, a dark gray — so every
`border-ink-5` in the new white nav was rendering a dark border, not the
intended light one. Every occurrence in `SiteNav.tsx` was switched to the
literal `border-[#D4C9B0]` arbitrary-value class instead of the token.
`text-gold`/`border-gold-dim` were left alone even after this was found —
the real shipped values (`#C9A84C`/`#7A6030`, a more muted khaki-gold) are
a different shade from the documented `#D97706`/`#B45309`, but still read
as "gold" and weren't part of the reported symptom (a dark border/
background, not an off-shade accent colour) — see `ui-theme.md`'s
Tailwind Token Mapping section for the full correction and the
still-open gap between the two palettes.

`GenerateInviteItem.tsx`'s desktop (non-`mobile`) render branch — used
only inside `SiteNav`'s Council ⚖ dropdown — got the same treatment
(`text-zinc-400`→`#44403C`, the Copy/WhatsApp pill borders/colours
lightened to `emerald-700`/`emerald-300`/`sky`-style light equivalents,
error text →`#B91C1C`). Its `mobile` branch (rendered inside
`MobileTabBar`'s "More" sheet instead — a separate component with its own
independent light/dark `theme` prop, §4.1) was **not** touched — that
branch's colours are already a pre-existing, separate gap from this pass
(it's hardcoded dark regardless of `MobileTabBar`'s own theme prop), out of
scope for a change specifically about the top nav.

**Deliberately still just the nav bar, not a wider reskin.** Every page's
own body content — the dark hero bands on `/profile`, `/captains-corner`,
`/leaderboard`, the ink-dark default page background used everywhere
except the pages that have their own Warm Light rebuild — is unchanged.
A light nav sitting directly above a dark page body (the mirror image of
the dark nav that used to sit above the Home dashboard's light Warm Light
island) is an accepted seam, not a bug — reskinning every page body was
explicitly out of scope for this change.

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

### Stats ▾ dropdown (added September 2026)

The flat "Stats" link (→ `/leaderboard`) became a **Stats ▾** dropdown once
the club gained a team-level stats page alongside the player one:
"📊 Yours Statistically" → `/leaderboard` (`activePage === 'leaderboard'`)
and "🛡️ Team Record" → `/team-stats` (`activePage === 'team-stats'`). Same
hover-menu markup as Matches ▾ / Captains' Corner ▾, rendered right after
Captains' Corner ▾ (before the flat `links` array), gated on
`isLoggedIn && !isExpelled` like the old flat link. The mobile More sheet
gained a matching "Team Record" row directly under "Leaderboard". In the
same pass an "⚔️ Opponents" row (→ `/opponents`, `activePage === 'opponents'`)
was added as the last item of **Captains' Corner ▾**, **Council ⚖** and
**Wrangler ⚒** — desktop and the three matching mobile sheet sections —
since captains, GC and wranglers all manage the opponent master. See
`features/team-stats.md` §6.

### Role-conditional Nav Elements
 
- **Admin button** — crimson pill linking to `/admin`, shown if `isAdmin`
- **GC Review button** — gold bordered pill linking to `/gc-review`, shown if `isGC && !isAdmin`
- Both are also surfaced in the slim mobile top row (`SiteNav`'s `md:hidden` block), as compact text links next to the avatar — unrelated to `MobileTabBar`, which handles everything else on mobile
### Nav by Role (desktop)

| Role | Nav items visible |
|---|---|
| Public (not signed in) | Schedule · Sign In |
| Player | Home (logo) · Matches ▾ · Stats ▾ · The Dugout · My Profile |
| Captain | Home (logo) · Matches ▾ · Captains' Corner ▾ (Squad Selection, Unavailable Dates, Opponents) · Stats ▾ · The Dugout · Tournaments · My Profile |
| GC | Home (logo) · Matches ▾ · Stats ▾ · The Dugout · Tournaments · My Profile · Council ⚖ (… Grounds, Opponents) |
| Wrangler | + Wrangler ⚒ dropdown (Squad Backfill, Grounds, Opponents) |
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
`dugout`, `leaderboard`, `team-stats`, `opponents`, `profile`, `planner`, `captains`,
`captains-unavailable`, `gc`, `gc-players`, `wrangler`, `schedule` —
deliberately excludes `matches` and `my-stats`, both covered by their own
tab's `active` check instead).

### "More" sheet

A `fixed inset-x-0 bottom-16` panel (rounded top corners, scrollable, capped `max-h-[70vh]`) with a full-screen scrim behind it. Content branches the same way `SiteNav`'s desktop dropdowns do:

- **Expelled** — just an "Account suspended" notice, no links.
- **Logged in** — The Dugout (moved here from its own tab slot, September 2026 — see above; `ShieldIcon` at its sheet-row `size={16}`), Leaderboard (the club Honour Board, `/leaderboard` — added back September 2026 once "My Stats" stopped pointing here, see above), Team Record (`/team-stats`, September 2026 — see `features/team-stats.md`), My Profile and My Wallet (both hidden together with the rest of the "logged in" content if `playerId` is null, in favour of "Complete Registration" → `/join`; My Wallet added September 2026, `RupeeIcon` — see `features/wallet-ledger.md`), Tournament Planner (captain/GC/admin), then role-gated sections mirroring the desktop dropdowns 1:1:
  - **Captains' Corner** (`isCaptain || isAdmin`) — Squad Selection, Unavailable Dates, Opponents
  - **Council** (`isGC`) — Squad Review, Feedback, Players, Store Orders, Grounds, Opponents, `GenerateInviteItem`
  - **Wrangler** (`isWrangler`) — Squad Backfill, Grounds, Opponents
  - **Admin** (`isAdmin`) — Schedule, Admin Panel (crimson row)
  - Club Site (muted, external) and Sign Out always last.
- **Logged out** — Club Site + Sign In only.

### Reserving space for the fixed bar — `.has-mobile-tabbar`

Since the tab bar is `fixed`, page content needs bottom padding so the bar doesn't cover it. `MobileTabBar` toggles a `document.body.classList.add('has-mobile-tabbar')` in a `useEffect` (removed on unmount), and `src/app/globals.css` reserves `padding-bottom: 4.5rem` on `body.has-mobile-tabbar` under a `max-width: 767px` media query. This means the padding only ever applies on pages that actually mount `MobileTabBar` (i.e. render `SiteNav`) — the `/admin/*` subtree (which uses `AdminLayout`/`AdminSidebar` instead, see `admin_console.md`) is unaffected.

### Warm Light variant — `theme` prop, now the default everywhere (added September 2026, defaulted site-wide a few days later)

`MobileTabBar` accepts an optional `theme?: 'dark' | 'light'` prop.
Originally defaulted to `'dark'` (unchanged look), with `SiteNav` forwarding
it through its own `mobileTabBarTheme` prop — `<SiteNav activePage="fixtures"
mobileTabBarTheme="light" />` — so only `/fixtures` and `/matches/history`
(see `features/player-availability.md` §10.1 and
`features/post-match-scorecard.md` §16 for why those two pages went Warm
Light in the first place) opted in explicitly.

**Default flipped to `'light'` (fixed September 2026)** — per a direct
request for the bottom tab bar to render Warm Light "irrespective of the
page we are navigating," rather than adding `mobileTabBarTheme="light"`
one page at a time. `MobileTabBar`'s own default changed from `theme =
'dark'` to `theme = 'light'` (one-line change, `src/components/ui/MobileTabBar.tsx`),
so every page that renders `<SiteNav>` without the prop now gets the light
tab bar automatically — no per-page prop needed, and the ~20-odd pages
that never passed this prop at all needed zero changes. `'dark'` stays a
real, working option (nothing was deleted) for any page that might want
to explicitly opt back out via `mobileTabBarTheme="dark"`, though nothing
currently does. The three pages that already passed `mobileTabBarTheme="light"`
explicitly (Home, `/fixtures`, `/matches/history`) were left with that
explicit prop rather than cleaned up to rely on the new default — harmless
redundancy, and it documents original intent at each call site.

**This is a shared-chrome change, not a page-body reskin** — same
"deliberately still just the nav bar" posture §4's Warm Light nav note
already established for the top bar. A page whose own body content is
still dark-ink now sits between a light top nav and a light bottom tab
bar, both persistent chrome, with its own dark body in between — an
accepted seam, not a bug. See `ui-theme.md`'s Rollout Policy section for
the broader rule this follows: Warm Light is the default for new work,
existing page bodies aren't migrated without asking first.

Both the fixed tab bar and the "More" sheet read every colour from a small
`tokens(theme)` lookup (`src/components/ui/MobileTabBar.tsx`) rather than
hardcoded Tailwind classes — `'light'` swaps in the same Warm Light
palette as `DateChipSlider` (`#FFFFFF`/`#F8F4EE` surfaces, `#D97706` gold,
`#D4C9B0` borders), `'dark'` keeps the original ink/gold tokens
byte-for-byte. Every icon in the file was changed from a hardcoded
`stroke="#C9A84C"` to `stroke="currentColor"` so a single `color` set on
each row's wrapping `<span>`/`<Link>` (from the token lookup) tints the
icon too — no per-icon colour prop threading needed. The desktop nav and
the slim mobile top row in `SiteNav` itself are unaffected by this prop
either way (it only ever governs `MobileTabBar`) — both are already Warm
Light unconditionally on every page regardless, since the top nav's own
theme changed site-wide first — see §4's "Warm Light nav, site-wide" note.

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
| In-app back navigation — `SiteNav` `back` prop + shared `BackButton` | Medium | The installed PWA (`display: 'standalone'`) has no browser back button, and every existing "← …" link in the app is a hardcoded parent, never `router.back()`. Plan: `BackButton` (`router.back()` when in-app history exists, else a per-page fallback) rendered at the left of `SiteNav`'s mobile top row on every non-tab page. Full audit and checklist in `features/back-navigation.md`; backlog U-31 |
| `/join` route for unmatched Gmail users | Low | `SiteNav` links to `/join` for unmatched users but the page doesn't exist yet — currently dead link |
| Optimise `getPlayerData` queries | Low | Queries 3 and 4 both hit `bookings` — could be merged into one query with the pending count derived from the same result set |
| Consider `Promise.all` in `getPlayerData` | Low | Queries 2 and 3 are independent — running them in parallel would reduce TTFB on the home page |
 
