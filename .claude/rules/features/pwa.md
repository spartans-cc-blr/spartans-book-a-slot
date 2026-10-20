# PWA — Manifest, Service Worker, Loading Skeletons

**Spartans Hub · Added: October 2026**

---

## 1. Overview

Result of a PWA self-scan (October 2026). This pass fixed the concrete bugs and added instant loading placeholders. Larger ideas (install prompt, offline availability queue, caching the stats pages, merging the three global modal fetches) are listed in §6 and not built.

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

`public/sw.js`, `public/offline.html`, `src/app/manifest.ts`, `src/app/layout.tsx`, `public/icons/*`, `public/apple-touch-icon.png`, `public/images/logo-128.png`, `src/components/ui/PageSkeleton.tsx`, `src/app/*/loading.tsx`.

## 6. Not built (ideas, roughly by value)

- Android `beforeinstallprompt` banner and an iOS "Add to Home Screen" coach-mark.
- Ask for push permission in context (after first availability tap).
- Short `revalidate` plus `revalidateTag` after scorecard sync for the stats pages (currently `revalidate = 0`).
- Tab-bar link prefetch; Home skeleton via route group.
- Stale-while-revalidate cache of last `/fixtures` data and Background Sync for availability taps.
- `navigator.setAppBadge` with the unmarked-availability count; manifest `screenshots`.
- Merge the three global modal fetches into one request.
