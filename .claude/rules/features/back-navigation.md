# In-App Back Navigation — Gap & Implementation Plan

**Spartans Hub · Status: ✅ Built (steps 1–6) · Follow-on §3 pending · September 2026**

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

### Audit (11 Sep 2026 — the state *before* this shipped)

Every back affordance in `src/` at the time, and what it actually did.
All of these were replaced by `BackButton` the same day (§4):

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

### `BackButton` — `src/components/ui/BackButton.tsx`

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

Next's App Router has no API for "did this session navigate here", and
`window.history.length` counts entries from before the app was opened, so
the Hub keeps its own per-tab stack. `NavHistoryProvider`
(`src/components/ui/NavHistoryProvider.tsx`, mounted once in
`src/app/providers.tsx` inside `SessionProvider`) feeds every
pathname+search change through the pure reducer `recordNavigation()`
(`src/lib/navHistory.ts`) and persists the result to `sessionStorage`
(`hub-nav-history`). The reducer classifies each URL change against the
stack's neighbours — equals the previous entry → *back* (pointer−1),
equals the next entry → *forward* (pointer+1), otherwise → *push*
(truncate forward entries, append). `canGoBack = pointer > 0`, exposed
via `useCanGoBack()`. Unit-tested in `src/lib/navHistory.test.ts`.

**Why a counter wasn't enough** (the first draft of this doc proposed
one): a plain depth counter can't tell a back navigation from a push, so
it would keep growing as the player went *back*, and `canGoBack` would
stay true on the entry page — exactly the case where `router.back()`
leaves the app. The stack heuristic can still misclassify a forward
navigation to the same URL as the previous entry as "back", but that
fails safe (pointer too *low* → fallback link one step early), never the
other way.

`sessionStorage` is per-tab and cleared when the tab (or the standalone
PWA) closes — the lifetime of the browser history it mirrors.
`document.referrer` is *not* a substitute: empty in standalone mode and
after client-side navigations. `useSearchParams()` needs a Suspense
boundary during static rendering, so the tracker is an inner component
wrapped in `<Suspense fallback={null}>`.

### Where it renders — the rule

**Any page that isn't a bottom-tab destination shows a back affordance on
mobile.** Concretely:

- `SiteNav` has an optional `back?: SiteNavBack` prop
  (`{ fallbackHref, label }`). When set, a `md:hidden` `BackButton
  variant="nav"` ("‹ Back" / "‹ {label}") renders at the far left of the
  top row, before the logo lockup — the standard mobile position. Desktop
  keeps each page's own inline text link (`className="hidden md:inline-flex"`
  on the page-body `BackButton`, so the two never show together); the
  browser has a back button there and a chevron would be noise.
- The six pages that had a hardcoded back link now render `BackButton`
  with that same destination as `fallbackHref`:
  `/matches/history/[bookingId]` (→ Past Matches), `/fixtures/[id]` (→ All
  fixtures; this page has no `SiteNav`, so its inline `BackButton` shows on
  every width), `/dugout/gear/[id]` (→ Gear Exchange), `/profile` (→ Home,
  all three `SiteNav` render branches), `/admin/bookings/[id]` (→ `/admin`,
  labelled "Matches").
