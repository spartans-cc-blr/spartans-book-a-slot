# PWA — Manifest, Service Worker, Loading Skeletons

**Spartans Hub · Added: October 2026**

---

## 1. Overview

Result of a PWA self-scan (October 2026). This pass fixed the concrete bugs and added instant loading placeholders. The install prompt, contextual push prompt and cached stats data were added in a second pass (§6-§8); remaining ideas are in §9.

## 2. Service worker — `public/sw.js`

- `VERSION` constant names the cache (`spartans-static-vN`); bump it to purge old caches on activate.
- Precaches `/offline.html`, the small logo and the 192px icon. The old worker pointed its fallback at `/offline`, a route that never existed and was never cached, so offline navigations showed the browser error page.
- Page navigations stay **network-only** (`cache: 'no-store'`): pages are session-bound. Offline falls back to `/offline.html`.
- Cache-first only for `/_next/static/`, `/icons/`, `/images/` (immutable or rarely changing). Everything else, `/api/*`, non-GET and cross-origin requests are not intercepted.
- Push: icon `/icons/icon-192.png`, monochrome `badge-96.png`, `tag` (defaults to the target URL) so repeat notifications for one destination replace each other. `notificationclick` focuses an existing app window and navigates it, opening a new window only if none exists.

## 3. Manifest and icons

- `any` and `maskable` icons are separate files (`icon-*.png` and `icon-maskable-*.png`, logo at 62% on the dark `#080808` base so the safe zone is respected). `apple-touch-icon.png` (180px) is set through `metadata.icons.apple`.
- `background_color` `#F8F4EE` and `theme_color` `#FFFFFF` match the default Warm Light theme. `viewport.themeColor` in `layout.tsx` switches the browser bar to `#111111` for dark mode. Android splash is a single static colour, so a dark-mode user sees a light splash; accepted.
- App shortcuts: Mark availability (`/fixtures`), My wallet, Leaderboard. `id` stays `/` (see `navigation.md` §1).
- `SiteNav`, admin layout, join page and the tournament share card now use `/images/logo-128.png` (26KB) instead of the 2.6MB `Transparent High Resolution.png`, which was being downloaded to render a 32px nav logo on every page. The original stays in `public/` as the source for icons.

### 3.1 Lighthouse pass on `/fixtures` (October 2026, mobile: perf 89, a11y 89, best practices 77, SEO 100)

Fixed: avatar link in the mobile nav had no accessible name (`aria-label`); `/fixtures` content wrapped in `<main>` (and the same `<main>` landmark on Home, leaderboard, team-stats, profile, wallet, captains-corner and schedule; the nav and footer stay outside it); contrast failures: light tab bar accent `#B45309` and inactive `#78716C`, Upcoming/Past pill uses `--fx-accent-dim` with `--fx-text-2` for the inactive label; small images served at display size (`logo-64.png` for 28-40px uses, `cricheroes-64.png` replaces the 38KB jpg); SW cache `v3`.

Not fixed, by decision: the Google avatar sets a third-party `COMPASS` cookie (the whole best-practices gap). Routing avatars through `next/image` would stop it but spends Hobby's 1000 source-image optimisation quota; `crossOrigin="anonymous"` is unverified against lh3 CORS headers. Back/forward cache is blocked by Next's `no-store` on dynamic pages. LCP is dominated by an element render delay (~1.9s on the throttled run, TTFB 32ms), i.e. framework JS and hydration (the 31KB shared chunk costs ~700ms of scripting at 4x throttle), not the server. The report was captured with a Chrome extension active, which inflates unused-JS and blocking-time figures; re-run in an incognito window for a clean baseline.

### 3.2 Lighthouse timespan on `/matches/history` (October 2026, mobile: performance 44, best practices 68)

Layout shift was 0.51 (poor). The list rendered a one-line "Loading…" while `/api/matches/history` took ~1.7s, then the chip slider, count and match cards all appeared at once and pushed everything down. Loading now renders four placeholder cards (`min-h-[330px]`, same grid) so the height is already reserved. Separately, every player-name link and tournament link in the scorecard prefetched its page (nine `/players/*/stats?_rsc` requests when one scorecard opened); `PlayerNameLink` and the tournament links now use `prefetch={false}`. Remaining: total blocking time 410ms (framework JS), and the Google avatar cookie noted above.

## 4. Loading skeletons

`src/components/ui/PageSkeleton.tsx` (server component, `animate-pulse`, light/dark) renders a nav-height bar plus placeholder cards, table or list. `loading.tsx` files using it exist for `/fixtures`, `/matches/history`, `/leaderboard`, `/team-stats`, `/players`, `/wallet`, `/profile`, `/captains-corner`. A pulsing centered Spartans logo (fixed overlay, `logo-128.png`) is drawn over the placeholders, and dark-mode bars use `zinc-700/70`, because the original `ink-4` bars on the `#080808` page were close enough to black to read as a blank screen. They stream immediately, so a tap shows content at once while a cold server function works.

