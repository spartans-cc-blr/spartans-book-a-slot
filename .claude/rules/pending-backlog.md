# Spartans Hub — Prioritised Pending Backlog
 
**Spartans CC BLR · hub.spartanscricketclub.in**
**Generated: April 2026 · Based on vibe-security audit + project docs**
 
Priority order: **Security → External Dependencies → User Experience**
 
---
 
## 🔴 Critical — Security (Block Sprint 3)
 
These must be resolved before any payment code is written. Per the vibe-security audit principle: *never trust the client — every write path must be server-side validated and rate-limited.*
 
### S-1 · Dedicated wallet transaction route
**File:** `src/app/api/players/route.ts`
`wallet_balance` is currently patchable via the general admin PATCH with no audit trail. An admin error (or a compromised admin session) can silently modify balances with zero forensic trail.
 
**Fix:** Create `/api/wallet/transactions` — POST creates an immutable ledger row and derives the new balance. Remove `wallet_balance` from the PATCH allowlist on `/api/players`.
 
**Vibe-security check:** Client-side trust — price/balance manipulation vector. Ref: `payments.md`.
 
---
 
### S-2 · Rate limiting on all write routes
**Status:** ⚠️ `rateLimit()` utility exists (`src/lib/rateLimit.ts`) but not applied to all routes.
 
**Routes confirmed missing rate limiting:**
- `POST /api/bookings`
- `PATCH /api/bookings/[id]`
- `POST /api/squad/submit`
- `POST /api/squad/announce`
- `PATCH /api/gc/weekend-review`
- `PATCH /api/players/[id]` (player self-edit)
- `POST /api/players` (admin add player)
- `POST /api/push/subscribe`
**Fix:** Apply `rateLimit(req, RATE_LIMITS.playerWrite, session.player.id)` at the top of each route handler — use the existing `RATE_LIMITS` presets; prefer player ID as the identifier over IP for authenticated routes.
 
**Vibe-security check:** Rate limiting & abuse prevention. Ref: `rate-limiting.md`.
 
---
 
### S-3 · Zod input validation on all API routes
**Status:** ❌ No validation library in use — all routes do ad-hoc `if (!field)` checks.
 
**Risk:** Payment inputs, jersey numbers, WhatsApp numbers, and CricHeroes URLs can be sent with unexpected types or lengths, causing silent DB errors or stored XSS via unvalidated URL fields.
 
**Priority routes:**
1. `POST /api/player-availability` — `response` field must be enum `Y|E|O|L`
2. `PATCH /api/players/[id]` — `whatsapp` format, `jersey_number` range (1–99), `cricheroes_url` must match `chshare.link/*` pattern
3. `POST /api/bookings` — full booking shape
4. Any future payment route
**Fix:** `npm install zod` and add a shared `src/lib/schemas.ts` with reusable Zod schemas. Parse at the top of each handler before DB calls.
 
---
 
### S-4 · `availability/weekend` array size cap
**File:** `src/app/api/availability/weekend/route.ts`
**Status:** ⚠️ `booking_ids` query param is split and passed to `.in()` with no cap. A malformed request with hundreds of IDs causes an unbounded DB query.
 
**Fix (1 line):**
```ts
const ids = rawIds.slice(0, 20)  // add before .in(ids)
```
 
---
 
### S-5 · `NEXTAUTH_URL` explicitly set in Vercel production
**Status:** ⚠️ Unconfirmed — if Vercel is deriving this from the deployment URL, OAuth callback mismatches can silently occur on custom domain deployments or preview URLs.
 
**Fix:** Confirm `NEXTAUTH_URL=https://hub.spartanscricketclub.in` is set as an explicit environment variable in Vercel dashboard (not just inferred).
 
---
 
## 🟠 High — External Dependencies
 
These have dependencies on other systems (analytics app, third-party APIs, ownership transfers) and need to be sequenced before UX work that relies on them.
 
### E-1 · Player stats API from analytics app
**Status:** ✅ Closed — superseded, July 2026.