- Pages that had none: `/players/[id]/stats` (→ Leaderboard — but **only
  when viewing someone else's stats**; a player's own page is the "My
  Stats" bottom tab, so no back there), `/opponents` (→ Team Record),
  `/wallet` (→ Home), `/captains-corner/unavailable-dates` (→ Squad
  Selection).
- `/admin/**` otherwise unchanged — it renders `AdminLayout`/`AdminSidebar`,
  not `SiteNav`, and is desktop-first.
- Bottom-tab destinations (`/`, `/fixtures`, own `/players/[id]/stats`)
  and the two pages the tab bar's "More" sheet treats as roots
  (`/leaderboard`, `/team-stats`) show **no** back — they are where back
  lands, not somewhere to go back *from*.

### `fixtures/[id]` and body-level `BackButton`s keep their old colours

`BackButton`'s default text colour is `text-gold`; a page whose old link
used a different colour passes `!text-…` overrides via `className` so
nothing visibly changed except the behaviour (e.g. `/fixtures/[id]`'s muted
grey, `/profile`'s bordered zinc button, Gear Exchange's amber).

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

| # | Step | Files | Status |
|---|---|---|---|
| 1 | Nav-history stack (`sessionStorage`, pathname+search) + `useCanGoBack()` hook | `src/lib/navHistory.ts` (pure reducer + tests), `src/components/ui/NavHistoryProvider.tsx`, mounted in `src/app/providers.tsx` | ✅ 11 Sep 2026 |
| 2 | `BackButton` — `router.back()` vs `<Link fallbackHref>`, label switches accordingly | `src/components/ui/BackButton.tsx` | ✅ |
| 3 | `SiteNav` `back` prop → renders `BackButton variant="nav"` at the left of the `md:hidden` top row | `src/components/ui/SiteNav.tsx` | ✅ |
| 4 | Swap the six hardcoded back links for `BackButton` (same fallbacks) | `matches/history/[bookingId]`, `fixtures/[id]`, `dugout/gear/[id]`, `profile`, `admin/bookings/[id]` | ✅ |
| 5 | Add `back` to pages with none | `players/[id]/stats` (others' pages only), `opponents`, `wallet`, `captains-corner/unavailable-dates` | ✅ |
| 6 | Doc pass — `navigation.md` §4 (SiteNav prop, the rule), this file | `.claude/rules/**` | ✅ |
| 7 | Follow-on: URL-driven filters on `/matches/history`, then `/players/[id]/stats` (§3) | `MatchHistoryClient.tsx`, `PlayerStatsClient.tsx` | ⏳ Pending |

**Verified at build time:** `tsc`, vitest (5 new reducer tests covering
push / back / forward / truncate / repeat), and a full `next build`
(the `useSearchParams()` Suspense requirement is what the build checks).
**Still to verify on a real device** (no env in the build container):
install the PWA on an iPhone, open Team Record → tap a match → "‹ Back"
returns to Team Record with the same split and filters; open the same
match URL fresh from a WhatsApp message → "‹ Past Matches" goes to the
list. Both without any browser chrome. Note the first server render has
no history yet, so a hydrating page briefly shows the fallback label
before flipping to "Back" — a one-frame flicker, accepted.

**Security:** none — purely client-side navigation; `router.back()` and
`<Link>` both stay within the same origin, and the fallback hrefs are
hardcoded per page, never read from the URL (so a crafted
`?back=https://…` can never redirect anyone).

---

## 5. File map

| File | Role |
|---|---|
| `src/lib/navHistory.ts` | `recordNavigation()` / `canGoBack()` — pure per-tab history-stack reducer |
| `src/lib/navHistory.test.ts` | Vitest coverage of the reducer |
| `src/components/ui/NavHistoryProvider.tsx` | Tracks pathname+search changes, persists to `sessionStorage`, exposes `useCanGoBack()` |
| `src/app/providers.tsx` | Mounts `NavHistoryProvider` inside `SessionProvider` |
| `src/components/ui/BackButton.tsx` | The shared control — `router.back()` or fallback `<Link>`; `inline` and `nav` variants |
| `src/components/ui/SiteNav.tsx` | `back?: SiteNavBack` prop → mobile top-row `BackButton` |
| The pages listed in §4 steps 4–5 | Each passes its fallback to `SiteNav` and/or renders an inline `BackButton` |

## 6. Tracking

Backlog item **U-31** in `pending-backlog.md` (steps 1–6 ✅, step 7
pending). Also referenced from `features/team-stats.md` §9 (where the gap
was reported) and `navigation.md` §8.

---

*Maintained by: Spartans CC BLR*