Home has one too: `src/app/page.tsx` moved to `src/app/(home)/page.tsx` so a `(home)/loading.tsx` wraps only `/` (route groups don't change URLs; a root `loading.tsx` would also wrap `/login`, `/schedule` and `/admin/**`). Not added for admin pages.

## 5. Files

`public/sw.js`, `public/offline.html`, `src/app/manifest.ts`, `src/app/layout.tsx`, `public/icons/*`, `public/apple-touch-icon.png`, `public/images/logo-128.png`, `src/components/ui/PageSkeleton.tsx`, `src/app/*/loading.tsx`, `src/components/ui/InstallPrompt.tsx`, `src/lib/statsCache.ts`.

## 6. Install prompt — `src/components/ui/InstallPrompt.tsx`

Mounted once in `layout.tsx`. Shown to signed-in, non-expelled members who are not already in the installed app, from their **second** browser session onward (`hub-visit-count` in localStorage), and not again for 30 days after "Not now". Android/Chrome: captures `beforeinstallprompt` and offers a one-tap Install. iOS (including iPadOS reporting as Mac): no install API exists, so it shows "Share, then Add to Home Screen" and says this is needed for squad notifications. `appinstalled` sets `hub-installed` and hides it. Blocked storage means it stays quiet.

## 7. Push prompt timing

`PushSubscribePrompt` (on `/fixtures`) no longer opens on page load. `FixturesWeekend` dispatches `hub:availability-saved` after a successful save, and the prompt checks its usual conditions (supported, not denied, not subscribed, not dismissed in 14 days) at that moment. On iOS the prompt only appears once the app is installed, since Safari tabs have no `PushManager`; the install prompt covers that gap.

## 8. Cached stats data — `src/lib/statsCache.ts`

The stats pages must stay dynamic (they read the session), so caching is one level down: `cachedStats()` wraps `unstable_cache` with tag `stats` and a 5 minute TTL. Wrapped: `getTeamMatches`, `getLeaderboard`, `getFilterOptions`, `getAvailableMonths`, `getPerformances`, `getTopScorersByBattingPosition`, `getPartnershipLeaders`, `getBreakthroughLeaders`, `getCareerHighlightsByPlayer`, `getSeasonCapHolders` (originals are `*Uncached`, same file). Arguments form the cache key. Results must survive a JSON round trip (no Date/Map/Set) and stay under the 2MB entry limit; true today.

`invalidateStatsCache()` (`revalidateTag('stats')`, wrapped in try/catch) is called at the end of `syncMatchStatsForBooking()`, after a player-reconciliation confirm/reconcile that updated rows, and on opponent create/edit/link/merge and booking PATCH. A new scorecard therefore shows straight away; other edits show within 5 minutes at most. Not wrapped (called with many argument shapes or per-player): `getPlayer*`, `getLeaderboardsByTournament/Ground`, `getRecentForm`, `getStandBaselines` (own 10 minute memo). Calling a wrapped function outside a Next request (scripts) would fail; none do, and the tests don't call them.

## 9. Not built (ideas, roughly by value)

- Stale-while-revalidate cache of last `/fixtures` data; Background Sync for availability taps.
- Manifest `screenshots`.
- Tab-bar prefetch needs no change: `loading.tsx` now lets Next prefetch the skeleton for dynamic routes through the existing `Link`s.

## 10. One request for the global modals (October 2026)

The milestone, birthday and admin fee-reminder modals each fetched on every full page load. `GET /api/modals/pending` now returns `{ achievements, birthdays, bookings }` in one call; `ModalFeedProvider` (root layout) fetches it once and the three modals read it via `useModalFeed()`. Each part keeps its old rules (signed-in, non-expelled; fees admin only, and an admin without a player row still gets fees); one part failing returns an empty list for it. The data readers live in `src/lib/modalFeed.ts`, shared with the original `/api/milestones/unseen` and `/api/birthdays/today` routes, which remain (the modals still POST their own `mark-seen`).

## 12. App icon badge (October 2026)

`navigator.setAppBadge(n)` shows how many upcoming fixtures the player hasn't marked. `GET /api/modals/pending` returns `unmarked` (from `getUnmarkedFixtureCount()` in `src/lib/modalFeed.ts`: confirmed, not availability-locked, not yet ended, no `availability` row for the player; `null` if the lookup failed), and `AppBadge` (root layout, reads `useModalFeed()`) sets or clears it. It updates when the app is opened or reloaded, not in the background, and is cleared on sign-out. Works for installed PWAs on Android, iOS 16.4+ home-screen apps and desktop; elsewhere the call is a no-op. It is a count only: it doesn't show fixture data, and it doesn't account for knockout ineligibility, so a player who can't mark a knockout may still be counted.