The `spartansccianalytics.vercel.app` REST-API approach described below was
never built — it was superseded by a different, already-shipped mechanism:
a Python microservice (`spartans-python`, hosted on Render) that fetches
CricHeroes PDFs directly (manual upload or automated fetch), parses them,
and writes to a separate analytics Supabase project that the Hub reads from
directly (`ANALYTICS_SUPABASE_URL`/`KEY`) rather than through a REST API
contract. Full detail in `features/post-match-scorecard.md`. Player-facing
stats display (item 3 below) remains open as a genuinely separate task —
`match_stats_cache` currently only feeds the `/matches/history` scorecard
view, not `/profile` or `/fixtures/[id]` player cards yet.

<details>
<summary>Original text (kept for history)</summary>

**Dependency:** `spartansccianalytics.vercel.app` (maintained by data wrangler)
 
CricHeroes is a JS-rendered SPA — server-side scraping is not viable. The analytics app parses CricHeroes scorecards and is the planned source for player stats.
 
**Action items:**
1. Agree API contract with data wrangler: endpoint shape, auth (bearer token or open), CORS policy for `hub.spartanscricketclub.in`
2. Build player self-entry fallback on `/profile` (immediate fallback while API is being built)
3. Integrate stats API call into `/fixtures/[id]` and `/profile` player cards once live

</details>
---
 
### E-2 · GitHub Org + Vercel + Supabase ownership transfer
**Risk:** Repo at `github.com/spartans-cc-blr/spartans-book-a-slot` and Vercel/Supabase projects may be under a personal account. If that account becomes inaccessible, the club loses the production system.
 
**Fix:**
1. Migrate GitHub repo to a club-owned org (if not already done)
2. Transfer Vercel project to a team owned by the club Gmail
3. Transfer Supabase project ownership to the club Gmail
4. Rotate all secrets after transfer
---
 
### E-3 · CricHeroes match URL backfill for existing bookings
**Status:** ⚠️ Confirmed bookings created before the `cricheroes_url` field was added have no match URL.
 
**Fix:** Backfill via admin edit page for past and current confirmed bookings. This unblocks the WhatsApp announcement text being complete for all slots.
 
---
 
### E-4 · GC review page — full `ground` join
**File:** `src/app/gc-review/page.tsx`
**Status:** ❌ Fetches bookings without the `ground` join — the WhatsApp announcement text generated on the GC review page is missing venue, maps URL, and hospital URL.
 
**Fix (surgical):**
```ts
// Add to the .select() in gc-review/page.tsx:
ground:grounds(name, maps_url, hospital_url), match_time, cricheroes_url
```
 
---
 
## 🔴 Critical — Security (continued, new items)
 
### S-6 · Case-insensitive email matching on sign-in and sign-up
**Risk:** A player registered as `Muthu@Gmail.com` cannot sign in as `muthu@gmail.com` — or worse, two `players` rows can exist for the same person with differently-cased `gmail_id`. With 155 players this is a silent data integrity bomb.
 
**Fix (two places):**
1. `src/lib/auth.ts` — normalise `email.toLowerCase()` before the `players` lookup in the JWT callback.
2. Any future sign-up / admin "add player" flow — store `gmail_id` as `.toLowerCase()` at insert time.
3. One-off SQL migration: `UPDATE players SET gmail_id = LOWER(gmail_id);` + add a `UNIQUE` constraint to prevent future duplicates.
**Vibe-security check:** Auth bypass / account enumeration. Ref: `authentication.md`.
 
---
 
### S-7 · Session retention — reduce forced re-authentication
**Status:** ❌ Players are prompted to sign in more frequently than expected on the same device.
 
**Root cause options (in order of likelihood):**
1. `NEXTAUTH_SECRET` was rotated or is inconsistent across deployments, invalidating all existing JWTs.
2. NextAuth `session.maxAge` is at default (30 days) but `jwt.maxAge` is shorter — tokens expire and re-authentication is required mid-session.
3. Vercel serverless cold starts cause `NEXTAUTH_URL` mismatch issues.
**Fix:**
```ts
// src/app/api/auth/[...nextauth]/route.ts (or auth.ts)
session: { strategy: 'jwt', maxAge: 30 * 24 * 60 * 60 },  // 30 days
jwt:     { maxAge: 30 * 24 * 60 * 60 },                    // match session maxAge
```
Confirm `NEXTAUTH_SECRET` is stable in Vercel and has not been rotated without re-signing sessions.
 
**Vibe-security check:** Session management. Ref: `authentication.md`.
 
