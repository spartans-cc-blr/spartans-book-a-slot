# In-App Back Navigation — Gap & Implementation Plan

**Spartans Hub · Status: 📝 Documented, not yet built · September 2026**

---

## 1. The gap

The Hub is installed as a PWA (`src/app/manifest.ts`, `display:
'standalone'` — the install path `features/push-notifications.md` walks
every iPhone player through so web push works). In standalone mode there
is **no browser chrome**: no address bar, no back button. On Android the
system back gesture still works; on iOS a standalone PWA has no reliable
back gesture at all. So every drill-down in the app — tapping a match on
Team Record, a stat tile on Home, a row on the Honour Board, a player's
name anywhere — is a one-way trip unless the destination page draws its
own way back.

Reported live from Team Record (September 2026): tapping a match in a
split opens `/matches/history/[bookingId]`, whose only exit is a
hardcoded "← Past Matches" link — which is not where the player came
from. The same shape exists Hub-wide.

### Audit (11 Sep 2026)

Every back affordance in `src/` today, and what it actually does:

| Page | Affordance | Destination | Problem |
|---|---|---|---|
| `/matches/history/[bookingId]` | "← Past Matches" `<Link>` | `/matches/history` (always) | Reached from Team Record, Home's Matches Played tile, Honour Board rows, a player's stats page, the wrangler's WhatsApp share — the link ignores all of them |
| `/fixtures/[id]` | "← All fixtures" `<a>` | `/fixtures` (always) | Reached from a squad-announcement push (`/fixtures/<id>`) or Home's "You're Selected to Play" card |
| `/dugout/gear/[id]` | "← Back to Gear Exchange" | `/dugout/gear` (always) | Reached from a share link too |
| `/profile` | "← Back" button | `router.push('/')` (always) | Reached from the nav, Home quick actions, `/wallet`, the tab bar |
| `/admin/bookings/[id]` | "← Back" button | `router.push('/admin')` (always) | Reached from `/admin/wallet`'s pending fees, the fee-reminder modal, `/admin/schedule` |
| `/players/[id]/stats` | **none** | — | Reached from every `PlayerNameLink` in the app, Home's My Stats tab, `/profile`, Captains' Corner, the leaderboard |
| `/team-stats`, `/opponents`, `/wallet`, `/leaderboard`, `/captains-corner/unavailable-dates`, `/gc-players`, `/wrangler/*` | **none** | — | Top-level-ish, but `/opponents` and `/wallet` are commonly entered *from* another page |

Zero call sites use `router.back()` or `history.back()`. Every existing
"back" is really a "go to this page's parent", which is right only when
the player arrived from that parent.

---

## 2. Design

**One shared component, two behaviours, one rule.**

### `BackButton` — `src/components/ui/BackButton.tsx` (to build)

```tsx
<BackButton fallbackHref="/matches/history" fallbackLabel="Past Matches" />
```

- **If the player navigated here inside the app → `router.back()`.**
  Returns to the exact page they came from — Team Record with its filters,
  the Honour Board month they were on, the player page they tapped through
  from — with Next's own scroll restoration.
- **If they landed here cold → `<Link href={fallbackHref}>`.** A WhatsApp
  share link, a push notification tap, a bookmark, a PWA launch on a deep
  URL: there is no in-app history, so `router.back()` would leave the app
  (or do nothing in standalone mode). Every page keeps declaring its
  natural parent as the fallback — exactly the destinations the hardcoded
  links use today, so nothing regresses.
- Label: "← Back" when going back, "← {fallbackLabel}" when falling back —
  the player can see which one they're about to get.

### Knowing whether in-app history exists

Next's App Router has no API for "did this session navigate here". Add a
tiny tracker to `src/app/providers.tsx` (client, already wraps every
page): on every `usePathname()` change, increment a `sessionStorage`
counter (`hub-nav-depth`). `canGoBack = depth > 1`. `sessionStorage` is
per-tab and cleared when the tab (or the standalone PWA) closes, which is
exactly the lifetime of the browser history it mirrors. `document.referrer`
is *not* a substitute — it's empty in standalone mode and after client-side
navigations.

### Where it renders — the rule

**Any page that isn't a bottom-tab destination shows a back affordance on
mobile.** Concretely:

- `SiteNav` gains an optional `back?: { fallbackHref: string; label: string }`
  prop. When set, the slim mobile top row (`md:hidden`) renders
  `BackButton` at the far left, before the logo lockup — the standard
  mobile "‹" position. Desktop keeps a normal per-page text link where one
  exists today (desktop always has a browser back button; the chevron would
  be noise).
