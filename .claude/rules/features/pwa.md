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

## 4. Loading skeletons

`src/components/ui/PageSkeleton.tsx` (server component, `animate-pulse`, light/dark) renders a nav-height bar plus placeholder cards, table or list. `loading.tsx` files using it exist for `/fixtures`, `/matches/history`, `/leaderboard`, `/team-stats`, `/players`, `/wallet`, `/profile`, `/captains-corner`. They stream immediately, so a tap shows content at once while a cold server function works.

Not added for `/` (a root `loading.tsx` would also wrap `/login`, `/schedule` and `/admin/**`), nor for admin pages. Moving Home into a route group would allow it.

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

- Home skeleton via route group; stale-while-revalidate cache of last `/fixtures` data; Background Sync for availability taps.
- `navigator.setAppBadge` with the unmarked-availability count; manifest `screenshots`.
- Merge the three global modal fetches into one request.
- Tab-bar prefetch needs no change: `loading.tsx` now lets Next prefetch the skeleton for dynamic routes through the existing `Link`s.