---
 
### S-8 · Availability lock — Thursday blanket lock (Thursday auto-lock)
**Status:** ⚠️ Implemented, but with a rocky reliability history — two real bugs found and fixed; the current fix has not yet been confirmed working on a live Thursday as of this writing (2026-07-15, next Thursday is 2026-07-16).

**Implemented design:**
- `bookings.availability_locked = true` is set on all qualifying confirmed Sat/Sun rows in one UPDATE — no Y-count condition, blanket lock. Idempotent — already-locked rows skipped.
- `POST /api/player-availability` and `DELETE /api/player-availability` both hard-block locked slots for players. Captains, GC, and Admins bypass via `isCaptain || isGC || isAdmin` session check.
- Squad submission (`pending_approval`, `approved`, `announced`) adds a second independent freeze via `checkFreeze()` — either condition is sufficient to block.
- **Single error message** for all frozen states: `"Availability locked — Squad selection in progress"`
- Captain handles all post-lock pool changes via `POST /api/captain-availability`.

**Original design (superseded):** Lock was conditional on ≥12 Y-responses. Replaced by blanket time-based lock after club leader decision — captains prefer to manage the pool themselves.

**Schema:** `bookings.availability_locked boolean NOT NULL DEFAULT false` — already live.

#### Reliability incident history (both fixes are live on `main`, unverified in production as of this writing)

1. **The weekly cron never fired at all.** `vercel.json` originally had `"schedule": "30 2 * * 4"` (Thursday-only). Vercel Hobby silently accepts day-of-week-restricted cron expressions but never actually invokes them — confirmed empirically, not from docs. See `limitations.md`'s new "Vercel Hobby — Cron Jobs Cannot Restrict Day-of-Week" entry. Fixed by switching to a truly-daily schedule (`"30 2 * * *"` = 08:00 IST every day) plus an in-code IST day-of-week guard in the route that no-ops on any day that isn't Thursday.
2. **Then the daily-fire version got cached.** Once the function *was* being invoked every day, Vercel's logs showed the Supabase REST calls hitting `"Using cache"` on every run — the route looked like it succeeded but the DB update was a silent no-op, for 3 consecutive Thursdays. Fixed with `export const dynamic = 'force-dynamic'` + `export const revalidate = 0` on the route.