- Pages that already have a hardcoded back link swap it for `BackButton`
  with the same destination as `fallbackHref` — six files, no new
  destinations to decide.
- `/players/[id]/stats`, `/opponents`, `/wallet`,
  `/captains-corner/unavailable-dates` gain one (currently none).
- `/admin/**` is out of scope — it renders `AdminLayout`/`AdminSidebar`,
  not `SiteNav`, and is desktop-first; its existing `router.push('/admin')`
  button can adopt `BackButton` with `/admin` as the fallback in the same
  pass, but nothing else there changes.
- Bottom-tab destinations (`/`, `/fixtures`, own `/players/[id]/stats`)
  and the two pages the tab bar's "More" sheet treats as roots
  (`/leaderboard`, `/team-stats`) show **no** back — they are where back
  lands, not somewhere to go back *from*.

### Standalone-only, or always?

Always, on mobile widths. A mobile browser tab does have a back button,
but a consistent in-content "‹ Back" at the top-left is the pattern every
native app uses, costs one row of ~40px, and means the installed PWA and
the browser render identically (no `display-mode: standalone` media-query
branching to test). Desktop is unchanged.

---

## 3. Related gap this exposes — list pages lose their filters on back

`router.back()` restores the URL and scroll, not React state. Pages whose
filters are **URL-driven** come back exactly as left: `/leaderboard`,
`/team-stats` (every filter is a `searchParams` key — `features/team-stats.md`
§3). Pages whose filters are **component state** reset to defaults:
`/matches/history` (`MatchHistoryClient.tsx` — month/role/tournament/
ground/format/day filters are all `useState`; only `?month=all` is read
from the URL, see `features/post-match-scorecard.md` §16.1), and
`/players/[id]/stats` (`PlayerStatsClient.tsx`'s year/ground/format/
captain/innings filters).

So even once `BackButton` lands, "tap a match from Past Matches, come
back" drops the player on the current month again. The fix is the same
one Team Record already uses: **mirror filter state into `searchParams`
via `router.replace()`** (not `push`, so filter changes don't pollute the
back stack) and seed initial state from them. Scoped as a follow-on to the
`BackButton` work, one page at a time; `/matches/history` first since it's
the most common drill-down target.

---

## 4. Implementation checklist

| # | Step | Files |
|---|---|---|
| 1 | Nav-depth tracker (`sessionStorage`, `usePathname()`) + `useCanGoBack()` hook | `src/app/providers.tsx` (or a new `src/components/ui/NavHistoryProvider.tsx` mounted there) |
| 2 | `BackButton` — `router.back()` vs `<Link fallbackHref>`, label switches accordingly | `src/components/ui/BackButton.tsx` |
| 3 | `SiteNav` `back` prop → renders `BackButton` at the left of the `md:hidden` top row | `src/components/ui/SiteNav.tsx` |
| 4 | Swap the six hardcoded back links for `BackButton` (same fallbacks) | `matches/history/[bookingId]`, `fixtures/[id]`, `dugout/gear/[id]`, `profile`, `admin/bookings/[id]` |
| 5 | Add `back` to pages with none today | `players/[id]/stats`, `opponents`, `wallet`, `captains-corner/unavailable-dates` |
| 6 | Doc pass — `navigation.md` §4 (SiteNav prop, the rule), this file → "Built" | `.claude/rules/**` |
| 7 | Follow-on: URL-driven filters on `/matches/history`, then `/players/[id]/stats` (§3) | `MatchHistoryClient.tsx`, `PlayerStatsClient.tsx` |

**Verification, when built:** install the PWA on an iPhone, open Team
Record → tap a match → "‹ Back" returns to Team Record with the same split
and filters; open the same match URL fresh from a WhatsApp message →
"‹ Past Matches" goes to the list. Both without any browser chrome.

**Security:** none — purely client-side navigation; `router.back()` and
`<Link>` both stay within the same origin, and the fallback hrefs are
hardcoded per page, never read from the URL (so a crafted
`?back=https://…` can never redirect anyone).

---

## 5. Tracking

Backlog item **U-31** in `pending-backlog.md`. Also referenced from
`features/team-stats.md` §9 (where the gap was reported) and
`navigation.md` §8.

---

*Maintained by: Spartans CC BLR*