**Current schedule:** `"30 2 * * *"` in `vercel.json` (daily; the Thursday restriction lives entirely in `src/app/api/cron/lock-availability/route.ts`'s in-code guard, not the cron expression).

**Open item — not yet done, deliberately deferred:** the club coordinator chose to "wait and watch" the next real Thursday (2026-07-16) rather than pre-emptively add a second, independent trigger. `notifyGCs()` fires on every outcome (success, "nothing locked," or hard error), so a missing push notification by ~8:15 IST that Thursday is itself the signal something broke again. **If it does fail again**, the proposed fix (agreed but not yet built) is a redundant **GitHub Actions scheduled workflow** hitting the same endpoint with a real weekly cron expression — GitHub Actions supports day-of-week restriction natively, unlike Vercel Hobby, and the route is idempotent so a second trigger is safe to add without removing the first. There's also a minor, non-urgent correctness smell in the route worth fixing whenever this is revisited: the Thursday-check uses an IST-shifted clock (`nowIST`) but the Saturday/Sunday date math a few lines below it uses the unshifted `now` — harmless at exactly 02:30 UTC firing time, but an inconsistency that shouldn't be there.

**Vibe-security check:** `checkFreeze()` runs entirely server-side in the API route — client flags are never trusted. Ref: `authentication.md`.
 
---
 
## 🟠 High — External Dependencies (continued)
 
*(no new external-dependency items from this batch)*
 
---
 
## 🟡 Medium — User Experience
 
### U-1 · CricHeroes hyperlinks wherever player names appear (UX consistency)
**Status:** ✅ Implemented in `CaptainsCornerGrid` and `FixturesCard` squad panel. Prompt instruction added to all future Claude Code handoffs to hyperlink player names wherever `cricheroes_url` is set.

**Pending locations:**
- Availability grid (player name column)
- GC Review fairness table
- WhatsApp announcement text (plain text — use `(CricHeroes: <url>)` suffix if set)
- Admin player list
**Pattern:**
```tsx
{player.cricheroes_url ? (
  <a href={player.cricheroes_url} target="_blank" rel="noopener noreferrer"
     onClick={e => e.stopPropagation()}>
    {player.name}
  </a>
) : player.name}
```
 
---

 ### ✅ Match Fee + Wallet Projection — Completed June 2026
- `tournaments.match_fee` (integer) — total organiser fee per match
- `bookings.match_fee_override` (integer, nullable) — per-game override
- Fee-per-player derived server-side: `Math.ceil(baseFee / nonExemptCount)` with live exemption check
- Shown on fixture card squad panel after squad announced
- Logged-in player's projected wallet balance shown if non-exempt and in squad
- `POST /api/fees/apply` now pulls fee from DB — removed runtime `fee_per_player` param
- Migrations: 022, 023, 024
- RLS policy added: `squad_fee_exemption_read` — announced squad exemptions readable by authenticated users
---

### U-2 · `/join` route for unmatched Gmail users
**File:** `src/components/SiteNav.tsx` links to `/join` — **currently a dead link**.
**Status:** ❌ Page does not exist.
 
**Fix:** Create `src/app/join/page.tsx` with a simple "Your Gmail is not yet linked to a Spartans profile — contact the coordinator" page with Muthu's WhatsApp link.
 
---
 
### U-3 · WhatsApp nudge to GC on squad submission
**Status:** ✅ Implemented. `handleSubmit()` in `CaptainsCornerGrid.tsx` opens a pre-filled `wa.me` link after a successful submit — captain picks the GC group as recipient.
 
---
 
### U-4 · WhatsApp nudge to captain on GC approve/return
**Status:** ✅ Implemented. `GCReviewClient.tsx` shows a "Notify captain" WhatsApp button after both `approved` and `returned` decisions, with a re-notify option for squads approved in a prior session.
 
---
 
### U-5 · Logo `href` correction in SiteNav
**File:** `src/components/SiteNav.tsx`
**Fix (1 line):** Change logo `href` from `/schedule` to `/`.
 
---
 
### U-6 · Shareable match card — native share button
**Status:** ✅ Closed — won't do. The `🔗 share match` link on `FixturesCard` navigates to `/fixtures/[id]` which is sufficient. The standalone page already has a "← All fixtures" back link. Modern mobile browsers provide a native share button in the browser chrome. `ShareMatchButton.tsx` is not needed.
 
---
 
### U-7 · Squad panel on standalone `/fixtures/[id]` page — end-to-end verification
**Status:** ⚠️ `jersey_name`, `jersey_number`, `primary_skill` are fetched in the query but need a manual end-to-end check that the squad collapse/expand panel renders correctly on the shareable page (not just the main fixtures grid).
 
---
 
### U-8 · Admin full schedule view (`/admin/schedule`)
**Status:** ❌ Nav entry exists; page not yet built.
 
---
 
### U-9 · Rule violation badges on admin dashboard
**Status:** ❌ Spec calls for red badges on bookings that now violate rules — not implemented.
 
---
 
### U-10 · Filter by captain / tournament / month on admin dashboard
**Status:** ❌ Specified in TDD; not yet built.
 
---
 
### U-11 · Audit log UI for captain availability changes
**Status:** ❌ API exists (`GET /api/captain/availability`) but no admin UI surface.
 
---
 
### U-12 · Player sign-up / onboarding page for new members
**Status:** ❌ No self-service registration flow. New players must be manually added by admin.
 
**Design:**
- `/join` page (replaces the current dead link — see U-2) becomes a proper sign-up form.
- Flow: Player signs in with Google OAuth → if `gmail_id` not found in `players` table → redirect to `/join` → player fills in name, WhatsApp, jersey name/number, skill, DOB → `POST /api/players/register` creates a row with `status = 'pending'` and `active = false`.
- Admin sees pending registrations in `/admin/players` with an Approve / Reject action.
- On approval: `status = 'active'`, `active = true`, WhatsApp confirmation nudge to player.
**Security note (vibe-security):** The `/api/players/register` route must NOT require `requireAdmin()` (it's unauthenticated in the sense that the player has no `playerId` yet) but must be rate-limited by IP and validate all fields with Zod before insert. `is_captain`, `is_gc`, `wallet_balance` must be hardcoded to `false / 0` server-side — never taken from the request body.
 
---
 
### U-13 · Captains Corner "taken elsewhere" ghost bug on squad re-edit
**Status:** 🐛 Bug. When a squad is approved with an O/E player included, then re-edited after GC return (or re-opened), deselecting that player still shows them as "taken elsewhere" in the cross-slot blocking UI.
 
**Root cause:** `allSelected` state is initialised from the saved squad rows including the O/E player. When the player is deselected, the local state is updated but the cross-slot `allSelected` lifted state still contains their `player_id` from the initial load until a full re-render.
 
**Fix:** When a player is deselected in `SelectablePlayerRow`, explicitly remove them from `allSelected` at the grid level — not just from the local slot's selected list. The existing `isoWeekKey()` cross-slot logic will then correctly un-block them. Ensure Y-response exemption check runs after the removal.
 
---
 
### U-14 · Site navigation revamp
**Status:** ❌ Current nav is flat — Captains Corner is a top-level item alongside Fixtures and Schedule.
 
**Proposed structure:**
 
| Role | Nav items |
|---|---|
| Public (not signed in) | Schedule · Sign In |
| Player | Fixtures · My Profile |
| Captain | Fixtures (with Captains Corner submenu) · My Profile |
| GC | Fixtures · GC Review · My Profile |
| Admin | Fixtures · Schedule · Admin ▾ (Dashboard, Players, Bookings, Tournaments) · My Profile |
 
**Notes:**
- Players who are signed in should not see Schedule (it's the public-facing slot grid for organisers).
- Captains Corner becomes a submenu/tab within Fixtures or a slide-out panel — not a separate top-level link.
- "My Profile" consolidates the current separate Profile and Edit Profile links (see U-15).
- Mobile drawer should mirror the same hierarchy.
---
 
### U-15 · Profile page — consolidate "Profile" and "Edit Profile" nav duplication
**Status:** ⚠️ `/profile` currently goes directly to an edit form. SiteNav has both a "Profile" and potentially an "Edit Profile" link pointing to the same place.
 
**Proposed fix:**
- `/profile` → read-only profile view (name, jersey, skills, CricHeroes link, stats summary once available).
- "Edit" button on the profile page opens an inline edit mode or navigates to `/profile/edit`.
- Remove the duplicate nav entry; a single "My Profile" link in the nav is enough.
---
 
### U-16 · Player profile — home location (carpool opt-in)
**Status:** ❌ Not in schema.
 
**Design:**
- New optional field: `players.home_location_url` (Google Maps share link — player pastes it themselves).
- New boolean: `players.home_location_consent` (default `false`). Player must explicitly opt in on `/profile` before the URL is shown to anyone.
- **Display rule:** `home_location_url` is shown on the match squad page ONLY if `home_location_consent = true`. Captains, GC, and Admin can always see it regardless of consent (emergency use).
- Player editable; consent toggle is on `/profile` with clear explanatory text ("Your home area will be visible to other squad members to help with carpooling").
**Schema:**
```sql
ALTER TABLE players
  ADD COLUMN home_location_url  text,
  ADD COLUMN home_location_consent boolean NOT NULL DEFAULT false;
```
 
**Security (vibe-security):** The API must enforce the consent flag server-side when returning squad data to non-privileged players — never rely on the client to filter it out. Ref: `data-access.md`.
 
---
 
### U-17 · Player profile — emergency contact
**Status:** ❌ Not in schema.
 
**Design:**
- New optional fields: `players.emergency_contact_name`, `players.emergency_contact_phone`, `players.emergency_contact_relation`.
- Visible only to Captains, GC, and Admin — not to the player's fellow squad members.
- Player editable on `/profile`.
- Shown in: Admin player detail view, Captains Corner player card (on expand), GC review player detail.
**Schema:**
```sql
ALTER TABLE players
  ADD COLUMN emergency_contact_name     text,
  ADD COLUMN emergency_contact_phone    text,
  ADD COLUMN emergency_contact_relation text;
```
 
**Security:** Emergency contact fields must be excluded from the general player API response for non-privileged roles. Add to a separate `sensitiveFields` allowlist that requires `isCaptain || isGC || isAdmin` check server-side.
 
---
 
### U-18 · Squad selection — skill role badges replacing text skill display
**Status:** ❌ Current squad selection shows skill as text (e.g. "Right-arm fast"). Replace with icon badges.
 
**Design:**
- Four selectable role badges per player row (alongside C / VC / WK):
  - 🏏 **BAT** — Batsman
  - 🎳 **BOWL** — Bowler
  - 🏏🎳 **BAT-AR** — Batting Allrounder (bat dominant)
  - 🎳🏏 **BOWL-AR** — Bowling Allrounder (bowl dominant)
- Badges are mutually exclusive (only one role per player per squad row).
- WK **cannot** be BOWL or BOWL-AR — UI should disable those combinations and the API should reject them.
- Pre-populate from `players.primary_skill` on load; captain can override for this specific match.
- Store as `squad.match_role` enum column: `bat | bowl | bat_ar | bowl_ar`.
**Schema:**
```sql
ALTER TABLE squad ADD COLUMN match_role text CHECK (match_role IN ('bat','bowl','bat_ar','bowl_ar'));
-- WK constraint enforced at API level, not DB level (simpler)
```
 
---
 
### U-19 · Schedule export — filter to future slots only
**Status:** 🐛 Bug. "Export available slots" on `/schedule` includes past unbooked slots.
 
**File:** Wherever the export query runs (likely `src/app/schedule/page.tsx` or `/api/schedule/export`).
 
**Fix (1 line):** Add `gte('game_date', new Date().toISOString().split('T')[0])` to the Supabase query before exporting.
 
---
 
### U-20 · Match page (shareable fixture card) — implement designed wireframe
**Status:** ❌ Wireframe and design spec were completed and discussed but the page has not been pushed to the repo.
 
**Scope (from prior design session):**
- Pretty URL slugs: `/fixtures/[slug]` where slug is human-readable (`2026-04-05-t20-dlc`) with UUID fallback for backward compatibility.
- Richer player profile cards in squad panel (jersey number, skill badge, CricHeroes link).
- No sign-in prompt shown on the public share view.
- Squad announce action and WhatsApp share icon on the match card (see U-21).
**Action:** Push the designed wireframe and component scaffolding to the repo as a starting point before implementing.
 
---
 
### U-21 · Announce squad button and WhatsApp share icon on match card
**Status:** ❌ Discussed and designed but not implemented.
 
**Design:**
- On the match card (Captains Corner view, post-approval): an "Announce" button that triggers `POST /api/squad/announce`.
- Once announced: the "Announce" button is replaced by a WhatsApp share icon (📲) that opens the pre-filled `wa.me` link with `buildSquadAnnouncement()` text.
- The WhatsApp icon should also be accessible from the standalone match page (`/fixtures/[id]`) for captains and admins.
---
 ### U-28 · The Dugout — Kit Room (Jersey Orders)
**Status:** ❌ Not built — spec finalised June 2026

**Route:** `/dugout` → Kit Room tab (all signed-in players)
**Admin route:** `/admin/dugout/kit-room` (Admin + GC view)

**Design:**
- Profile completeness gate: player must have `jersey_name` and `jersey_number` set on their profile before placing an order. If not set, Kit Room shows a prompt linking to `/profile`.
- `/profile` shows a reciprocal nudge — *"Want to order your jersey? Head to the Kit Room →"* — when `jersey_name` and `jersey_number` are filled.
- Order form pre-fills `jersey_name` and `jersey_number` from player profile. Player selects size (`XS/S/M/L/XL/XXL`) and adds optional notes.
- One active order per player at a time (`pending` / `submitted` / `delivered` states). Fresh order allowed once previous reaches `received`.
- Soft batch date: admin sets a next-order date shown to players at order time ("Next order tentatively submits around DD MMM"). Informational only — no hard block.

**Order lifecycle:**
**Admin / GC compiled view (`/admin/dugout/kit-room`):**
- Filterable table of all orders by status
- Admin sets / updates next batch date
- Admin drives `submitted` and `delivered` status transitions
- Admin sends WhatsApp nudge manually on `delivered` (pre-filled message, same pattern as squad announcements)
- GC can view all orders but cannot change status

**Schema:**
```sql
CREATE TYPE jersey_order_status AS ENUM ('pending','submitted','delivered','received');

CREATE TABLE jersey_orders (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  player_id       uuid NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  jersey_name     text NOT NULL,
  jersey_number   integer NOT NULL CHECK (jersey_number BETWEEN 0 AND 999),
  jersey_size     text NOT NULL CHECK (jersey_size IN ('XS','S','M','L','XL','XXL')),
  notes           text,
  status          jersey_order_status NOT NULL DEFAULT 'pending',
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

-- One active order per player (pending/submitted/delivered)
CREATE UNIQUE INDEX one_active_order_per_player
  ON jersey_orders(player_id)
  WHERE status IN ('pending','submitted','delivered');

-- Soft batch date — single-row settings table
CREATE TABLE dugout_settings (
  id                    integer PRIMARY KEY DEFAULT 1 CHECK (id = 1), -- enforces single row
  kit_room_batch_date   date,
  updated_at            timestamptz NOT NULL DEFAULT now()
);
INSERT INTO dugout_settings(id) VALUES (1) ON CONFLICT DO NOTHING;

ALTER TABLE jersey_orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE dugout_settings ENABLE ROW LEVEL SECURITY;
-- No anon/authenticated policies — service role only, consistent with platform pattern
```

**API routes:**
**Admin / GC compiled view (`/admin/dugout/kit-room`):**
- Filterable table of all orders by status
- Admin sets / updates next batch date
- Admin drives `submitted` and `delivered` status transitions
- Admin sends WhatsApp nudge manually on `delivered` (pre-filled message, same pattern as squad announcements)
- GC can view all orders but cannot change status

✅ Push Notifications — Squad Announcement

Status: ✅ Implemented June 2026

What was built:


push_subscriptions table (migration 009)
src/lib/webpush.ts — sendPushToPlayer utility
POST /api/push/subscribe — opt-in endpoint
public/sw.js — updated with push + notificationclick handlers
Subscribe button on /profile with persistent subscription check via useEffect
Squad announce route hooks — squad players + GC notified on every announce


Key gotchas discovered during implementation:


VAPID_EMAIL must have mailto: prefix — without it every push silently fails
VAPID setVapidDetails() must be called inside the function, not at module level (Vercel build fails otherwise)
Push block must be awaited before returning response — fire-and-forget IIFEs are killed by Vercel before completing
sw.js precache list must not include non-existent assets — cache.addAll() fails entirely if any URL returns non-200
/fixtures must not be precached — auth-aware page served from cache shows signed-out state
iPhone requires PWA installed from Home Screen + iOS 16.4+ for web push to work


Future triggers to add (when S-1 wallet route is built):


Wallet topped up
Match fee debited
Wallet below zero


Full spec: see push_notifications.md

**Schema:**
```sql
CREATE TYPE jersey_order_status AS ENUM ('pending','submitted','delivered','received');

CREATE TABLE jersey_orders (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  player_id       uuid NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  jersey_name     text NOT NULL,
  jersey_number   integer NOT NULL CHECK (jersey_number BETWEEN 0 AND 999),
  jersey_size     text NOT NULL CHECK (jersey_size IN ('XS','S','M','L','XL','XXL')),
  notes           text,
  status          jersey_order_status NOT NULL DEFAULT 'pending',
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

-- One active order per player (pending/submitted/delivered)
CREATE UNIQUE INDEX one_active_order_per_player
  ON jersey_orders(player_id)
  WHERE status IN ('pending','submitted','delivered');

-- Soft batch date — single-row settings table
CREATE TABLE dugout_settings (
  id                    integer PRIMARY KEY DEFAULT 1 CHECK (id = 1), -- enforces single row
  kit_room_batch_date   date,
  updated_at            timestamptz NOT NULL DEFAULT now()
);
INSERT INTO dugout_settings(id) VALUES (1) ON CONFLICT DO NOTHING;

ALTER TABLE jersey_orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE dugout_settings ENABLE ROW LEVEL SECURITY;
-- No anon/authenticated policies — service role only, consistent with platform pattern
```

**API routes:**
**Security (vibe-security):**
- `player_id` sourced from server session only
- IDOR check on PATCH — only owner or admin can deactivate
- Share link route (`GET /api/dugout/gear/[id]`) requires valid session — no public access
- Rate limited: 5 listings per player per hour
- Zod validation on all inputs including `condition` cross-field rule
- RLS enabled, no anon/authenticated policy — service role only
**Phase 4b — The Dugout (after nav revamp)**
```
U-28  Kit Room — DB migration + API + player UI + admin compiled view (2–3 days)
U-29  Gear Exchange — DB migration + API + UI + share link (1–2 days)
```
## 🟢 Low — Optimisations & Housekeeping
 
### L-1 · `Promise.all` in `getPlayerData`
**File:** `src/app/page.tsx` (or wherever `getPlayerData` lives)
Queries 2 and 3 are independent — running them in parallel reduces TTFB on the home page.
 
---
 
### L-2 · Merge duplicate `bookings` queries in `getPlayerData`
Queries 3 and 4 both hit `bookings` — can be merged with the pending count derived from the same result set.
 
---
 
### L-3 · Seed `photo_url` for existing players
Players who signed in before the `auth.ts` photo-seeding change won't have `photo_url` until their next sign-in. Passive approach is fine; no migration needed.
 
---
 
### L-4 · CricHeroes post-match stats via `bookings.match_id`
**Status:** ✅ Done — July 2026. Shipped as the full post-match scorecard integration (manual upload + automated CricHeroes fetch, daily cron, `/matches/history` display). See `features/post-match-scorecard.md`.
 
---
 
### L-5 · Automated WhatsApp announcements
**Sprint 5.** Requires WhatsApp Business API. Current manual copy/share flow is intentional.
 
---
 
## Recommended Execution Order
 
**Phase 1 — Quick security wins (< 1 day total)**
```
S-4  array cap (5 min)
S-5  NEXTAUTH_URL env var (5 min)
S-6  email lowercase normalisation — SQL migration + auth.ts fix (30 min)
S-7  session maxAge alignment (15 min)
```
 
**Phase 2 — Security hardening (1–2 days)**
```
S-2  rate limiting on remaining routes (2 hrs — utility already exists)
S-3  Zod validation library + schemas (2–3 hrs)
S-1  wallet transaction route (2 hrs)
S-8  availability lock (Thursday cron + DB column + API guard) (3–4 hrs)
```
 
**Phase 3 — High-impact bug fixes & quick UX (< 1 day)**
```
U-13  taken-elsewhere ghost bug in squad re-edit (1–2 hrs)
U-19  schedule export future-only filter (15 min)
E-4   GC ground join (30 min)
U-5   logo href fix (5 min)
U-6   NEXT_PUBLIC_BASE_URL env var (10 min)
```
 
**Phase 4 — Navigation revamp (1 day)**
```
U-14  site nav restructure (role-based hierarchy, submenu for Captains Corner)
U-15  profile page consolidation (read-only + edit mode)
U-2   /join dead link → becomes U-12 sign-up page entry point
```
 
**Phase 5 — Player profile extensions (1–2 days)**
```
U-12  player sign-up / onboarding flow (requires S-3 Zod first)
U-16  home location + carpool consent (schema + API + UI)
U-17  emergency contact (schema + API + privileged display)
```
 
**Phase 6 — Match page & squad UX (2–3 days)**
```
U-20  match page wireframe → push to repo → implement
U-21  announce button + WhatsApp share icon on match card
U-18  squad role badges (bat/bowl/allrounder icons replacing text)
U-7   squad panel on /fixtures/[id] end-to-end verification
```
 
**Phase 7 — Remaining UX & notifications**
```
U-1   CricHeroes hyperlinks in remaining locations
U-3 + U-4  WhatsApp nudges (GC on submit, captain on approve/return)
U-8   admin schedule view
U-9   rule violation badges
U-10  admin dashboard filters
U-11  audit log UI
```
 
**Phase 8 — External dependencies (ongoing)**
```
E-3   CricHeroes URL backfill (manual, coordinator task)
E-2   GitHub / Vercel / Supabase ownership transfer (ops)
E-1   ✅ closed — superseded by post-match-scorecard integration (July 2026)
```
 
**Phase 9 — Housekeeping**
```
L-1 through L-5
```
 
---
 
*Maintained by: Muthu, Spartans CC BLR Coordinator*
*vibe-security audit applied per SKILL.md — `never trust the client`*